import {
  ConversationScope,
  type DocumentStatus,
  type Message,
  type MessageRole,
  type MessageSource,
} from "@prisma/client";
import type { LlmMessage } from "../../providers/ai/llm.types.js";
import { AppError } from "../../shared/errors.js";
import { answerQuestion } from "../rag/rag.service.js";
import * as repo from "./conversations.repository.js";
import type {
  CreateConversationInput,
  ListConversationsQuery,
  SendMessageInput,
} from "./conversations.validators.js";

const DEFAULT_TITLE = "New chat";
const HISTORY_LIMIT = 6; // the last three questions and answers

export interface PublicSource {
  id: string;
  documentId: string | null;
  documentTitle: string;
  pageStart: number | null;
  pageEnd: number | null;
  sectionLabel: string | null;
  excerpt: string;
  score: number;
}

export interface PublicMessage {
  id: string;
  role: MessageRole;
  content: string;
  provider: string | null;
  model: string | null;
  createdAt: Date;
  sources: PublicSource[];
}

export interface PublicConversation {
  id: string;
  title: string;
  subjectId: string | null;
  scope: ConversationScope;
  documentCount: number;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationDetail extends PublicConversation {
  documents: { id: string; title: string; status: DocumentStatus }[];
  messages: PublicMessage[];
}

export interface ConversationPage {
  conversations: PublicConversation[];
  total: number;
  page: number;
  limit: number;
}

export interface SendMessageResult {
  userMessage: PublicMessage;
  assistantMessage: PublicMessage;
  usedFallback: boolean;
}

type ConversationRow = NonNullable<
  Awaited<ReturnType<typeof repo.findConversation>>
>;
type MessageRow = Message & { sources: MessageSource[] };

function notFound(): AppError {
  return new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
}

function toPublicMessage(row: MessageRow): PublicMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    provider: row.provider,
    model: row.model,
    createdAt: row.createdAt,
    sources: row.sources.map((s) => ({
      id: s.id,
      documentId: s.documentId,
      documentTitle: s.documentTitle,
      pageStart: s.pageStart,
      pageEnd: s.pageEnd,
      sectionLabel: s.sectionLabel,
      excerpt: s.excerpt,
      score: s.score,
    })),
  };
}

function toPublicConversation(
  row: Omit<ConversationRow, "documents">,
): PublicConversation {
  return {
    id: row.id,
    title: row.title,
    subjectId: row.subjectId,
    scope: row.scope,
    documentCount: row._count.documents,
    messageCount: row._count.messages,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createConversation(
  userId: string,
  input: CreateConversationInput,
): Promise<PublicConversation> {
  if (
    input.subjectId &&
    !(await repo.findOwnedSubjectId(userId, input.subjectId))
  ) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", "Subject not found");
  }

  const documentIds = [...new Set(input.documentIds ?? [])];
  if (
    documentIds.length > 0 &&
    (await repo.countOwnedDocuments(userId, documentIds)) !== documentIds.length
  ) {
    throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  }

  // Which notes a conversation searches is fixed when it is created.
  const scope =
    documentIds.length > 0
      ? ConversationScope.DOCUMENTS
      : input.subjectId
        ? ConversationScope.SUBJECT
        : ConversationScope.ALL;

  const created = await repo.createConversation(userId, {
    title: input.title ?? DEFAULT_TITLE,
    subjectId: input.subjectId ?? null,
    scope,
    documentIds,
  });
  return toPublicConversation(created);
}

export async function listConversations(
  userId: string,
  query: ListConversationsQuery,
): Promise<ConversationPage> {
  const { conversations, total } = await repo.listConversations(
    userId,
    (query.page - 1) * query.limit,
    query.limit,
  );
  return {
    conversations: conversations.map(toPublicConversation),
    total,
    page: query.page,
    limit: query.limit,
  };
}

export async function getConversation(
  userId: string,
  id: string,
): Promise<ConversationDetail> {
  const conversation = await repo.findConversation(userId, id);
  if (!conversation) throw notFound();
  const messages = await repo.listMessages(id);
  return {
    ...toPublicConversation(conversation),
    documents: conversation.documents.map((link) => link.document),
    messages: messages.map(toPublicMessage),
  };
}

export async function renameConversation(
  userId: string,
  id: string,
  title: string,
): Promise<void> {
  if (!(await repo.renameConversation(userId, id, title))) throw notFound();
}

export async function deleteConversation(
  userId: string,
  id: string,
): Promise<void> {
  if (!(await repo.deleteConversation(userId, id))) throw notFound();
}

function titleFrom(question: string): string {
  const firstLine = question.split("\n")[0]?.trim() ?? question;
  return firstLine.slice(0, 60) || DEFAULT_TITLE;
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const conversation = await repo.findConversation(userId, conversationId);
  if (!conversation) throw notFound();

  const recent = await repo.recentMessages(conversationId, HISTORY_LIMIT);
  const history: LlmMessage[] = recent.map((m) => ({
    role: m.role === "USER" ? "user" : "assistant",
    content: m.content,
  }));

  const answer = await answerQuestion({
    userId,
    question: input.content,
    scope: {
      kind: conversation.scope,
      subjectId: conversation.subjectId,
      documentIds: conversation.documents.map((link) => link.document.id),
    },
    history,
  });

  const newTitle =
    conversation._count.messages === 0 && conversation.title === DEFAULT_TITLE
      ? titleFrom(input.content)
      : null;

  const saved = await repo.saveExchange(
    conversationId,
    input.content,
    answer,
    newTitle,
  );

  return {
    userMessage: toPublicMessage(saved.user),
    assistantMessage: toPublicMessage(saved.assistant),
    usedFallback: answer.usedFallback,
  };
}
