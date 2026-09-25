import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Store } from "./store.ts";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function registerCloudAccess(
  app: FastifyInstance,
  store: Store,
  csrf: string,
) {
  const origin = process.env.PLANNER_PUBLIC_ORIGIN || "";
  const password = process.env.PLANNER_LOGIN_PASSWORD || "";
  if (
    !/^https:\/\/[^/]+$/.test(origin) ||
    password.length < 16 ||
    !/^[a-f0-9]{64}$/i.test(process.env.PLANNER_MASTER_KEY || "")
  )
    throw Error(
      "云端启动需要 HTTPS 公网地址、至少16位登录密码及64位十六进制加密密钥",
    );
  const credential = hash(password);
  let failed = 0,
    resetAt = 0;
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "same-origin");
    const path = req.url.split("?")[0];
    if (path === "/api/health" && req.method === "GET") return;
    if (
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return reply.code(403).send({ error: "来源不允许" });
    if (["/connect", "/api/login"].includes(path)) return;
    if (!path.startsWith("/api/")) return;
    const cookie = String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("__Host-planner="))
      ?.slice(15);
    const sessions =
      store.get<Record<string, { expires: number; credential: string }>>(
        "cloud:sessions",
      ) || {};
    const entry = cookie ? sessions[hash(cookie)] : undefined;
    if (!entry || entry.expires < Date.now() || entry.credential !== credential)
      return reply.code(401).send({ error: "请登录你的工作台" });
    if (path === "/api/shutdown" || path.startsWith("/api/devices/"))
      return reply
        .code(403)
        .send({ error: "云端不使用本机配对或关闭服务功能" });
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-planner-token"] !== csrf
    )
      return reply
        .code(403)
        .send({ error: "会话已更新，请重试", code: "SESSION_EXPIRED" });
  });
  app.post("/api/login", (req, reply) => {
    if (Date.now() > resetAt) {
      failed = 0;
      resetAt = Date.now() + 60000;
    }
    if (failed >= 10)
      return reply.code(429).send({ error: "尝试过多，请一分钟后再试" });
    const supplied = String((req.body as any)?.password || "");
    if (
      !timingSafeEqual(Buffer.from(hash(supplied)), Buffer.from(credential))
    ) {
      failed++;
      return reply.code(401).send({ error: "密码不正确" });
    }
    const secret = randomBytes(32).toString("hex");
    const sessions =
      store.get<Record<string, { expires: number; credential: string }>>(
        "cloud:sessions",
      ) || {};
    for (const [key, value] of Object.entries(sessions))
      if (value.expires < Date.now() || value.credential !== credential)
        delete sessions[key];
    sessions[hash(secret)] = {
      expires: Date.now() + 30 * 86400000,
      credential,
    };
    store.set("cloud:sessions", sessions);
    reply.header(
      "Set-Cookie",
      `__Host-planner=${secret}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`,
    );
    return { ok: true };
  });
  app.post("/api/logout", (req, reply) => {
    const cookie = String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("__Host-planner="))
      ?.slice(15);
    const sessions = store.get<Record<string, unknown>>("cloud:sessions") || {};
    if (cookie) delete sessions[hash(cookie)];
    store.set("cloud:sessions", sessions);
    reply.header(
      "Set-Cookie",
      "__Host-planner=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    return { ok: true };
  });
  app.get("/api/devices", () => ({ cloud: true, origin }));
  app.get("/connect", (_req, reply) =>
    reply
      .type("text/html; charset=utf-8")
      .send(
        `<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录间序</title><style>body{font:16px system-ui;background:#f5f7f3;color:#285747;padding:24px}main{max-width:380px;margin:12vh auto}input,button{font:inherit;width:100%;box-sizing:border-box;padding:14px;margin-top:16px;border:1px solid #cbd8cc;border-radius:10px}button{background:#285747;color:white}p{line-height:1.7}</style><main><h1>你的间序工作台</h1><p>手机与电脑使用同一份日程和学习记录。</p><form><input name="password" type="password" aria-label="登录密码" autocomplete="current-password" placeholder="登录密码" required><button>登录</button></form><p role="status" id="status"></p></main><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=document.querySelector('button');button.disabled=true;try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:e.target.password.value})});const j=await r.json();if(!r.ok)throw Error(j.error);location.replace('/');}catch(e){document.getElementById('status').textContent=e.message;button.disabled=false;}};</script></html>`,
      ),
  );
}
