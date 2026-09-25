import { z } from "zod";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) &&
      new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s,
    "日期无效",
  );
export const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/);
const id = z.string().min(1).max(100),
  title = z.string().trim().min(1, "请填写名称").max(300);
export const taskSchema = z.object({
  id,
  title,
  projectId: z.string().default(""),
  arrangement: z.enum(["timed", "flexible"]).optional(),
  cadence: z.enum(["once", "daily", "weekly"]).optional(),
  startsOn: dateSchema.optional(),
  completionDates: z.array(dateSchema).max(20000).optional(),
  learningArea: z.enum(["english", "sql", "course"]).optional(),
  sqlChapterId: z.string().max(100).optional(),
  notes: z.string().max(10000).default(""),
  dueDate: z.union([dateSchema, z.literal("")]).default(""),
  dueTime: z.union([timeSchema, z.literal("")]).default(""),
  duration: z.number().int().min(1).max(1440).default(30),
  status: z.enum(["todo", "unfinished", "done"]).default("todo"),
  progress: z.string().max(1000).default(""),
});
export const blockSchema = z.object({
  id,
  taskId: id,
  date: dateSchema,
  start: timeSchema,
  end: timeSchema,
  status: z.enum(["planned", "done", "unfinished"]).default("planned"),
});
export const eventSchema = z.object({
  id,
  title,
  highlight: z.enum(["yellow"]).optional(),
  date: dateSchema,
  start: timeSchema,
  end: timeSchema,
  repeat: z.boolean().default(false),
  until: z.union([dateSchema, z.literal("")]).default(""),
  notes: z.string().max(10000).default(""),
  skip: z.array(dateSchema).default([]),
});
export const followSchema = z.object({
  id,
  taskId: id,
  at: z.string().refine((s) => !isNaN(Date.parse(s)), "跟进时间无效"),
  context: z.string().max(5000).default(""),
  status: z.enum(["pending", "closed"]).default("pending"),
});
export const planSchema = z.object({
  version: z.number().int().nonnegative(),
  projects: z.array(z.object({ id, title })),
  tasks: z.array(taskSchema),
  blocks: z.array(blockSchema),
  events: z.array(eventSchema),
  followups: z.array(followSchema),
});
export type Plan = z.infer<typeof planSchema>;
export type Task = Plan["tasks"][number];
export type Event = Plan["events"][number];
export type Block = Plan["blocks"][number];
export type Operation = {
  type: string;
  value?: any;
  id?: string;
  date?: string;
  scope?: string;
};
export const emptyPlan = (): Plan => ({
  version: 0,
  projects: [],
  tasks: [],
  blocks: [],
  events: [],
  followups: [],
});
export const mins = (s: string) =>
  Number(s.split(":")[0]) * 60 + Number(s.split(":")[1]);
export const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function addDays(d: string, n: number) {
  const x = new Date(d + "T12:00:00");
  x.setDate(x.getDate() + n);
  return localDate(x);
}
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function occurrences(e: Event): string[] {
  if (!e.repeat) return [e.date];
  if (!e.until || e.until < e.date)
    throw Error("重复课程需要正确的学期结束日期");
  if ((Date.parse(e.until) - Date.parse(e.date)) / 86400000 > 740)
    throw Error("学期范围最多两年");
  const ds: string[] = [];
  for (let d = e.date; d <= e.until; d = addDays(d, 7))
    if (!e.skip.includes(d)) ds.push(d);
  return ds;
}
export type Slot = {
  highlight?: "yellow";
  key: string;
  kind: "task" | "event";
  id: string;
  date: string;
  start: string;
  end: string;
  title: string;
  status: string;
  taskId?: string;
};
export function slots(p: Plan): Slot[] {
  return [
    ...p.blocks.map((b) => ({
      key: b.id,
      kind: "task" as const,
      id: b.id,
      date: b.date,
      start: b.start,
      end: b.end,
      title: p.tasks.find((t) => t.id === b.taskId)?.title || "任务",
      status: b.status,
      taskId: b.taskId,
    })),
    ...p.events.flatMap((e) =>
      occurrences(e)
        .filter((d) => !e.skip.includes(d))
        .map((d) => ({
          key: `${e.id}@${d}`,
          kind: "event" as const,
          id: e.id,
          date: d,
          start: e.start,
          end: e.end,
          title: e.title,
          highlight: e.highlight,
          status: "event",
        })),
    ),
  ];
}
export function conflicts(p: Plan) {
  const ss = slots(p).sort(
    (a, b) => a.date.localeCompare(b.date) || mins(a.start) - mins(b.start),
  );
  for (let i = 0; i < ss.length; i++) {
    if (mins(ss[i].start) >= mins(ss[i].end))
      throw Error(`${ss[i].title}：结束时间必须晚于开始时间`);
    for (
      let j = i + 1;
      j < ss.length &&
      ss[j].date === ss[i].date &&
      mins(ss[j].start) < mins(ss[i].end);
      j++
    )
      throw Error(
        `时间冲突：${ss[i].date}「${ss[i].title}」与「${ss[j].title}」重叠`,
      );
  }
}
export function validatePlan(input: unknown): Plan {
  const p = planSchema.parse(input);
  for (const list of [p.tasks, p.blocks, p.events, p.projects, p.followups])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw Error("存在重复ID");
  for (const t of p.tasks) {
    if (t.projectId && !p.projects.some((x) => x.id === t.projectId))
      throw Error("所属项目不存在");
    if (t.dueTime && !t.dueDate) throw Error("请先填写截止日期");
  }
  for (const b of p.blocks) {
    const t = p.tasks.find((t) => t.id === b.taskId);
    if (!t) throw Error("安排关联的任务不存在");
    if (t.arrangement === "flexible" && b.status === "planned")
      throw Error("灵活任务不占日历，请先改为时段任务");
  }
  for (const f of p.followups)
    if (!p.tasks.some((t) => t.id === f.taskId))
      throw Error("跟进关联的任务不存在");
  conflicts(p);
  return p;
}
function upsert<T extends { id: string }>(arr: T[], x: T) {
  const i = arr.findIndex((t) => t.id === x.id);
  if (i < 0) arr.push(x);
  else arr[i] = x;
}
export function applyOperations(plan: Plan, ops: Operation[]): Plan {
  const p = structuredClone(plan);
  if (!Array.isArray(ops) || ops.length > 100) throw Error("操作数量无效");
  for (const op of ops) {
    switch (op.type) {
      case "project":
        upsert(p.projects, z.object({ id, title }).parse(op.value));
        break;
      case "task":
        upsert(p.tasks, taskSchema.parse(op.value));
        break;
      case "event":
        upsert(p.events, eventSchema.parse(op.value));
        break;
      case "block":
        upsert(p.blocks, blockSchema.parse(op.value));
        break;
      case "followup":
        upsert(p.followups, followSchema.parse(op.value));
        break;
      case "complete": {
        const t = p.tasks.find((t) => t.id === op.id);
        if (!t) throw Error("任务不存在");
        if (t.arrangement === "flexible" && t.cadence && t.cadence !== "once") {
          const date = dateSchema.parse(op.date || localDate());
          if (date > localDate()) throw Error("不能提前完成未来的任务");
          t.completionDates = [
            ...new Set([...(t.completionDates || []), date]),
          ];
          break;
        }
        t.status = "done";
        p.blocks.forEach((b) => {
          if (b.taskId === t.id) b.status = "done";
        });
        p.followups.forEach((f) => {
          if (f.taskId === t.id) f.status = "closed";
        });
        break;
      }
      case "return": {
        const b = p.blocks.find((b) => b.id === op.id);
        if (!b) throw Error("安排不存在");
        b.status = "unfinished";
        const t = p.tasks.find((t) => t.id === b.taskId)!;
        t.status = "unfinished";
        if (op.value?.progress !== undefined)
          t.progress = String(op.value.progress).slice(0, 1000);
        break;
      }
      case "closeFollowup": {
        const f = p.followups.find((f) => f.id === op.id);
        if (f) f.status = "closed";
        break;
      }
      case "deleteTask":
        p.tasks = p.tasks.filter((t) => t.id !== op.id);
        p.blocks = p.blocks.filter((b) => b.taskId !== op.id);
        p.followups = p.followups.filter((f) => f.taskId !== op.id);
        break;
      case "deleteBlock":
        p.blocks = p.blocks.filter((b) => b.id !== op.id);
        break;
      case "skipEvent": {
        const e = p.events.find((e) => e.id === op.id);
        if (!e || !op.date) throw Error("事件不存在");
        dateSchema.parse(op.date);
        if (op.scope === "future") {
          e.until = addDays(op.date, -1);
          if (e.until < e.date)
            p.events = p.events.filter((x) => x.id !== e.id);
        } else if (!e.skip.includes(op.date)) e.skip.push(op.date);
        break;
      }
      case "deleteEvent":
        p.events = p.events.filter((e) => e.id !== op.id);
        break;
      default:
        throw Error("不支持的操作：" + op.type);
    }
  }
  return validatePlan(p);
}
export function isDue(b: Block, now = new Date()) {
  const end = new Date(b.date + "T00:00:00");
  end.setMinutes(mins(b.end));
  return b.status === "planned" && end.getTime() <= now.getTime();
}
export function activeTaskIds(p: Plan) {
  return new Set(
    p.blocks.filter((b) => b.status === "planned").map((b) => b.taskId),
  );
}

export function periodComplete(t: Task, date = localDate()): boolean {
  if (t.arrangement !== "flexible" || !t.cadence || t.cadence === "once")
    return t.status === "done";
  if (t.cadence === "daily") return (t.completionDates || []).includes(date);
  const weekday = new Date(date + "T12:00:00").getDay();
  const start = addDays(date, -((weekday + 6) % 7));
  return (t.completionDates || []).some((d) => d >= start && d <= date);
}
