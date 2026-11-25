import {
  DocumentStatus,
  type DocumentFileType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../../config/prisma.js";

export interface NewDocument {
  id: string;
  userId: string;
  subjectId: string | null;
  title: string;
  originalName: string;
  fileType: DocumentFileType;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
}

export interface DocumentChanges {
  title?: string | undefined;
  subjectId?: string | null | undefined;
}

export interface DocumentFilters {
  subjectId?: string | undefined;
  status?: DocumentStatus | undefined;
}

// Used to check that a subject belongs to this user before a document is put in it.
export function findOwnedSubjectId(userId: string, id: string) {
  return prisma.subject.findFirst({
    where: { id, userId },
    select: { id: true },
  });
}

// A FAILED document does not block re-uploading the same file.
export function findDuplicate(userId: string, sha256: string) {
  return prisma.document.findFirst({
    where: { userId, sha256, status: { not: DocumentStatus.FAILED } },
    select: { id: true, title: true },
  });
}

export function createDocument(data: NewDocument) {
  return prisma.document.create({ data });
}

// findFirst with userId: someone else's document looks exactly like "not found".
export function findDocument(userId: string, id: string) {
  return prisma.document.findFirst({ where: { id, userId } });
}

export async function listDocuments(
  userId: string,
  filters: DocumentFilters,
  skip: number,
  take: number,
) {
  const where: Prisma.DocumentWhereInput = {
    userId,
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  const [documents, total] = await prisma.$transaction([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.document.count({ where }),
  ]);
  return { documents, total };
}

// Returns false when the document does not exist or is not owned by this user.
export async function updateDocument(
  userId: string,
  id: string,
  changes: DocumentChanges,
): Promise<boolean> {
  const result = await prisma.document.updateMany({
    where: { id, userId },
    data: changes,
  });
  return result.count === 1;
}

export async function deleteDocument(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.document.deleteMany({ where: { id, userId } });
  return result.count === 1;
}
