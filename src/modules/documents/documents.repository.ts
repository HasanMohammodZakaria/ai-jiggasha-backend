import {
  DocumentStatus,
  type DocumentFileType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { Chunk } from "../ingestion/chunker.js";

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
  pageCount: number | null;
  language: string | null;
}

export interface DocumentChanges {
  title?: string | undefined;
  subjectId?: string | null | undefined;
}

export interface DocumentFilters {
  subjectId?: string | undefined;
  status?: DocumentStatus | undefined;
}

const CHUNK_BATCH_SIZE = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientDbError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";

  return (
    code === "P1017" ||
    code === "P1001" ||
    code === "P1002" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    message.includes("Server has closed the connection") ||
    message.includes("ConnectionReset") ||
    message.includes("10054")
  );
}

async function withDbRetry<T>(
  operation: () => Promise<T>,
  retries = 2,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isTransientDbError(err)) {
        throw err;
      }
      await sleep(attempt * 1000);
    }
  }
}

export function findOwnedSubjectId(userId: string, id: string) {
  return withDbRetry(() =>
    prisma.subject.findFirst({
      where: { id, userId },
      select: { id: true },
    }),
  );
}

export function findDuplicate(userId: string, sha256: string) {
  return withDbRetry(() =>
    prisma.document.findFirst({
      where: { userId, sha256, status: { not: DocumentStatus.FAILED } },
      select: { id: true, title: true },
    }),
  );
}

// Creates the document first, then inserts chunks in smaller batches with retry on transient disconnects.
export async function createDocumentWithChunks(
  data: NewDocument,
  chunks: Chunk[],
) {
  const doc = await withDbRetry(() =>
    prisma.document.create({
      data: { ...data, status: DocumentStatus.PROCESSING },
    }),
  );

  try {
    for (let i = 0; i < chunks.length; i += CHUNK_BATCH_SIZE) {
      const batch = chunks.slice(i, i + CHUNK_BATCH_SIZE).map((chunk) => ({
        documentId: doc.id,
        userId: data.userId,
        ...chunk,
      }));

      await withDbRetry(() =>
        prisma.documentChunk.createMany({
          data: batch,
          skipDuplicates: true,
        }),
      );
    }

    return doc;
  } catch (err) {
    // Clean up the newly created document row if chunk insertion ultimately fails.
    await prisma.document.delete({ where: { id: doc.id } }).catch(() => {});
    throw err;
  }
}

export function findDocument(userId: string, id: string) {
  return withDbRetry(() =>
    prisma.document.findFirst({ where: { id, userId } }),
  );
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

  return withDbRetry(async () => {
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
  });
}

export async function updateDocument(
  userId: string,
  id: string,
  changes: DocumentChanges,
): Promise<boolean> {
  const result = await withDbRetry(() =>
    prisma.document.updateMany({
      where: { id, userId },
      data: changes,
    }),
  );
  return result.count === 1;
}

export async function deleteDocument(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await withDbRetry(() =>
    prisma.document.deleteMany({ where: { id, userId } }),
  );
  return result.count === 1;
}
