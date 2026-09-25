import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import {
  emptyPlan,
  applyOperations,
  slots,
  occurrences,
} from "../shared/domain.ts";
const task = { type: "task", value: { id: "t", title: "报告" } };
const event = {
  type: "event",
  value: {
    id: "e",
    title: "课程",
    date: "2026-09-23",
    start: "09:15",
    end: "10:00",
    repeat: true,
    until: "2026-10-07",
  },
};
test("exact time and finite weekly occurrences", () => {
  const p = applyOperations(emptyPlan(), [event]);
  assert.deepEqual(occurrences(p.events[0]), [
    "2026-09-23",
    "2026-09-30",
    "2026-10-07",
  ]);
  assert.equal(slots(p)[0].start, "09:15");
});
test("conflicts checked beyond visible week; adjoining intervals accepted", () => {
  const p = applyOperations(emptyPlan(), [task, event]);
  assert.throws(
    () =>
      applyOperations(p, [
        {
          type: "block",
          value: {
            id: "b",
            taskId: "t",
            date: "2026-10-07",
            start: "09:30",
            end: "10:30",
          },
        },
      ]),
    /冲突/,
  );
  assert.doesNotThrow(() =>
    applyOperations(p, [
      {
        type: "block",
        value: {
          id: "b",
          taskId: "t",
          date: "2026-10-07",
          start: "10:00",
          end: "10:30",
        },
      },
    ]),
  );
});
test("partial return preserves history without automatic rescheduling", () => {
  let p = applyOperations(emptyPlan(), [
    task,
    {
      type: "block",
      value: {
        id: "b",
        taskId: "t",
        date: "2026-09-23",
        start: "10:00",
        end: "11:00",
      },
    },
  ]);
  p = applyOperations(p, [
    { type: "return", id: "b", value: { progress: "5/10" } },
  ]);
  assert.equal(p.tasks[0].status, "unfinished");
  assert.equal(p.tasks[0].progress, "5/10");
  assert.equal(p.blocks.length, 1);
  assert.equal(p.blocks[0].date, "2026-09-23");
});
test("single recurrence cancellation leaves other weeks", () => {
  const p = applyOperations(emptyPlan(), [
    event,
    { type: "skipEvent", id: "e", date: "2026-09-30" },
  ]);
  assert.equal(slots(p).length, 2);
});
test("draft isolation, stale detection, recheck, atomic apply, duplicate apply and undo", () => {
  const dir = mkdtempSync(join(tmpdir(), "planner-test-"));
  const s = new Store(dir);
  try {
    const d = s.draft([task]);
    assert.equal(s.plan().tasks.length, 0);
    s.command(0, [event], "one");
    assert.throws(() => s.applyDraft(d.id, 0), /日历已变化/);
    s.rebase(d.id, 0);
    s.applyDraft(d.id, 1);
    s.applyDraft(d.id, 1);
    assert.equal(s.plan().tasks.length, 1);
    s.undo(s.plan().version);
    assert.equal(s.plan().tasks.length, 0);
    assert.equal(s.plan().events.length, 1);
    const restored = s.drafts().find((x) => x.id === d.id);
    assert.ok(restored);
    assert.equal(restored.base, s.plan().version);
    s.applyDraft(restored.id, restored.revision);
    assert.equal(s.plan().tasks.length, 1);
    s.close();
    const next = new Store(dir);
    assert.equal(next.plan().events.length, 1);
    next.close();
  } finally {
    try {
      s.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});
test("invalid batch rolls back all writes", () => {
  const dir = mkdtempSync(join(tmpdir(), "planner-test-"));
  const s = new Store(dir);
  try {
    assert.throws(() =>
      s.command(
        0,
        [
          task,
          {
            type: "block",
            value: {
              id: "b",
              taskId: "t",
              date: "2026-09-23",
              start: "11:00",
              end: "10:00",
            },
          },
        ],
        "bad",
      ),
    );
    assert.equal(s.plan().tasks.length, 0);
    assert.equal(s.plan().version, 0);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
