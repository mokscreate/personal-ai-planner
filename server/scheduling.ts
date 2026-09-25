import {
  addDays,
  localDate,
  eventSchema,
  type Operation,
  type Plan,
} from "../shared/domain.ts";

// A historical timetable is a recurrence pattern, not a request to backfill.
export function futureRecurrences(
  operations: Operation[],
  plan: Plan,
  today = localDate(),
): Operation[] {
  return operations.map((op) => {
    if (
      op.type !== "event" ||
      !op.value?.repeat ||
      plan.events.some((e) => e.id === op.value.id)
    )
      return op;
    const event = eventSchema.parse(op.value);
    let date = event.date;
    while (date < today || event.skip.includes(date)) {
      date = addDays(date, 7);
      if (event.until && date > event.until)
        throw Error("该循环课程已无未来课次，请确认新的教学日期。");
    }
    if (event.until && date > event.until)
      throw Error("该循环课程已无未来课次，请确认新的教学日期。");
    return {
      ...op,
      value: { ...event, date, skip: event.skip.filter((d) => d >= date) },
    };
  });
}
export function assertFutureRecurrences(operations: Operation[], plan: Plan) {
  const normalized = futureRecurrences(operations, plan);
  if (normalized.some((op, i) => op.value?.date !== operations[i].value?.date))
    throw Error(
      "循环课程的首次日期已过去或属于停课日，请先把草稿改为今天起的首个有效课次，再确认采用。",
    );
}
