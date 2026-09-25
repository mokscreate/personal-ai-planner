import { test } from "node:test";
import assert from "node:assert/strict";
import { canvasList } from "../server/canvas-routes.ts";
import { canvasDeadline } from "../src/CanvasPanel.tsx";

test("Canvas follows pagination with GET only and refuses off-site credentials", async () => {
  const calls: string[] = [];
  const request = (async (url: any, options: any) => {
    calls.push(String(url));
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    return new Response(JSON.stringify([{ id: calls.length }]), { headers: calls.length === 1 ? { link: '<https://canvas.nus.edu.sg/api/v1/courses?page=2>; rel="next"' } : {} });
  }) as typeof fetch;
  assert.deepEqual(await canvasList("/api/v1/courses", "test-only", request), [{ id: 1 }, { id: 2 }]);
  let count = 0;
  const unsafe = (async () => { count++; return new Response("[]", { headers: { link: '<https://example.org/api/v1/courses>; rel="next"' } }); }) as typeof fetch;
  await assert.rejects(canvasList("/api/v1/courses", "test-only", unsafe), /不允许/);
  assert.equal(count, 1);
});
test("Canvas reports authentication failure without returning token or response body", async () => {
  await assert.rejects(canvasList("/api/v1/courses", "secret", (async () => new Response("secret", { status: 401 })) as typeof fetch), /令牌无效或已过期/);
});
test("Canvas deadlines use Singapore day boundaries and retain absent deadlines", () => {
  assert.deepEqual(canvasDeadline("2026-10-04T15:59:00Z"), { date: "2026-10-04", time: "23:59" });
  assert.deepEqual(canvasDeadline("2026-10-04T16:00:00Z"), { date: "2026-10-05", time: "00:00" });
  assert.deepEqual(canvasDeadline(null), { date: "", time: "" });
});


test("deadline block spans exactly the preceding hour including midnight", async () => {
  const { deadlineWindow } = await import("../src/CanvasDeadlines.tsx");
  assert.deepEqual(deadlineWindow("2026-10-04T15:59:00Z", "2026-10-04"), {start:1379,end:1439});
  assert.deepEqual(deadlineWindow("2026-10-04T16:00:00Z", "2026-10-04"), {start:1380,end:1440});
  assert.equal(deadlineWindow("2026-10-04T16:00:00Z", "2026-10-05"), null);
});
