import { z } from "zod";

const documentId = z.uuid("Invalid document id");

export const idParamSchema = z.strictObject({ id: z.uuid("Invalid id") });

export const listQuerySchema = z.strictObject({
  documentId: documentId.optional(),
});

export const createSummarySchema = z.strictObject({
  documentId,
  length: z.enum(["SHORT", "MEDIUM", "DETAILED"]).default("MEDIUM"),
});

export const createFlashcardSetSchema = z.strictObject({
  documentId,
  count: z.number().int().min(5).max(30).default(15),
});

export const createQuizSchema = z.strictObject({
  documentId,
  count: z.number().int().min(3).max(20).default(10),
});

// One answer per question: the chosen option (0 to 3), or null for a skipped question.
export const submitAttemptSchema = z.strictObject({
  answers: z.array(z.number().int().min(0).max(3).nullable()).min(1).max(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
export type CreateSummaryInput = z.infer<typeof createSummarySchema>;
export type CreateFlashcardSetInput = z.infer<typeof createFlashcardSetSchema>;
export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
