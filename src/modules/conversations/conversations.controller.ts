import type { Request, Response } from "express";
import { AppError } from "../../shared/errors.js";
import * as conversationsService from "./conversations.service.js";
import {
  conversationIdParamSchema,
  listConversationsQuerySchema,
  type CreateConversationInput,
  type RenameConversationInput,
  type SendMessageInput,
} from "./conversations.validators.js";

function currentUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, "UNAUTHENTICATED", "Please log in");
  return userId;
}

// A malformed id throws a ZodError, which the central error handler turns into a 400.
function conversationId(req: Request): string {
  return conversationIdParamSchema.parse(req.params).id;
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateConversationInput; // already validated by validateBody()
  const conversation = await conversationsService.createConversation(
    currentUserId(req),
    input,
  );
  res.status(201).json({ data: { conversation } });
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = listConversationsQuerySchema.parse(req.query);
  const result = await conversationsService.listConversations(
    currentUserId(req),
    query,
  );
  res.json({ data: result });
}

export async function get(req: Request, res: Response): Promise<void> {
  const conversation = await conversationsService.getConversation(
    currentUserId(req),
    conversationId(req),
  );
  res.json({ data: { conversation } });
}

export async function rename(req: Request, res: Response): Promise<void> {
  const input = req.body as RenameConversationInput;
  await conversationsService.renameConversation(
    currentUserId(req),
    conversationId(req),
    input.title,
  );
  res.json({ data: { ok: true } });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await conversationsService.deleteConversation(
    currentUserId(req),
    conversationId(req),
  );
  res.json({ data: { ok: true } });
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const input = req.body as SendMessageInput;
  const result = await conversationsService.sendMessage(
    currentUserId(req),
    conversationId(req),
    input,
  );
  res.status(201).json({ data: result });
}
