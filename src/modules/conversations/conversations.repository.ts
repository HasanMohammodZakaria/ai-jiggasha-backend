import { ConversationScope, MessageRole } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { RagAnswer } from "../rag/rag.service.js";

export interface NewConversation {
  title: string;
  subjectId: string | null;
  scope: ConversationScope;
  documentIds: string[];
}

const counts = {
  _count: { select: { messages: true, documents: true } },
} as const;

export function findOwnedSubjectId(userId: string, id: string) {
  return prisma.subject.findFirst({
    where: { id, userId },
    select: { id: true },
  });
}

export function countOwnedDocuments(userId: string, ids: string[]) {
  return prisma.document.count({ where: { userId, id: { in: ids } } });
}

export function createConversation(userId: string, data: NewConversation) {
  return prisma.conversation.create({
    data: {
      userId,
      title: data.title,
      subjectId: data.subjectId,
      scope: data.scope,
      documents: {
        create: data.documentIds.map((documentId) => ({ documentId })),
      },
    },
    include: counts,
  });
}

export async function listConversations(
  userId: string,
  skip: number,
  take: number,
) {
  const [conversations, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
      include: counts,
    }),
    prisma.conversation.count({ where: { userId } }),
  ]);
  return { conversations, total };
}

// findFirst with userId: someone else's conversation looks exactly like "not found".
export function findConversation(userId: string, id: string) {
  return prisma.conversation.findFirst({
    where: { id, userId },
    include: {
      ...counts,
      documents: {
        select: {
          document: { select: { id: true, title: true, status: true } },
        },
      },
    },
  });
}

export function listMessages(conversationId: string) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: { sources: { orderBy: { position: "asc" } } },
  });
}

export async function recentMessages(conversationId: string, take: number) {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take,
    select: { role: true, content: true },
  });
  return rows.reverse();
}

export async function renameConversation(
  userId: string,
  id: string,
  title: string,
): Promise<boolean> {
  const result = await prisma.conversation.updateMany({
    where: { id, userId },
    data: { title },
  });
  return result.count === 1;
}

// Messages and their sources are removed by the database (onDelete: Cascade).
export async function deleteConversation(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.conversation.deleteMany({
    where: { id, userId },
  });
  return result.count === 1;
}

// The question and the answer are saved together or not at all.
export function saveExchange(
  conversationId: string,
  question: string,
  answer: RagAnswer,
  newTitle: string | null,
) {
  // Created in one transaction, so the database clock would give both the same time:
  // set the times here so the question always sorts before the answer.
  const now = Date.now();
  return prisma.$transaction(async (tx) => {
    const user = await tx.message.create({
      data: {
        conversationId,
        role: MessageRole.USER,
        content: question,
        createdAt: new Date(now),
      },
      include: { sources: true },
    });
    const assistant = await tx.message.create({
      data: {
        conversationId,
        role: MessageRole.ASSISTANT,
        content: answer.content,
        provider: answer.provider,
        model: answer.model,
        createdAt: new Date(now + 1),
        sources: {
          create: answer.sources.map((source, position) => ({
            chunkId: source.chunkId,
            documentId: source.documentId,
            documentTitle: source.documentTitle,
            pageStart: source.pageStart,
            pageEnd: source.pageEnd,
            sectionLabel: source.sectionLabel,
            excerpt: source.excerpt,
            score: source.score,
            position,
          })),
        },
      },
      include: { sources: { orderBy: { position: "asc" } } },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), ...(newTitle ? { title: newTitle } : {}) },
    });
    return { user, assistant };
  });
}
