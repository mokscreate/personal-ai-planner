import { test } from "node:test";
import assert from "node:assert/strict";
import { studyPlan, totalHours, chapters } from "../shared/sql-curriculum.ts";
test("study sliders share a fixed workload; deadlines are ordered and finish exactly", () => {
  assert.equal(totalHours, 48);
  const month = studyPlan("2026-09-21", 30),
    quarter = studyPlan("2026-09-21", 90);
  assert.equal(month.weeklyHours, 11.2);
  assert.equal(quarter.weeklyHours, (48 * 7) / 90);
  assert.equal(month.dailyHours, 1.6);
  assert.equal(quarter.chapters.length, chapters.length);
  assert.equal(quarter.chapters.at(-1)?.due, quarter.finish);
  assert.ok(
    quarter.chapters.every(
      (c, i) => i === 0 || c.due >= quarter.chapters[i - 1].due,
    ),
  );
  assert.equal(studyPlan("2026-09-21", 112).weeklyHours, 3);
  assert.throws(() => studyPlan("2026-09-21", 0));
});
