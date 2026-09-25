import { dateSchema } from "../shared/domain.ts";
import { z } from "zod";
const code = z.string().max(20000);
export const learningSchema = z.object({
  studyPlan: z
    .object({ start: dateSchema, days: z.number().int().min(7).max(730) })
    .optional(),
  chapters: z
    .record(
      z.string().max(100),
      z.object({
        read: z.boolean(),
        externalPassed: z.boolean(),
        evidence: z.string().max(5000),
        confirmed: z.boolean(),
      }),
    )
    .optional(),
  drafts: z.record(z.string().max(100), code),
  hints: z.record(z.string().max(100), z.number().int().min(0).max(3)),
  advice: z.record(z.string().max(100), z.string().max(30000)),
  attempts: z
    .array(
      z.object({
        id: z.string().max(100),
        lessonId: z.string().max(100),
        sql: code,
        at: z.string().datetime(),
        submitted: z.boolean(),
        passed: z.boolean(),
        error: z.string().max(30000),
        feedback: z.string().max(30000),
        hints: z.number().int().min(0).max(3),
      }),
    )
    .max(500),
});
