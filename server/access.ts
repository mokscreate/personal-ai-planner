import { randomBytes, createHash } from "node:crypto";
import { networkInterfaces } from "node:os";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Store } from "./store.ts";
export const isLocal = (req: FastifyRequest) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter(
      (x) =>
        x &&
        x.family === "IPv4" &&
        !x.internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address),
    )
    .map((x) => x!.address);
}
export function registerAccess(
  app: FastifyInstance,
  store: Store,
  port: number,
  csrf: string,
  enabled: boolean,
) {
  let pairing: { code: string; expires: number } | null = null;
  const attempts = new Map<string, { at: number; count: number }>();
  const authorized = (req: FastifyRequest) => {
    const raw = String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("planner_device="))
      ?.slice(15);
    return (
      raw &&
      (store.get<Record<string, number>>("lan:devices") || {})[hash(raw)] >
        Date.now()
    );
  };
  app.addHook("onRequest", async (req, reply) => {
    const hostname = req.headers.host?.split(":")[0];
    if (
      !["localhost", "127.0.0.1", ...(enabled ? lanAddresses() : [])].includes(
        hostname || "",
      )
    )
      return reply.code(403).send({ error: "访问地址不允许" });
    const allowedOrigin = `http://${req.headers.host}`;
    if (
      req.headers.origin &&
      req.headers.origin !== allowedOrigin &&
      !(isLocal(req) && req.headers.origin === "http://127.0.0.1:5173")
    )
      return reply.code(403).send({ error: "来源不允许" });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return reply.code(403).send({ error: "不允许跨站请求" });
    const path = req.url.split("?")[0];
    const publicRoute = ["/api/health", "/api/pair"].includes(path);
    if (
      path.startsWith("/api/") &&
      !publicRoute &&
      !isLocal(req) &&
      (!enabled || !authorized(req))
    )
      return reply
        .code(401)
        .send({ error: "请先在电脑上获取配对码，再连接此设备" });
    if (
      (path.startsWith("/api/devices") || path === "/api/shutdown") &&
      !isLocal(req)
    )
      return reply.code(403).send({ error: "请在电脑本机管理设备" });
    if (
      path.startsWith("/api/") &&
      !publicRoute &&
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-planner-token"] !== csrf
    )
      return reply.code(403).send({ error: "会话已更新，请刷新网页" });
    if (path.startsWith("/api/")) reply.header("Cache-Control", "no-store");
  });
  app.get("/api/devices", () => ({
    enabled,
    urls: lanAddresses().map((ip) => `http://${ip}:${port}/connect`),
    count: Object.values(
      store.get<Record<string, number>>("lan:devices") || {},
    ).filter((x) => x > Date.now()).length,
  }));
  app.post("/api/devices/pairing", () => {
    if (!enabled) throw Error("局域网尚未启用");
    pairing = {
      code: randomBytes(6).toString("hex").toUpperCase(),
      expires: Date.now() + 10 * 60 * 1000,
    };
    return pairing;
  });
  app.post("/api/devices/revoke", () => {
    store.set("lan:devices", {});
    pairing = null;
    return { ok: true };
  });
  app.post("/api/pair", (req, reply) => {
    if (!enabled) return reply.code(403).send({ error: "局域网连接未启用" });
    const now = Date.now();
    if (attempts.size > 1000)
      for (const [k, v] of attempts) if (now - v.at > 60000) attempts.delete(k);
    let a = attempts.get(req.ip);
    if (!a || now - a.at > 60000) {
      a = { at: now, count: 0 };
      attempts.set(req.ip, a);
    }
    if (++a.count > 5)
      return reply.code(429).send({ error: "尝试次数过多，请一分钟后重试" });
    const code = String((req.body as any)?.code || "")
      .replace(/\s/g, "")
      .toUpperCase();
    if (!pairing || pairing.expires < now || code !== pairing.code)
      return reply
        .code(401)
        .send({ error: "配对码不正确或已过期，请在电脑上重新生成" });
    pairing = null;
    const secret = randomBytes(32).toString("hex");
    const devices = store.get<Record<string, number>>("lan:devices") || {};
    for (const k of Object.keys(devices))
      if (devices[k] < now) delete devices[k];
    devices[hash(secret)] = now + 30 * 86400000;
    store.set("lan:devices", devices);
    reply.header(
      "Set-Cookie",
      `planner_device=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`,
    );
    return { ok: true };
  });
  app.get("/connect", (_req, reply) =>
    reply
      .type("text/html; charset=utf-8")
      .send(
        `<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接间序工作台</title><style>body{font:16px system-ui;background:#f5f7f3;color:#285747;margin:0;padding:24px}main{max-width:380px;margin:10vh auto}input,button{font:inherit;box-sizing:border-box;width:100%;padding:14px;margin-top:18px;border:1px solid #cbd8cc;border-radius:10px}button{background:#285747;color:white}p{line-height:1.7}#status{color:#995648}</style><main><h1>连接电脑工作台</h1><p>在电脑网页「设置 → 手机与电脑互通」生成配对码，在这里输入。两端会使用同一份日程和学习记录。</p><form><input name="code" aria-label="配对码" placeholder="输入12位配对码" maxlength="20" required autocomplete="one-time-code"><button>连接</button></form><p id="status" role="status"></p><p>请连接同一 Wi-Fi，电脑需保持开机。配对有效期30天；电脑端可撤销所有手机访问。</p></main><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=document.querySelector('button');b.disabled=true;try{const r=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:e.target.code.value})});const j=await r.json();if(!r.ok)throw Error(j.error);location.replace('/');}catch(e){document.getElementById('status').textContent=e.message;b.disabled=false;}};</script></html>`,
      ),
  );
}
