import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("isolated HTTP flow: image adapter, editable draft, apply, voice adapter, backup and access controls", async () => {
  const dir = mkdtempSync(join(tmpdir(), "planner-api-"));
  let seenImage = false,
    seenAudio = false;
  const provider = createServer(async (req, res) => {
    let body = "";
    for await (const b of req) body += b;
    res.setHeader("Content-Type", "application/json");
    if (req.url?.endsWith("/audio/transcriptions")) {
      seenAudio = body.includes("audio");
      res.end(JSON.stringify({ text: "测试转写文字" }));
      return;
    }
    const input = JSON.parse(body);
    seenImage ||= JSON.stringify(input).includes("data:image/png;base64,");
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "测试适配器返回的草稿，请核对。",
                operations: [
                  {
                    type: "task",
                    value: {
                      id: "new-1",
                      title: "模拟接口测试任务",
                      duration: 30,
                    },
                  },
                ],
              }),
            },
          },
        ],
      }),
    );
  });
  await new Promise<void>((r) => provider.listen(0, "127.0.0.1", r));
  const providerPort = (provider.address() as any).port;
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as any).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      env: { ...process.env, PORT: String(port), PLANNER_DATA_DIR: dir },
      windowsHide: true,
      stdio: "pipe",
    },
  );
  const root = `http://127.0.0.1:${port}/api`;
  let token = "";
  async function request(path: string, body?: any, method?: string) {
    const r = await fetch(root + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: { "Content-Type": "application/json", "x-planner-token": token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = (await r.json()) as any;
    assert.equal(r.ok, true, JSON.stringify(j));
    return j;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("server start timeout")),
        15000,
      );
      child.stdout.on("data", (b) => {
        if (b.toString().includes("Personal AI Planner")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on("exit", (c) => {
        if (c) {
          clearTimeout(timer);
          reject(Error("server exited " + c));
        }
      });
    });
    token = (await request("/session")).token;
    await request(
      "/sql/draft",
      { id: "filter", sql: "SELECT id FROM orders" },
      "PUT",
    );
    assert.equal(
      (await request("/sql/state")).learning.drafts.filter,
      "SELECT id FROM orders",
    );
    assert.equal((await request("/sql/hint", { id: "filter" })).count, 1);
    const result = await request("/sql/run", {
      id: "filter",
      sql: "SELECT id, amount FROM orders WHERE status='paid' AND amount>=100 ORDER BY amount DESC,id",
      submit: true,
    });
    assert.equal(result.passed, true);
    assert.equal(result.learning.attempts[0].hints, 1);
    assert.equal((await request("/backup")).learning.attempts.length, 1);
    const daily = await request("/sql/plan/preview", {
      start: "2099-01-01",
      days: 90,
    });
    assert.equal((await request("/state")).plan.tasks.length, 0);
    await request(
      "/sql/plan",
      { start: "2099-01-01", days: 90, token: daily.token },
      "PUT",
    );
    assert.equal((await request("/sql/state")).learning.studyPlan.days, 90);
    assert.ok((await request("/sql/schedule")).tasks.length > 0);
    await request("/undo", { version: (await request("/state")).plan.version });
    assert.equal((await request("/sql/state")).learning.studyPlan, undefined);
    const early = await fetch(root + "/sql/chapter/intro", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-planner-token": token },
      body: JSON.stringify({
        read: true,
        externalPassed: false,
        evidence: "",
        confirmed: true,
      }),
    });
    assert.equal(early.status, 400);
    await request(
      "/sql/chapter/intro",
      {
        read: true,
        externalPassed: true,
        evidence: "在外部工具运行并检查了users前五行。",
        confirmed: true,
      },
      "PUT",
    );
    assert.equal(
      (await request("/sql/state")).learning.chapters.intro.confirmed,
      true,
    );
    assert.ok(
      (await (await fetch(root + "/sql/practice-file")).text()).includes(
        "CREATE TABLE users",
      ),
    );
    const denied = await fetch(root + "/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(denied.status, 403);
    for (const kind of ["chat", "speech"])
      await request(
        "/config/" + kind,
        { base: `http://127.0.0.1:${providerPort}/v1`, model: "test-only" },
        "PUT",
      );
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ioAAAAAASUVORK5CYII=";
    const image = await request("/images", { mime: "image/png", data: png });
    await request("/chat", { text: "测试草稿生成", images: [image.id] });
    assert.equal(seenImage, true);
    let s = await request("/state");
    assert.equal(s.plan.tasks.length, 0);
    assert.equal(s.drafts.length, 1);
    const d = s.drafts[0];
    d.operations[0].value.title = "用户改过的标题";
    await request(
      "/drafts/" + d.id,
      { revision: d.revision, operations: d.operations },
      "PATCH",
    );
    await request("/drafts/" + d.id + "/apply", { revision: 1 });
    await request("/drafts/" + d.id + "/apply", { revision: 1 });
    s = await request("/state");
    assert.equal(s.plan.tasks.length, 1);
    assert.equal(s.plan.tasks[0].title, "用户改过的标题");
    const transcript = await request("/transcribe", {
      mime: "audio/webm",
      data: Buffer.from("test audio").toString("base64"),
    });
    assert.equal(transcript.text, "测试转写文字");
    assert.equal(seenAudio, true);
    const backup = await request("/backup");
    assert.equal(backup.images.length, 1);
    assert.ok(!JSON.stringify(backup).includes("provider:"));
    await request("/command", {
      version: s.plan.version,
      key: "delete-test",
      operations: [{ type: "deleteTask", id: s.plan.tasks[0].id }],
    });
    await request("/restore", backup);
    s = await request("/state");
    assert.equal(s.plan.tasks[0].title, "用户改过的标题");
    assert.equal(s.messages.length, 2);
  } finally {
    child.kill();
    await new Promise((r) => child.once("exit", r));
    provider.closeAllConnections();
    await new Promise<void>((r) => provider.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
  }
});
