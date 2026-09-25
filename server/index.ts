import { registerEnglish } from "./english-routes.ts";
import { registerCanvas } from "./canvas-routes.ts";
import { englishSchema } from "../shared/english.ts";
import { registerCloudAccess } from "./cloud-access.ts";
import { registerAccess } from "./access.ts";
import { createHash } from "node:crypto";
import { learningSchema } from "./sql-state.ts";
import { registerSql } from "./sql-routes.ts";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { Store } from "./store.ts";
import {
  chat,
  transcribe,
  publicConfigs,
  saveConfig,
  systemPrompt,
  parseResult,
} from "./providers.ts";
import { validatePlan } from "../shared/domain.ts";
const port = Number(process.env.PORT || 4317);
const dir =
  process.env.PLANNER_DATA_DIR ||
  join(process.env.LOCALAPPDATA || process.cwd(), "PersonalAIPlanner");
mkdirSync(join(dir, "images"), { recursive: true });
const store = new Store(dir);
const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 });
const token = randomBytes(32).toString("hex");
let busy = false;
app.setErrorHandler((err: any, _req, reply) => {
  reply.code(400).send({
    error:
      err.name === "ZodError"
        ? "字段格式不正确：" +
          err.issues
            .map((x: any) => x.path.join(".") + " " + x.message)
            .join("；")
        : err.name === "TimeoutError"
          ? "模型请求超时，请重试"
          : err.message || "操作失败",
  });
});
if (process.env.PLANNER_LAN === "1") store.set("lan:enabled", true);
const lanEnabled = store.get("lan:enabled") === true;
const cloud = process.env.PLANNER_CLOUD === "1";
if (cloud) registerCloudAccess(app, store, token);
else registerAccess(app, store, port, token, lanEnabled);
app.get("/api/health", () => ({
  app: "personal-ai-planner",
  version: "0.1.0",
}));
app.get("/api/session", () => ({ token }));
app.get("/api/state", () => ({
  syncRevision: createHash("sha256")
    .update(JSON.stringify(store.get("sql:learning") || {}))
    .digest("hex"),
  plan: store.plan(),
  messages: store.messages(),
  drafts: store.drafts(),
  composer: store.get("composer") || { text: "", images: [] },
  configs: publicConfigs(store),
  dataDir: cloud ? "云端工作台" : dir,
  cloud,
}));
app.post("/api/command", async (req) => {
  const b = req.body as any;
  if (typeof b.key !== "string") throw Error("缺少操作ID");
  return store.command(b.version, b.operations, b.key);
});
app.post("/api/undo", async (req) => store.undo((req.body as any).version));
app.put("/api/composer", async (req) => {
  const b = req.body as any;
  if (
    typeof b.text !== "string" ||
    b.text.length > 30000 ||
    !Array.isArray(b.images) ||
    b.images.length > 4
  )
    throw Error("输入过长或图片过多");
  store.set("composer", b);
  return { ok: true };
});
app.post("/api/images", async (req) => {
  const b = req.body as any;
  if (!["image/png", "image/jpeg", "image/webp"].includes(b.mime))
    throw Error("支持PNG、JPEG、WebP图片");
  const data = Buffer.from(b.data || "", "base64");
  if (data.length > 8 * 1024 * 1024 || data.length < 12)
    throw Error("图片需小于8MB");
  const valid =
    b.mime === "image/png"
      ? data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : b.mime === "image/jpeg"
        ? data[0] === 255 && data[1] === 216
        : data.toString("ascii", 0, 4) === "RIFF" &&
          data.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw Error("图片内容与格式不符");
  const id = randomUUID();
  writeFileSync(join(dir, "images", id), data);
  store.set("image:" + id, { mime: b.mime });
  return { id };
});
function imageData(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("图片ID无效");
  const meta = store.get("image:" + id);
  if (!meta) throw Error("图片不存在");
  return { mime: meta.mime, data: readFileSync(join(dir, "images", id)) };
}
app.get("/api/images/:id", async (req, reply) => {
  const f = imageData((req.params as any).id);
  return reply
    .type(f.mime)
    .header("X-Content-Type-Options", "nosniff")
    .send(f.data);
});
app.post("/api/chat", async (req) => {
  if (busy) throw Error("上一条消息正在处理中");
  const b = req.body as any;
  if (
    typeof b.text !== "string" ||
    b.text.length > 30000 ||
    !Array.isArray(b.images) ||
    b.images.length > 4
  )
    throw Error("消息格式错误");
  if (!b.text.trim() && !b.images.length) throw Error("请输入消息");
  busy = true;
  try {
    const base = store.plan().version;
    const selected = b.images.map((id: string) => {
      const f = imageData(id);
      return {
        type: "image_url",
        image_url: {
          url: `data:${f.mime};base64,${f.data.toString("base64")}`,
        },
      };
    });
    const history = store.messages().slice(-16);
    const recentImages = new Set(history.flatMap((m) => m.images).slice(-4));
    const previous = history.map((m) => ({
      role: m.role,
      content: m.images.some((id: string) => recentImages.has(id))
        ? [
            { type: "text", text: m.content || "此前上传的资料" },
            ...m.images
              .filter((id: string) => recentImages.has(id))
              .map((id: string) => {
                const f = imageData(id);
                return {
                  type: "image_url",
                  image_url: {
                    url:
                      "data:" + f.mime + ";base64," + f.data.toString("base64"),
                  },
                };
              }),
          ]
        : m.content,
    }));
    store.message("user", b.text, b.images);
    const result = await chat(store, [
      {
        role: "system",
        content: systemPrompt({ plan: store.plan(), drafts: store.drafts() }),
      },
      ...previous,
      {
        role: "user",
        content: [
          {
            type: "text",
            text: b.text || "请识别图片中的事项，生成可编辑草稿",
          },
          ...selected,
        ],
      },
    ]);
    const parsed = parseResult(result);
    store.message("assistant", parsed.reply);
    if (parsed.operations.length) {
      const d = store.draft(parsed.operations);
      store.db.prepare("UPDATE drafts SET base=? WHERE id=?").run(base, d.id);
    }
    return { ok: true };
  } catch (e: any) {
    store.message(
      "assistant",
      "请求未完成：" + e.message + "。未修改日历，输入和图片仍保留，可以重试。",
    );
    throw e;
  } finally {
    busy = false;
  }
});
app.patch("/api/drafts/:id", async (req) => {
  const b = req.body as any;
  store.saveDraft((req.params as any).id, b.revision, b.operations);
  return { ok: true };
});
app.post("/api/drafts/:id/apply", async (req) =>
  store.applyDraft((req.params as any).id, (req.body as any).revision),
);
app.post("/api/drafts/:id/recheck", async (req) => {
  store.rebase((req.params as any).id, (req.body as any).revision);
  return { ok: true };
});
app.post("/api/drafts/:id/discard", async (req) => {
  store.db
    .prepare(
      "UPDATE drafts SET status='discarded' WHERE id=? AND status='pending'",
    )
    .run((req.params as any).id);
  return { ok: true };
});
app.put("/api/config/:kind", async (req) => {
  saveConfig(store, (req.params as any).kind, req.body as any);
  return { ok: true };
});
app.delete("/api/config/:kind", async (req) => {
  const k = (req.params as any).kind;
  if (!["chat", "speech"].includes(k)) throw Error("类型无效");
  store.db.prepare("DELETE FROM kv WHERE key=?").run("provider:" + k);
  return { ok: true };
});
app.post("/api/test-chat", async () => ({
  text: await chat(store, [{ role: "user", content: "请只回答：连接成功" }]),
}));
app.post("/api/test-vision", async (req) => {
  const f = imageData((req.body as any).id);
  return {
    text: await chat(store, [
      {
        role: "user",
        content: [
          { type: "text", text: "请简短描述这张测试图片。不要生成日程。" },
          {
            type: "image_url",
            image_url: {
              url: `data:${f.mime};base64,${f.data.toString("base64")}`,
            },
          },
        ],
      },
    ]),
  };
});
app.post("/api/transcribe", async (req) => {
  const b = req.body as any;
  if (typeof b.mime !== "string" || !/^audio\/(webm|mp4|ogg|wav)/.test(b.mime))
    throw Error("录音格式不支持");
  const data = Buffer.from(b.data || "", "base64");
  if (!data.length || data.length > 15 * 1024 * 1024)
    throw Error("录音为空或过大");
  return { text: await transcribe(store, data, b.mime) };
});
function exportBackup() {
  const images = readdirSync(join(dir, "images"))
    .filter((id) => store.get("image:" + id))
    .map((id) => ({
      id,
      mime: store.get("image:" + id).mime,
      data: readFileSync(join(dir, "images", id)).toString("base64"),
    }));
  return {
    learning: store.get("sql:learning") || null,
    english: store.get("english") || null,
    audioBackupNote:
      "课堂录音原文件另存于工作台数据目录的audio文件夹，本JSON不包含录音",
    format: "personal-ai-planner",
    schema: 1,
    exported: new Date().toISOString(),
    plan: store.plan(),
    messages: store.messages(),
    drafts: store.drafts(),
    composer: store.get("composer"),
    images,
  };
}
app.get("/api/backup", exportBackup);
app.post("/api/restore", { bodyLimit: 200 * 1024 * 1024 }, async (req) => {
  const b = req.body as any;
  if (b.format !== "personal-ai-planner" || b.schema !== 1)
    throw Error("备份格式不正确");
  validatePlan(b.plan);
  if (b.english) englishSchema.parse(b.english);
  if (
    (b.images || []).some(
      (i: any) =>
        !/^[a-f0-9-]{36}$/.test(i.id) ||
        !["image/png", "image/jpeg", "image/webp"].includes(i.mime),
    )
  )
    throw Error("附件格式错误");
  const messages = b.messages || [],
    drafts = b.drafts || [],
    composer = b.composer || { text: "", images: [] };
  if (
    !Array.isArray(messages) ||
    !Array.isArray(drafts) ||
    typeof composer.text !== "string" ||
    !Array.isArray(composer.images)
  )
    throw Error("备份结构无效");
  for (const m of messages)
    if (
      !["user", "assistant"].includes(m.role) ||
      typeof m.content !== "string" ||
      !Array.isArray(m.images)
    )
      throw Error("对话备份无效");
  for (const d of drafts)
    if (!Array.isArray(d.operations) || d.operations.length > 100)
      throw Error("草稿备份无效");
  const files = (b.images || []).map((i: any) => ({
    ...i,
    bytes: Buffer.from(i.data, "base64"),
  }));
  for (const i of files) {
    if (i.bytes.length > 8 * 1024 * 1024) throw Error("备份图片过大");
    const path = join(dir, "images", i.id);
    if (existsSync(path) && !readFileSync(path).equals(i.bytes))
      throw Error("备份图片ID与已有文件冲突");
  }
  const available = new Set(files.map((i: any) => i.id));
  for (const id of [
    ...composer.images,
    ...messages.flatMap((m: any) => m.images),
  ])
    if (!available.has(id) && !store.get("image:" + id))
      throw Error("备份缺少来源图片");
  mkdirSync(join(dir, "backups"), { recursive: true });
  writeFileSync(
    join(dir, "backups", "before-restore-" + Date.now() + ".json"),
    JSON.stringify(exportBackup()),
  );
  // Files are immutable; write before transaction. A failed transaction leaves only unreferenced files.
  for (const i of files)
    if (!existsSync(join(dir, "images", i.id)))
      writeFileSync(join(dir, "images", i.id), i.bytes);
  store.transaction(() => {
    const restored = validatePlan(b.plan);
    restored.version = store.plan().version + 1;
    store.set("plan", restored);
    store.db.exec(
      "DELETE FROM messages; DELETE FROM drafts; DELETE FROM history; DELETE FROM requests;",
    );
    for (const i of files) store.set("image:" + i.id, { mime: i.mime });
    for (const m of messages) store.message(m.role, m.content, m.images);
    for (const d of drafts) store.draft(d.operations);
    store.set("composer", composer);
    if (b.english) store.set("english", englishSchema.parse(b.english));
    if (b.learning) store.set("sql:learning", learningSchema.parse(b.learning));
  });
  return { ok: true };
});
registerSql(app, store);
registerEnglish(app, store);
registerCanvas(app, store);
app.post("/api/shutdown", async () => {
  setTimeout(() => {
    app.close().then(() => {
      store.close();
      process.exit(0);
    });
  }, 300);
  return { ok: true };
});
if (existsSync(resolve("dist")))
  await app.register(fastifyStatic, { root: resolve("dist") });
await app.listen({ port, host: cloud || lanEnabled ? "0.0.0.0" : "127.0.0.1" });
console.log(`Personal AI Planner http://127.0.0.1:${port}`);
