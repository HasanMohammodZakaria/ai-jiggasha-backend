import { Prisma } from "@prisma/client";
import { AppError } from "../../shared/errors.js";
import * as repo from "./subjects.repository.js";
import type {
  CreateSubjectInput,
  UpdateSubjectInput,
} from "./subjects.validators.js";

export interface PublicSubject {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

type SubjectRow = NonNullable<Awaited<ReturnType<typeof repo.findSubject>>>;

function toPublicSubject(subject: SubjectRow): PublicSubject {
  return {
    id: subject.id,
    name: subject.name,
    description: subject.description,
    documentCount: subject._count.documents,
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
  };
}

function notFound(): AppError {
  return new AppError(404, "SUBJECT_NOT_FOUND", "Subject not found");
}

function nameTaken(): AppError {
  return new AppError(
    409,
    "SUBJECT_NAME_TAKEN",
    "You already have a subject with this name",
  );
}

// Two requests with the same name at the same moment: the unique index catches the second one.
function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function listSubjects(userId: string): Promise<PublicSubject[]> {
  const subjects = await repo.listSubjects(userId);
  return subjects.map(toPublicSubject);
}

export async function getSubject(
  userId: string,
  id: string,
): Promise<PublicSubject> {
  const subject = await repo.findSubject(userId, id);
  if (!subject) throw notFound();
  return toPublicSubject(subject);
}

export async function createSubject(
  userId: string,
  input: CreateSubjectInput,
): Promise<PublicSubject> {
  if (await repo.findSubjectIdByName(userId, input.name)) throw nameTaken();

  try {
    const subject = await repo.createSubject(userId, {
      name: input.name,
      description: input.description ?? null,
    });
    return toPublicSubject(subject);
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }
}

export async function updateSubject(
  userId: string,
  id: string,
  input: UpdateSubjectInput,
): Promise<PublicSubject> {
  if (input.name !== undefined) {
    const sameName = await repo.findSubjectIdByName(userId, input.name);
    if (sameName && sameName.id !== id) throw nameTaken();
  }

  try {
    const updated = await repo.updateSubject(userId, id, {
      name: input.name,
      description: input.description,
    });
    if (!updated) throw notFound();
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }

  return getSubject(userId, id);
}

// The subject's documents are kept; they just become "no subject".
export async function deleteSubject(userId: string, id: string): Promise<void> {
  if (!(await repo.deleteSubject(userId, id))) throw notFound();
}
