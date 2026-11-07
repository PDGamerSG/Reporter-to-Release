import { z } from "zod";
const text = (max = 300) => z.string().trim().min(1).max(max);
export const reportSchema = z
  .object({
    title: text(100),
    description: text(6000),
    expected: z.string().max(300).optional(),
    environment: z.string().max(160).optional(),
    steps: z.array(text(200)).max(8).optional(),
  })
  .strict();
const sha = z
  .string()
  .regex(/^[a-f\d]{40}$/i, "Use a full 40-character commit SHA.");
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start_reproduction") }).strict(),
  z
    .object({
      type: z.literal("propose_reproduction"),
      summary: text(600),
      steps: z.array(text(200)).min(1).max(8),
      testCommand: text(300),
      testOutput: text(5000),
      testPath: text(200),
      screenshotUrl: z
        .string()
        .url()
        .max(2000)
        .refine((u) => u.startsWith("https://"), "Use an HTTPS screenshot URL.")
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal("start_fix") }).strict(),
  z
    .object({
      type: z.literal("submit_fix"),
      prUrl: z.string().url().max(500),
      prNumber: z.number().int().positive(),
      headSha: sha,
      changedFiles: z.array(text(300)).min(1).max(300),
      summary: text(1000),
      testOutput: text(5000),
    })
    .strict(),
  z.object({ type: z.literal("approve_fix"), note: text(1000) }).strict(),
  z
    .object({
      type: z.literal("release_quarantine"),
      title: text(100),
      description: text(6000),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_severity"),
      severity: z.enum(["low", "medium", "high", "critical"]),
    })
    .strict(),
]);
export const reporterAnswerSchema = z
  .object({
    phase: z.enum(["reproduction", "release"]),
    confirmed: z.boolean(),
    evidence: z.string().max(2000).optional(),
  })
  .strict();
