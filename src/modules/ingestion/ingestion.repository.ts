import { DocumentStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

export interface PendingChunk {
  id: string;
  content: string;
  tokenCount: number;
}

// Only a PROCESSING document is worked on: a deleted or finished one is skipped.
export function findProcessingDocument(id: string) {
  return prisma.document.findFirst({
    where: { id, status: DocumentStatus.PROCESSING },
    select: { id: true, userId: true, errorMessage: true },
  });
}

// Chunks that still have no embedding. This is what makes the job safe to run again.
export function listPendingChunks(
  documentId: string,
  limit: number,
): Promise<PendingChunk[]> {
  return prisma.$queryRaw<PendingChunk[]>`
    SELECT id::text AS id, content, token_count AS "tokenCount"
    FROM document_chunks
    WHERE document_id = ${documentId}::uuid AND embedding IS NULL
    ORDER BY chunk_index
    LIMIT ${limit}`;
}

// Prisma cannot write vector columns, so this is raw (parameterized) SQL.
export async function saveEmbeddings(
  items: { id: string; vector: number[] }[],
  model: string,
): Promise<void> {
  await prisma.$transaction(
    items.map(
      (item) =>
        prisma.$executeRaw`
          UPDATE document_chunks
          SET embedding = ${`[${item.vector.join(",")}]`}::vector,
              embedding_model = ${model}
          WHERE id = ${item.id}::uuid`,
    ),
  );
}

export async function markReady(documentId: string): Promise<void> {
  await prisma.document.updateMany({
    where: { id: documentId, status: DocumentStatus.PROCESSING },
    data: { status: DocumentStatus.READY, errorMessage: null },
  });
}

export async function markFailed(
  documentId: string,
  message: string,
): Promise<void> {
  await prisma.document.updateMany({
    where: { id: documentId, status: { not: DocumentStatus.READY } },
    data: { status: DocumentStatus.FAILED, errorMessage: message },
  });
}

// A note shown to the student while the document is still PROCESSING (or null to clear it).
export async function setNote(
  documentId: string,
  note: string | null,
): Promise<void> {
  await prisma.document.updateMany({
    where: { id: documentId, status: DocumentStatus.PROCESSING },
    data: { errorMessage: note },
  });
}

export interface UsageEntry {
  userId: string;
  model: string;
  operation: string;
  units: number;
  tokensIn: number;
  latencyMs: number;
  status: "OK" | "RATE_LIMITED" | "ERROR";
}

export async function logUsage(entry: UsageEntry): Promise<void> {
  await prisma.aiUsageLog.create({
    data: { provider: "gemini", ...entry },
  });
}
