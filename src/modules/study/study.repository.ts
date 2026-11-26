import { prisma } from "../../config/prisma.js";
import type { SummaryLength } from "@prisma/client";
import type { ContextChunk } from "./study.context.js";

// ---------- documents and chunks ----------

export function findDocument(userId: string, id: string) {
  return prisma.document.findFirst({
    where: { id, userId },
    select: { id: true, title: true, status: true },
  });
}

export function listChunks(
  userId: string,
  documentId: string,
): Promise<ContextChunk[]> {
  return prisma.documentChunk.findMany({
    where: { userId, documentId },
    orderBy: { chunkIndex: "asc" },
    select: {
      id: true,
      pageStart: true,
      pageEnd: true,
      sectionLabel: true,
      content: true,
    },
  });
}

const forDocument = (documentId: string | undefined) =>
  documentId ? { documentId } : {};

// ---------- summaries ----------

export interface NewSummary {
  userId: string;
  documentId: string;
  documentTitle: string;
  length: SummaryLength;
  content: string;
  provider: string;
  model: string;
}

export function createSummary(data: NewSummary) {
  return prisma.summary.create({ data });
}

export function listSummaries(userId: string, documentId: string | undefined) {
  return prisma.summary.findMany({
    where: { userId, ...forDocument(documentId) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      documentId: true,
      documentTitle: true,
      length: true,
      createdAt: true,
    },
  });
}

// findFirst with userId: someone else's item looks exactly like "not found".
export function findSummary(userId: string, id: string) {
  return prisma.summary.findFirst({ where: { id, userId } });
}

export async function deleteSummary(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.summary.deleteMany({ where: { id, userId } });
  return result.count === 1;
}

// ---------- flashcards ----------

export interface NewCard {
  front: string;
  back: string;
}

export function createFlashcardSet(
  userId: string,
  documentId: string,
  title: string,
  cards: NewCard[],
) {
  return prisma.flashcardSet.create({
    data: {
      userId,
      documentId,
      title,
      cards: {
        create: cards.map((card, position) => ({ position, ...card })),
      },
    },
    include: { cards: { orderBy: { position: "asc" } } },
  });
}

export function listFlashcardSets(
  userId: string,
  documentId: string | undefined,
) {
  return prisma.flashcardSet.findMany({
    where: { userId, ...forDocument(documentId) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { cards: true } } },
  });
}

export function findFlashcardSet(userId: string, id: string) {
  return prisma.flashcardSet.findFirst({
    where: { id, userId },
    include: { cards: { orderBy: { position: "asc" } } },
  });
}

export async function deleteFlashcardSet(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.flashcardSet.deleteMany({
    where: { id, userId },
  });
  return result.count === 1;
}

// ---------- quizzes ----------

export interface NewQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourceChunkId: string | null;
  sourcePageStart: number | null;
  sourceSectionLabel: string | null;
}

export function createQuiz(
  userId: string,
  documentId: string,
  title: string,
  questions: NewQuestion[],
) {
  return prisma.quiz.create({
    data: {
      userId,
      documentId,
      title,
      questions: {
        create: questions.map((q, position) => ({ position, ...q })),
      },
    },
    include: { questions: { orderBy: { position: "asc" } } },
  });
}

export function listQuizzes(userId: string, documentId: string | undefined) {
  return prisma.quiz.findMany({
    where: { userId, ...forDocument(documentId) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { questions: true, attempts: true } } },
  });
}

export function findQuiz(userId: string, id: string) {
  return prisma.quiz.findFirst({
    where: { id, userId },
    include: { questions: { orderBy: { position: "asc" } } },
  });
}

export async function deleteQuiz(userId: string, id: string): Promise<boolean> {
  const result = await prisma.quiz.deleteMany({ where: { id, userId } });
  return result.count === 1;
}

export function createAttempt(
  quizId: string,
  userId: string,
  answers: (number | null)[],
  score: number,
  total: number,
) {
  return prisma.quizAttempt.create({
    data: { quizId, userId, answers, score, total },
  });
}

export function listAttempts(userId: string, quizId: string) {
  return prisma.quizAttempt.findMany({
    where: { quizId, userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, score: true, total: true, createdAt: true },
  });
}
