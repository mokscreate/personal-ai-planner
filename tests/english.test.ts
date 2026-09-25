import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import { registerEnglish } from "../server/english-routes.ts";
import { parseTranscript } from "../shared/english.ts";
import {
  applyOperations,
  emptyPlan,
  periodComplete,
} from "../shared/domain.ts";

test("daily and weekly flexible goals keep independent completion history without calendar blocks", () => {
  let plan = applyOperations(emptyPlan(), [
    {
      type: "task",
      value: {
        id: "daily",
        title: "背词",
        arrangement: "flexible",
        cadence: "daily",
      },
    },
    {
      type: "task",
      value: {
        id: "weekly",
        title: "复述",
        arrangement: "flexible",
        cadence: "weekly",
      },
    },
  ]);
  plan = applyOperations(plan, [
    { type: "complete", id: "daily", date: "2026-09-21" },
    { type: "complete", id: "weekly", date: "2026-09-21" },
  ]);
  assert.equal(periodComplete(plan.tasks[0], "2026-09-21"), true);
  assert.equal(periodComplete(plan.tasks[0], "2026-09-22"), false);
  assert.equal(periodComplete(plan.tasks[1], "2026-09-27"), true);
  assert.equal(periodComplete(plan.tasks[1], "2026-09-28"), false);
  assert.equal(plan.blocks.length, 0);
  assert.equal(plan.tasks[0].status, "todo");
});
test("transcripts preserve timestamps and do not invent alignment for plain text", () => {
  assert.deepEqual(
    parseTranscript(
      "1\n00:01:02,500 --> 00:01:04,000\nHello there.\n\n2\n00:02:00,000 --> 00:02:03,000\nNext sentence.",
    ),
    [
      { start: 62.5, text: "Hello there." },
      { start: 120, text: "Next sentence." },
    ],
  );
  assert.deepEqual(parseTranscript("Hello world."), [
    { start: null, text: "Hello world." },
  ]);
});
test("English state and audio survive store reopen; stale saves fail; range playback works", async () => {
  const dir = mkdtempSync(join(tmpdir(), "english-test-"));
  let store = new Store(dir);
  let app = Fastify();
  try {
    registerEnglish(app, store);
    const state = (await app.inject({ url: "/api/english" })).json();
    const audio = Buffer.alloc(100, 1);
    const upload = await app.inject({
      url: "/api/english/audio",
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-audio-type": "audio/wav",
      },
      payload: audio,
    });
    assert.equal(upload.statusCode, 200);
    const id = upload.json().id;
    const next = {
      ...state,
      goal: "理解课堂",
      materials: [
        {
          id: "d1dc4c11-b133-4a43-91d9-a09afce24431",
          title: "Lesson",
          course: "English",
          audioId: id,
          segments: [{ start: 2, text: "Example" }],
        },
      ],
    };
    assert.equal(
      (await app.inject({ url: "/api/english", method: "PUT", payload: next }))
        .statusCode,
      200,
    );
    assert.notEqual(
      (await app.inject({ url: "/api/english", method: "PUT", payload: next }))
        .statusCode,
      200,
    );
    const beforeCourse = (await app.inject({ url: "/api/english" })).json();
    assert.equal(beforeCourse.coursePlan.weeklyHours, 0);
    const courseSave = await app.inject({ url: "/api/english", method: "PUT", payload: {
      ...beforeCourse, coursePlan: { goal: "完成课程复习", weeklyHours: 4, finish: "2026-11-13" }
    }});
    assert.equal(courseSave.statusCode, 200);
    await app.close();
    store.close();
    store = new Store(dir);
    app = Fastify();
    registerEnglish(app, store);
    const loaded = (await app.inject({ url: "/api/english" })).json();
    assert.equal(loaded.goal, "理解课堂");
    assert.equal(loaded.weeklyHours, 0);
    assert.equal(loaded.coursePlan.weeklyHours, 4);
    assert.equal(loaded.coursePlan.goal, "完成课程复习");
    assert.equal(loaded.materials[0].audioId, id);
    const partial = await app.inject({
      url: "/api/english/audio/" + id,
      headers: { range: "bytes=10-19" },
    });
    assert.equal(partial.statusCode, 206);
    assert.equal(partial.rawPayload.length, 10);
    assert.equal(
      (
        await app.inject({
          url: "/api/english/audio/" + id,
          headers: { range: "bytes=200-210" },
        })
      ).statusCode,
      416,
    );
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
