import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import { registerCloudAccess } from "../server/cloud-access.ts";
import { saveConfig, config } from "../server/providers.ts";

test("cloud requires login even on loopback, verifies origin and CSRF, revokes logout, encrypts credentials", async () => {
  const keys = [
    "PLANNER_CLOUD",
    "PLANNER_PUBLIC_ORIGIN",
    "PLANNER_LOGIN_PASSWORD",
    "PLANNER_MASTER_KEY",
  ];
  const before = keys.map((k) => process.env[k]);
  process.env.PLANNER_CLOUD = "1";
  process.env.PLANNER_PUBLIC_ORIGIN = "https://planner.example.com";
  process.env.PLANNER_LOGIN_PASSWORD = "test-only-password-123";
  process.env.PLANNER_MASTER_KEY = "a".repeat(64);
  const dir = mkdtempSync(join(tmpdir(), "planner-cloud-"));
  const store = new Store(dir),
    app = Fastify();
  try {
    registerCloudAccess(app, store, "csrf");
    app.get("/api/state", () => ({ private: true }));
    app.post("/api/write", () => ({ ok: true }));
    const headers = {
      host: "planner.example.com",
      origin: "https://planner.example.com",
    };
    assert.equal(
      (
        await app.inject({
          url: "/api/state",
          headers,
          remoteAddress: "127.0.0.1",
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/login",
          method: "POST",
          headers,
          payload: { password: "wrong" },
        })
      ).statusCode,
      401,
    );
    const login = await app.inject({
      url: "/api/login",
      method: "POST",
      headers,
      payload: { password: process.env.PLANNER_LOGIN_PASSWORD },
    });
    assert.equal(login.statusCode, 200);
    const raw = String(login.headers["set-cookie"]);
    assert.match(raw, /Secure; HttpOnly; SameSite=Strict/);
    const auth = { ...headers, cookie: raw.split(";")[0] };
    assert.equal(
      (await app.inject({ url: "/api/state", headers: auth })).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/state",
          headers: { ...auth, origin: "https://evil.example" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/write",
          method: "POST",
          headers: auth,
          payload: {},
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/write",
          method: "POST",
          headers: { ...auth, "x-planner-token": "csrf" },
          payload: {},
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/shutdown",
          method: "POST",
          headers: { ...auth, "x-planner-token": "csrf" },
          payload: {},
        })
      ).statusCode,
      403,
    );
    saveConfig(store, "chat", {
      base: "https://api.example.com",
      model: "test",
      key: "test-secret",
    });
    assert.equal(config(store, "chat").key, "test-secret");
    assert.equal(
      JSON.stringify(store.get("provider:chat")).includes("test-secret"),
      false,
    );
    process.env.PLANNER_MASTER_KEY = "b".repeat(64);
    assert.throws(() => config(store, "chat"));
    await app.inject({
      url: "/api/logout",
      method: "POST",
      headers: { ...auth, "x-planner-token": "csrf" },
      payload: {},
    });
    assert.equal(
      (await app.inject({ url: "/api/state", headers: auth })).statusCode,
      401,
    );
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
    keys.forEach((k, i) => {
      if (before[i] === undefined) delete process.env[k];
      else process.env[k] = before[i];
    });
  }
});
