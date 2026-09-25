import { chapters, studyPlan } from "../shared/sql-curriculum.ts";
import {
  addDays,
  localDate,
  mins,
  clock,
  slots,
  validatePlan,
  taskSchema,
  isDue,
  type Plan,
} from "../shared/domain.ts";

export function studyTasks(plan: Plan, now = new Date()) {
  return plan.tasks
    .filter((t) => t.sqlChapterId)
    .map((t) => {
      const blocks = plan.blocks.filter((b) => b.taskId === t.id);
      const active =
        blocks.find((b) => b.status === "planned") || blocks.at(-1);
      const overdue = active && isDue(active, now);
      return {
        ...t,
        block: active,
        displayStatus:
          t.status === "done"
            ? "已完成"
            : t.status === "unfinished"
              ? active?.status === "planned"
                ? overdue
                  ? "待确认"
                  : "已重新安排"
                : "未完成，待重新安排"
              : overdue
                ? "待确认"
                : active
                  ? "已安排"
                  : "待安排",
      };
    })
    .sort(
      (a, b) =>
        (a.block?.date || a.dueDate).localeCompare(
          b.block?.date || b.dueDate,
        ) || (a.block?.start || "").localeCompare(b.block?.start || ""),
    );
}

// Half-hour workload units are spread across eligible days, then placed in free slots.
export function allocateStudy(
  before: Plan,
  learning: any,
  start: string,
  days: number,
  now = new Date(),
) {
  const outline = studyPlan(start, days);
  const today = localDate(now);
  if (start < today) throw Error("新学习计划请从今天或以后开始");
  const plan = structuredClone(before);
  const removed = new Set(
    plan.tasks
      .filter((t) => {
        if (!t.sqlChapterId || t.status !== "todo") return false;
        const blocks = plan.blocks.filter((b) => b.taskId === t.id);
        return (
          blocks.length > 0 &&
          blocks.every(
            (b) =>
              b.status === "planned" && new Date(b.date + "T" + b.start) > now,
          )
        );
      })
      .map((t) => t.id),
  );
  plan.tasks = plan.tasks.filter((t) => !removed.has(t.id));
  plan.blocks = plan.blocks.filter((b) => !removed.has(b.taskId));
  plan.followups = plan.followups.filter((f) => !removed.has(f.taskId));
  const occupied = slots(plan);
  const eligible: { date: string; free: number[] }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    // Thursday remains reserved for the user's courses.
    if (new Date(date + "T12:00:00").getDay() === 4) continue;
    const busy = occupied.filter((s) => s.date === date);
    const free: number[] = [];
    for (let m = 480; m < 1440; m += 30) {
      if (date === today && m <= now.getHours() * 60 + now.getMinutes())
        continue;
      if (!busy.some((s) => m < mins(s.end) && m + 30 > mins(s.start)))
        free.push(m);
    }
    eligible.push({ date, free });
  }
  const units: {
    chapterId: string;
    title: string;
    phase: string;
    detail: string;
  }[] = [];
  for (const c of chapters) {
    if (learning.chapters?.[c.id]?.confirmed) continue;
    const retained = plan.tasks
      .filter((t) => t.sqlChapterId === c.id)
      .reduce((n, t) => n + t.duration, 0);
    const count = c.hours * 2;
    for (let i = Math.ceil(retained / 30); i < count; i++) {
      const phase =
        i < Math.round(count * 0.3)
          ? "讲解"
          : i < Math.round(count * 0.8)
            ? "练习"
            : "复习";
      units.push({
        chapterId: c.id,
        title: c.title,
        phase,
        detail:
          phase === "讲解"
            ? c.video
            : phase === "练习"
              ? c.check
              : "回顾：" + c.goal + "；记录错题和仍不理解的地方。",
      });
    }
  }
  const projectId = "sql-study-project";
  if (units.length && !plan.projects.some((p) => p.id === projectId))
    plan.projects.push({ id: projectId, title: "SQL 学习" });
  let cursor = 0;
  const created: string[] = [];
  const add = (
    unit: (typeof units)[number],
    duration: number,
    date?: string,
    minute?: number,
  ) => {
    const id = `sql-${before.version + 1}-${created.length}`;
    if (plan.tasks.some((t) => t.id === id))
      throw Error("学习任务ID冲突，请刷新");
    plan.tasks.push(
      taskSchema.parse({
        id,
        projectId,
        sqlChapterId: unit.chapterId,
        title: `SQL · ${unit.title} · ${unit.phase}`,
        duration,
        dueDate: date || outline.finish,
        notes: `${unit.detail}\n使用 PostgreSQL + DBeaver。${date ? "" : "计划内没有可用时段，请手动安排。"}`,
      }),
    );
    if (date && minute !== undefined)
      plan.blocks.push({
        id: id + "-block",
        taskId: id,
        date,
        start: clock(minute),
        end: clock(minute + duration),
        status: "planned",
      });
    created.push(id);
  };
  for (let d = 0; d < eligible.length && cursor < units.length; d++) {
    const day = eligible[d];
    const laterCapacity = eligible
      .slice(d + 1)
      .reduce((n, x) => n + x.free.length, 0);
    const quota = Math.min(
      day.free.length,
      Math.max(
        Math.max(
          0,
          Math.round((units.length * (d + 1)) / eligible.length) - cursor,
        ),
        units.length - cursor - laterCapacity,
      ),
    );
    // Prefer evening, then use the remaining daytime availability.
    const selected = [
      ...day.free.filter((m) => m >= 1080 && m < 1320),
      ...day.free.filter((m) => m < 1080 || m >= 1320),
    ]
      .slice(0, quota)
      .sort((a, b) => a - b);
    for (let i = 0; i < selected.length;) {
      const unit = units[cursor];
      let n = 1;
      while (
        n < 3 &&
        i + n < selected.length &&
        selected[i + n] === selected[i] + 30 * n &&
        units[cursor + n]?.chapterId === unit.chapterId &&
        units[cursor + n]?.phase === unit.phase
      )
        n++;
      add(unit, n * 30, day.date, selected[i]);
      cursor += n;
      i += n;
    }
  }
  const unscheduledMinutes = (units.length - cursor) * 30;
  while (cursor < units.length) {
    const unit = units[cursor];
    let n = 1;
    while (
      n < 3 &&
      units[cursor + n]?.chapterId === unit.chapterId &&
      units[cursor + n]?.phase === unit.phase
    )
      n++;
    add(unit, n * 30);
    cursor += n;
  }
  validatePlan(plan);
  return {
    plan,
    tasks: studyTasks(plan, now),
    created,
    replaced: removed.size,
    unscheduledMinutes,
    scheduledMinutes: units.length * 30 - unscheduledMinutes,
  };
}
