import { z } from "zod";
export const segmentSchema = z.object({
  text: z.string().max(10000),
  start: z.number().min(0).nullable(),
});
export const materialSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300),
  course: z.string().max(200).default(""),
  audioId: z.string().uuid().optional(),
  segments: z.array(segmentSchema).max(20000),
});
export const englishSchema = z.object({
  coursePlan: z
    .object({
      goal: z
        .string()
        .max(2000)
        .default("按课程推进预习、复习、作业与考试准备"),
      weeklyHours: z.number().min(0).max(80).default(0),
      finish: z.string().max(10).default(""),
    })
    .default({
      goal: "按课程推进预习、复习、作业与考试准备",
      weeklyHours: 0,
      finish: "",
    }),
  version: z.number().int().min(0).default(0),
  goal: z
    .string()
    .max(2000)
    .default("全面提升听说读写，以课堂材料为主要练习来源"),
  weeklyHours: z.number().min(0).max(50).default(0),
  finish: z.string().max(10).default(""),
  materials: z.array(materialSchema).max(1000).default([]),
  vocabulary: z
    .array(
      z.object({
        word: z.string().max(200),
        meaning: z.string().max(1000),
        example: z.string().max(3000),
        source: z.string().max(300),
      }),
    )
    .max(30000)
    .default([]),
});
export type EnglishState = z.infer<typeof englishSchema>;
export type Material = z.infer<typeof materialSchema>;
export function parseTranscript(input: string): Material["segments"] {
  const lines = input.replace(/\r/g, "").split("\n");
  const result: Material["segments"] = [];
  let start: number | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^WEBVTT|^\d+$/.test(line)) continue;
    const stamp = line.match(
      /^(?:\[)?(?:(\d{1,2}):)?(\d{2}):(\d{2})(?:[.,](\d{1,3}))?(?:\])?\s*(.*)$/,
    );
    if (stamp) {
      start =
        Number(stamp[1] || 0) * 3600 +
        Number(stamp[2]) * 60 +
        Number(stamp[3]) +
        Number("0." + (stamp[4] || "0"));
      if (stamp[5] && !stamp[5].startsWith("-->"))
        result.push({ start, text: stamp[5] });
      continue;
    }
    if (line.startsWith("NOTE")) continue;
    result.push({ start, text: line });
    start = null;
  }
  return result;
}
