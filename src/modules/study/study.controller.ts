import type { Request, Response } from "express";
import { AppError } from "../../shared/errors.js";
import * as study from "./study.service.js";
import {
  idParamSchema,
  listQuerySchema,
  type CreateFlashcardSetInput,
  type CreateQuizInput,
  type CreateSummaryInput,
  type SubmitAttemptInput,
} from "./study.validators.js";

function currentUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, "UNAUTHENTICATED", "Please log in");
  return userId;
}

// A malformed id or query throws a ZodError, which the central error handler turns into a 400.
const itemId = (req: Request): string => idParamSchema.parse(req.params).id;
const listQuery = (req: Request) => listQuerySchema.parse(req.query);

// ---------- summaries ----------

export async function createSummary(
  req: Request,
  res: Response,
): Promise<void> {
  const input = req.body as CreateSummaryInput; // already validated by validateBody()
  res
    .status(201)
    .json({ data: await study.createSummary(currentUserId(req), input) });
}

export async function listSummaries(
  req: Request,
  res: Response,
): Promise<void> {
  res.json({
    data: await study.listSummaries(currentUserId(req), listQuery(req)),
  });
}

export async function getSummary(req: Request, res: Response): Promise<void> {
  res.json({ data: await study.getSummary(currentUserId(req), itemId(req)) });
}

export async function deleteSummary(
  req: Request,
  res: Response,
): Promise<void> {
  await study.deleteSummary(currentUserId(req), itemId(req));
  res.json({ data: { ok: true } });
}

// ---------- flashcards ----------

export async function createFlashcardSet(
  req: Request,
  res: Response,
): Promise<void> {
  const input = req.body as CreateFlashcardSetInput;
  res
    .status(201)
    .json({ data: await study.createFlashcardSet(currentUserId(req), input) });
}

export async function listFlashcardSets(
  req: Request,
  res: Response,
): Promise<void> {
  res.json({
    data: await study.listFlashcardSets(currentUserId(req), listQuery(req)),
  });
}

export async function getFlashcardSet(
  req: Request,
  res: Response,
): Promise<void> {
  res.json({
    data: await study.getFlashcardSet(currentUserId(req), itemId(req)),
  });
}

export async function deleteFlashcardSet(
  req: Request,
  res: Response,
): Promise<void> {
  await study.deleteFlashcardSet(currentUserId(req), itemId(req));
  res.json({ data: { ok: true } });
}

// ---------- quizzes ----------

export async function createQuiz(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateQuizInput;
  res
    .status(201)
    .json({ data: await study.createQuiz(currentUserId(req), input) });
}

export async function listQuizzes(req: Request, res: Response): Promise<void> {
  res.json({
    data: await study.listQuizzes(currentUserId(req), listQuery(req)),
  });
}

export async function getQuiz(req: Request, res: Response): Promise<void> {
  res.json({ data: await study.getQuiz(currentUserId(req), itemId(req)) });
}

export async function deleteQuiz(req: Request, res: Response): Promise<void> {
  await study.deleteQuiz(currentUserId(req), itemId(req));
  res.json({ data: { ok: true } });
}

export async function submitAttempt(
  req: Request,
  res: Response,
): Promise<void> {
  const input = req.body as SubmitAttemptInput;
  res.status(201).json({
    data: await study.submitAttempt(currentUserId(req), itemId(req), input),
  });
}

export async function listAttempts(req: Request, res: Response): Promise<void> {
  res.json({ data: await study.listAttempts(currentUserId(req), itemId(req)) });
}
