import { z } from "zod";

const title = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Title is too long");

export const createConversationSchema = z.strictObject({
  title: title.optional(),
  subjectId: z.uuid("Invalid subject id").optional(),
  documentIds: z.array(z.uuid("Invalid document id")).max(20).optional(),
});

export const renameConversationSchema = z.strictObject({ title });

export const sendMessageSchema = z.strictObject({
  content: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(2000, "Message is too long"),
});

export const conversationIdParamSchema = z.strictObject({
  id: z.uuid("Invalid conversation id"),
});

export const listConversationsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type RenameConversationInput = z.infer<typeof renameConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListConversationsQuery = z.infer<
  typeof listConversationsQuerySchema
>;
