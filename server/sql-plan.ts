import { createHash } from "node:crypto";
import { allocateStudy, studyTasks } from "./sql-schedule.ts";
import type { Store } from "./store.ts";
export function previewStudy(
  store: Store,
  start: string,
  days: number,
  now = new Date(),
) {
  const learning = store.get("sql:learning") || {
    drafts: {},
    hints: {},
    attempts: [],
    advice: {},
  };
  const result = allocateStudy(store.plan(), learning, start, days, now);
  const token = createHash("sha256")
    .update(JSON.stringify({ plan: result.plan, learning, start, days }))
    .digest("hex");
  return { ...result, token };
}
export function adoptStudy(
  store: Store,
  start: string,
  days: number,
  token: string,
  now = new Date(),
) {
  return store.transaction(() => {
    const result = previewStudy(store, start, days, now);
    if (!token || result.token !== token)
      throw Error("日历或学习记录已变化，请重新预览每日任务后确认");
    const learning = store.get("sql:learning") || {
      drafts: {},
      hints: {},
      attempts: [],
      advice: {},
    };
    store.record(store.plan(), undefined, {
      studyPlan: learning.studyPlan || null,
    });
    result.plan.version++;
    store.set("plan", result.plan);
    learning.studyPlan = { start, days };
    store.set("sql:learning", learning);
    return {
      learning,
      tasks: studyTasks(result.plan, now),
      unscheduledMinutes: result.unscheduledMinutes,
    };
  });
}
