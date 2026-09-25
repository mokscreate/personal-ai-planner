import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyPlan,
  addDays,
  validatePlan,
  applyOperations,
} from "../shared/domain.ts";
import { allocateStudy, studyTasks } from "../server/sql-schedule.ts";
import { previewStudy, adoptStudy } from "../server/sql-plan.ts";
import { Store } from "../server/store.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const now = new Date("2026-09-21T10:15:00");
const learning = { drafts: {}, hints: {}, attempts: [], advice: {} };
test("daily SQL schedule conserves 48h, avoids fixed courses and Thursdays, never schedules past times", () => {
  const p = emptyPlan();
  p.events.push({
    id: "course",
    title: "课程",
    date: "2026-09-21",
    start: "18:00",
    end: "22:00",
    repeat: true,
    until: "2027-02-01",
    notes: "",
    skip: [],
  });
  const r = allocateStudy(p, learning, "2026-09-21", 112, now);
  assert.equal(r.scheduledMinutes, 2880);
  assert.equal(r.unscheduledMinutes, 0);
  assert.equal(p.tasks.length, 0);
  validatePlan(r.plan);
  assert.equal(
    r.tasks.reduce((n, t) => n + t.duration, 0),
    2880,
  );
  for (const b of r.plan.blocks) {
    assert.notEqual(new Date(b.date + "T12:00:00").getDay(), 4);
    assert.ok(new Date(b.date + "T" + b.start) > now);
  }
  const again = allocateStudy(
    { ...r.plan, version: 1 },
    learning,
    "2026-09-21",
    112,
    now,
  );
  assert.equal(
    again.plan.tasks.reduce((n, t) => n + t.duration, 0),
    2880,
  );
  assert.equal(again.plan.events.length, 1);
});
test("full calendar leaves learning in backlog; completed and unfinished work survives replanning", () => {
  const p = emptyPlan();
  for (let i = 0; i < 7; i++)
    p.events.push({
      id: "busy" + i,
      title: "忙",
      date: addDays("2026-09-21", i),
      start: "08:00",
      end: "24:00",
      repeat: false,
      until: "",
      notes: "",
      skip: [],
    });
  const r = allocateStudy(p, learning, "2026-09-21", 7, now);
  assert.equal(r.unscheduledMinutes, 2880);
  assert.equal(r.plan.blocks.length, 0);
  const again = allocateStudy(
    { ...r.plan, version: 1 },
    learning,
    "2026-09-21",
    7,
    now,
  );
  assert.equal(again.created.length, 0);
  assert.equal(again.tasks.length, r.tasks.length);
  const first = allocateStudy(emptyPlan(), learning, "2026-09-21", 112, now);
  first.plan.tasks[0].status = "done";
  first.plan.blocks[0].status = "done";
  first.plan.tasks[1].status = "unfinished";
  first.plan.blocks[1].status = "unfinished";
  const next = allocateStudy(
    { ...first.plan, version: 1 },
    learning,
    "2026-09-21",
    90,
    now,
  );
  assert.ok(
    next.plan.tasks.some(
      (t) => t.id === first.plan.tasks[0].id && t.status === "done",
    ),
  );
  assert.ok(
    next.plan.tasks.some(
      (t) => t.id === first.plan.tasks[1].id && t.status === "unfinished",
    ),
  );
  assert.equal(
    next.tasks.reduce((n, t) => n + t.duration, 0),
    2880,
  );
});
test("preview requires confirmation, stale preview fails, calendar changes are reflected, undo restores both plan and learning", () => {
  const dir = mkdtempSync(join(tmpdir(), "sql-schedule-"));
  const store = new Store(dir);
  try {
    const preview = previewStudy(store, "2026-09-21", 112, now);
    assert.equal(store.plan().tasks.length, 0);
    assert.throws(() => adoptStudy(store, "2026-09-21", 112, "bad", now));
    const result = adoptStudy(store, "2026-09-21", 112, preview.token, now);
    assert.ok(result.tasks.length > 0);
    assert.throws(() =>
      adoptStudy(store, "2026-09-21", 112, preview.token, now),
    );
    const b = store.plan().blocks[0];
    const modified = applyOperations(store.plan(), [
      {
        type: "block",
        value: { ...b, date: "2027-05-01", start: "11:00", end: "11:30" },
      },
    ]);
    assert.equal(
      studyTasks(modified, now).find((t) => t.id === b.taskId)?.block?.start,
      "11:00",
    );
    store.undo(store.plan().version);
    assert.equal(store.plan().tasks.length, 0);
    assert.equal(store.get("sql:learning").studyPlan, undefined);
  } finally {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("low weekly commitment spreads work across the entire long plan instead of front-loading it", () => {
  const r = allocateStudy(emptyPlan(), learning, "2026-09-21", 672, now);
  assert.equal(r.scheduledMinutes, 2880);
  assert.ok(r.plan.blocks[0].date >= "2026-09-23");
  assert.ok(r.plan.blocks.at(-1)!.date >= addDays("2026-09-21", 665));
  const weekly = new Map<number, number>();
  for (const b of r.plan.blocks) {
    const w = Math.floor(
      (Date.parse(b.date) - Date.parse("2026-09-21")) / 86400000 / 7,
    );
    weekly.set(w, (weekly.get(w) || 0) + 30);
  }
  assert.ok([...weekly.values()].every((n) => n <= 60));
});
