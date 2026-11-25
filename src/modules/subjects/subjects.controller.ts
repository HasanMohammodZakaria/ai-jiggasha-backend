import type { Request, Response } from "express";
import { AppError } from "../../shared/errors.js";
import * as subjectsService from "./subjects.service.js";
import {
  subjectIdParamSchema,
  type CreateSubjectInput,
  type UpdateSubjectInput,
} from "./subjects.validators.js";

function currentUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, "UNAUTHENTICATED", "Please log in");
  return userId;
}

// A malformed id throws a ZodError, which the central error handler turns into a 400.
function subjectId(req: Request): string {
  return subjectIdParamSchema.parse(req.params).id;
}

export async function list(req: Request, res: Response): Promise<void> {
  const subjects = await subjectsService.listSubjects(currentUserId(req));
  res.json({ data: { subjects } });
}

export async function get(req: Request, res: Response): Promise<void> {
  const subject = await subjectsService.getSubject(
    currentUserId(req),
    subjectId(req),
  );
  res.json({ data: { subject } });
}

export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateSubjectInput; // already validated by validateBody()
  const subject = await subjectsService.createSubject(
    currentUserId(req),
    input,
  );
  res.status(201).json({ data: { subject } });
}

export async function update(req: Request, res: Response): Promise<void> {
  const input = req.body as UpdateSubjectInput;
  const subject = await subjectsService.updateSubject(
    currentUserId(req),
    subjectId(req),
    input,
  );
  res.json({ data: { subject } });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await subjectsService.deleteSubject(currentUserId(req), subjectId(req));
  res.json({ data: { ok: true } });
}
