import { test } from "node:test";
import assert from "node:assert/strict";
import { futureRecurrences } from "../server/scheduling.ts";
import { emptyPlan } from "../shared/domain.ts";
const op = {
  type: "event",
  value: {
    id: "course",
    title: "Course",
    date: "2026-08-10",
    start: "19:00",
    end: "22:00",
    repeat: true,
    until: "2026-11-13",
    skip: ["2026-09-21", "2026-11-09"],
  },
};
test("old timetable starts at next effective teaching day, retains weekday and future holiday", () => {
  const result = futureRecurrences([op], emptyPlan(), "2026-09-21")[0].value;
  assert.equal(result.date, "2026-09-28");
  assert.deepEqual(result.skip, ["2026-11-09"]);
  assert.equal(result.end, "22:00");
  assert.equal(op.value.date, "2026-08-10");
});
test("today remains eligible; expired terms cannot be backfilled; existing records unchanged", () => {
  assert.equal(
    futureRecurrences(
      [{ ...op, value: { ...op.value, skip: [] } }],
      emptyPlan(),
      "2026-09-21",
    )[0].value.date,
    "2026-09-21",
  );
  assert.throws(
    () => futureRecurrences([op], emptyPlan(), "2026-12-01"),
    /未来课次/,
  );
  const plan = emptyPlan();
  plan.events.push({ ...op.value, notes: "" });
  assert.deepEqual(futureRecurrences([op], plan, "2026-09-21"), [op]);
});
