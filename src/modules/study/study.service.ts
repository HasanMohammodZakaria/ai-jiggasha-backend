import { z } from "zod";
import { generateJson } from "../../providers/ai/llm.json.js";
import { generateAnswer } from "../../providers/ai/llm.router.js";
import { AppError } from "../../shared/errors.js";
import { selectContext, type ContextChunk } from "./study.context.js";
import {
  FLASHCARD_SYSTEM,
  QUIZ_SYSTEM,
  SUMMARY_SYSTEM,
  flashcardTask,
  quizTask,
  summaryTask,
} from "./study.prompt.js";
import * as repo from "./study.repository.js";
import type {
  CreateFlashcardSetInput,
  CreateQuizInput,
  CreateSummaryInput,
  ListQuery,
  SubmitAttemptInput,
} from "./study.validators.js";

// ---------- shared ----------

function notFound(what: string): AppError {
  return new AppError(
    404,
    `${what.toUpperCase()}_NOT_FOUND`,
    `${what} not found`,
  );
}

async function loadContext(
  userId: string,
  documentId: string,
): Promise<{ doc: { id: string; title: string }; chunks: ContextChunk[] }> {
  const doc = await repo.findDocument(userId, documentId);
  if (!doc) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  if (doc.status !== "READY") {
    throw new AppError(
      409,
      "DOCUMENT_NOT_READY",
      "This document is still being processed. Please try again when it is ready.",
    );
  }
  const all = await repo.listChunks(userId, documentId);
  if (all.length === 0) {
    throw new AppError(
      409,
      "DOCUMENT_NOT_READY",
      "This document has no readable content yet.",
    );
  }
  return { doc, chunks: selectContext(all) };
}

// ---------- summaries ----------

export async function createSummary(userId: string, input: CreateSummaryInput) {
  const { doc, chunks } = await loadContext(userId, input.documentId);
  const answer = await generateAnswer(userId, {
    system: SUMMARY_SYSTEM,
    messages: [{ role: "user", content: summaryTask(chunks, input.length) }],
    temperature: 0.3,
    maxOutputTokens: 2048,
  });
  const summary = await repo.createSummary({
    userId,
    documentId: doc.id,
    documentTitle: doc.title,
    length: input.length,
    content: answer.text,
    provider: answer.provider,
    model: answer.model,
  });
  return { summary };
}

export async function listSummaries(userId: string, query: ListQuery) {
  return { summaries: await repo.listSummaries(userId, query.documentId) };
}

export async function getSummary(userId: string, id: string) {
  const summary = await repo.findSummary(userId, id);
  if (!summary) throw notFound("Summary");
  return { summary };
}

export async function deleteSummary(userId: string, id: string): Promise<void> {
  if (!(await repo.deleteSummary(userId, id))) throw notFound("Summary");
}

// ---------- flashcards ----------

const cardsSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().trim().min(1).max(500),
        back: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(40),
});

export async function createFlashcardSet(
  userId: string,
  input: CreateFlashcardSetInput,
) {
  const { doc, chunks } = await loadContext(userId, input.documentId);
  const result = await generateJson(
    userId,
    {
      system: FLASHCARD_SYSTEM,
      messages: [{ role: "user", content: flashcardTask(chunks, input.count) }],
      temperature: 0.4,
      maxOutputTokens: 4096,
    },
    cardsSchema,
  );
  const set = await repo.createFlashcardSet(
    userId,
    doc.id,
    doc.title,
    result.data.cards.slice(0, input.count),
  );
  return { flashcardSet: set };
}

export async function listFlashcardSets(userId: string, query: ListQuery) {
  const sets = await repo.listFlashcardSets(userId, query.documentId);
  return {
    flashcardSets: sets.map((set) => ({
      id: set.id,
      documentId: set.documentId,
      title: set.title,
      cardCount: set._count.cards,
      createdAt: set.createdAt,
    })),
  };
}

export async function getFlashcardSet(userId: string, id: string) {
  const set = await repo.findFlashcardSet(userId, id);
  if (!set) throw notFound("Flashcard set");
  return { flashcardSet: set };
}

export async function deleteFlashcardSet(
  userId: string,
  id: string,
): Promise<void> {
  if (!(await repo.deleteFlashcardSet(userId, id)))
    throw notFound("Flashcard set");
}

// ---------- quizzes ----------

const quizSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(500),
        options: z.array(z.string().trim().min(1).max(300)).length(4),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().trim().min(1).max(600),
        source: z.number().int().optional(),
      }),
    )
    .min(1)
    .max(30),
});

function optionsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

type QuizRow = NonNullable<Awaited<ReturnType<typeof repo.findQuiz>>>;

// A quiz that is being taken never contains the correct answers.
function toPlayableQuiz(quiz: QuizRow) {
  return {
    id: quiz.id,
    title: quiz.title,
    documentId: quiz.documentId,
    createdAt: quiz.createdAt,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      position: q.position,
      question: q.question,
      options: optionsOf(q.options),
    })),
  };
}

export async function createQuiz(userId: string, input: CreateQuizInput) {
  const { doc, chunks } = await loadContext(userId, input.documentId);
  const result = await generateJson(
    userId,
    {
      system: QUIZ_SYSTEM,
      messages: [{ role: "user", content: quizTask(chunks, input.count) }],
      temperature: 0.4,
      maxOutputTokens: 4096,
    },
    quizSchema,
  );

  const questions = result.data.questions
    // Drop questions whose options repeat: they would have two "correct" answers.
    .filter(
      (q) =>
        new Set(q.options.map((o) => o.toLowerCase())).size ===
        q.options.length,
    )
    .slice(0, input.count)
    .map((q) => {
      // The page or section comes from our database chunk, never from the model's text.
      const chunk = q.source !== undefined ? chunks[q.source - 1] : undefined;
      return {
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        sourceChunkId: chunk?.id ?? null,
        sourcePageStart: chunk?.pageStart ?? null,
        sourceSectionLabel: chunk?.sectionLabel ?? null,
      };
    });

  if (questions.length === 0) {
    throw new AppError(
      502,
      "AI_BAD_RESPONSE",
      "The AI returned an unexpected answer. Please try again.",
    );
  }

  const quiz = await repo.createQuiz(userId, doc.id, doc.title, questions);
  return { quiz: toPlayableQuiz(quiz) };
}

export async function listQuizzes(userId: string, query: ListQuery) {
  const quizzes = await repo.listQuizzes(userId, query.documentId);
  return {
    quizzes: quizzes.map((quiz) => ({
      id: quiz.id,
      documentId: quiz.documentId,
      title: quiz.title,
      questionCount: quiz._count.questions,
      attemptCount: quiz._count.attempts,
      createdAt: quiz.createdAt,
    })),
  };
}

export async function getQuiz(userId: string, id: string) {
  const quiz = await repo.findQuiz(userId, id);
  if (!quiz) throw notFound("Quiz");
  return { quiz: toPlayableQuiz(quiz) };
}

export async function deleteQuiz(userId: string, id: string): Promise<void> {
  if (!(await repo.deleteQuiz(userId, id))) throw notFound("Quiz");
}

export async function submitAttempt(
  userId: string,
  quizId: string,
  input: SubmitAttemptInput,
) {
  const quiz = await repo.findQuiz(userId, quizId);
  if (!quiz) throw notFound("Quiz");

  if (input.answers.length !== quiz.questions.length) {
    throw new AppError(
      400,
      "INVALID_ANSWERS",
      "Send one answer for every question (use null for a skipped question).",
    );
  }

  const results = quiz.questions.map((q, i) => {
    const selectedIndex = input.answers[i] ?? null;
    return {
      questionId: q.id,
      selectedIndex,
      correctIndex: q.correctIndex,
      isCorrect: selectedIndex === q.correctIndex,
      explanation: q.explanation,
      sourcePageStart: q.sourcePageStart,
      sourceSectionLabel: q.sourceSectionLabel,
    };
  });
  const score = results.filter((r) => r.isCorrect).length;

  const attempt = await repo.createAttempt(
    quiz.id,
    userId,
    results.map((r) => r.selectedIndex),
    score,
    results.length,
  );

  return {
    attempt: {
      id: attempt.id,
      score: attempt.score,
      total: attempt.total,
      createdAt: attempt.createdAt,
    },
    results,
  };
}

export async function listAttempts(userId: string, quizId: string) {
  if (!(await repo.findQuiz(userId, quizId))) throw notFound("Quiz");
  return { attempts: await repo.listAttempts(userId, quizId) };
}
