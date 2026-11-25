import { prisma } from "../../config/prisma.js";

export interface NewSubject {
  name: string;
  description: string | null;
}

export interface SubjectChanges {
  name?: string | undefined;
  description?: string | null | undefined;
}

// Each subject comes back with how many documents it holds.
const withDocumentCount = {
  _count: { select: { documents: true } },
} as const;

export function listSubjects(userId: string) {
  return prisma.subject.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: withDocumentCount,
  });
}

// findFirst with userId: a subject that belongs to someone else looks exactly like "not found".
export function findSubject(userId: string, id: string) {
  return prisma.subject.findFirst({
    where: { id, userId },
    include: withDocumentCount,
  });
}

export function findSubjectIdByName(userId: string, name: string) {
  return prisma.subject.findUnique({
    where: { userId_name: { userId, name } },
    select: { id: true },
  });
}

export function createSubject(userId: string, data: NewSubject) {
  return prisma.subject.create({
    data: { userId, ...data },
    include: withDocumentCount,
  });
}

// Returns false when the subject does not exist or is not owned by this user.
export async function updateSubject(
  userId: string,
  id: string,
  changes: SubjectChanges,
): Promise<boolean> {
  const result = await prisma.subject.updateMany({
    where: { id, userId },
    data: changes,
  });
  return result.count === 1;
}

// Documents are kept: their subject_id becomes NULL (onDelete: SetNull in the schema).
export async function deleteSubject(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.subject.deleteMany({ where: { id, userId } });
  return result.count === 1;
}
