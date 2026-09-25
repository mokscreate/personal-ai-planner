import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import { registerAccess } from "../server/access.ts";
test("LAN pairing protects reads, images and writes; code is single use; revoked devices lose access", async () => {
  const dir = mkdtempSync(join(tmpdir(), "planner-lan-"));
  const store = new Store(dir);
  const app = Fastify();
  registerAccess(app, store, 4317, "csrf-test", true);
  app.get("/api/state", () => ({ private: true }));
  app.get("/api/images/x", () => ({ private: true }));
  app.post("/api/write", () => ({ ok: true }));
  const remote = {
    remoteAddress: "192.168.68.99",
    headers: { host: "127.0.0.1:4317" },
  };
  try {
    assert.equal(
      (await app.inject({ ...remote, url: "/api/state" })).statusCode,
      401,
    );
    assert.equal(
      (await app.inject({ ...remote, url: "/api/images/x" })).statusCode,
      401,
    );
    const code = (
      await app.inject({
        url: "/api/devices/pairing",
        method: "POST",
        remoteAddress: "127.0.0.1",
        headers: { host: "localhost:4317", "x-planner-token": "csrf-test" },
        payload: {},
      })
    ).json().code;
    assert.equal(typeof code, "string");
    const paired = await app.inject({
      ...remote,
      url: "/api/pair",
      method: "POST",
      payload: { code },
    });
    assert.equal(paired.statusCode, 200);
    const cookie = String(paired.headers["set-cookie"]).split(";")[0];
    assert.equal(
      (
        await app.inject({
          ...remote,
          url: "/api/pair",
          method: "POST",
          payload: { code },
        })
      ).statusCode,
      401,
    );
    const auth = { ...remote, headers: { ...remote.headers, cookie } };
    assert.equal(
      (await app.inject({ ...auth, url: "/api/state" })).statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ ...auth, url: "/api/devices" })).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          ...auth,
          url: "/api/write",
          method: "POST",
          payload: {},
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          ...auth,
          headers: { ...auth.headers, "x-planner-token": "csrf-test" },
          url: "/api/write",
          method: "POST",
          payload: {},
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          ...auth,
          headers: { ...auth.headers, origin: "http://evil.invalid" },
          url: "/api/state",
        })
      ).statusCode,
      403,
    );
    await app.inject({
      url: "/api/devices/revoke",
      method: "POST",
      remoteAddress: "127.0.0.1",
      headers: { host: "localhost:4317", "x-planner-token": "csrf-test" },
      payload: {},
    });
    assert.equal(
      (await app.inject({ ...auth, url: "/api/state" })).statusCode,
      401,
    );
  } finally {
    await app.close();
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
