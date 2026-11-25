import { z } from "zod";

const name = z
  .string()
  .trim()
  .min(1, "Subject name is required")
  .max(100, "Subject name is too long");

// An empty description is stored as null.
const description = z
  .string()
  .trim()
  .max(500, "Description is too long")
  .transform((value) => (value === "" ? null : value));

export const createSubjectSchema = z.strictObject({
  name,
  description: description.nullish(),
});

export const updateSubjectSchema = z
  .strictObject({
    name: name.optional(),
    description: description.nullish(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: "Provide at least one field to update",
  });

export const subjectIdParamSchema = z.strictObject({
  id: z.uuid("Invalid subject id"),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
