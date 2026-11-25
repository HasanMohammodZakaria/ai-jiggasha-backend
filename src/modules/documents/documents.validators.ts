import { z } from "zod";

// Multipart forms send empty text fields as "": treat them as "not provided".
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const title = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(255, "Title is too long");

const subjectId = z.uuid("Invalid subject id");

export const uploadDocumentSchema = z.strictObject({
  title: z.preprocess(emptyToUndefined, title.optional()),
  subjectId: z.preprocess(emptyToUndefined, subjectId.optional()),
});

export const updateDocumentSchema = z
  .strictObject({
    title: title.optional(),
    subjectId: subjectId.nullable().optional(), // null = remove from its subject
  })
  .refine((v) => v.title !== undefined || v.subjectId !== undefined, {
    message: "Provide at least one field to update",
  });

export const documentIdParamSchema = z.strictObject({
  id: z.uuid("Invalid document id"),
});

export const listDocumentsQuerySchema = z.strictObject({
  subjectId: subjectId.optional(),
  status: z.enum(["UPLOADED", "PROCESSING", "READY", "FAILED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
