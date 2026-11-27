import { Prisma, type ConversationScope } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { retryRead } from "../../shared/db-retry.js";

export interface RetrievalScope {
  kind: ConversationScope;
  subjectId: string | null;
  documentIds: string[];
}

export interface SourceChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  pageStart: number | null;
  pageEnd: number | null;
  sectionLabel: string | null;
  content: string;
  score: number; // cosine similarity, 1 = identical
}

// Every query filters on user_id: a student can never retrieve someone else's chunks.
export async function searchChunks(
  userId: string,
  vector: number[],
  scope: RetrievalScope,
  limit: number,
): Promise<SourceChunk[]> {
  let scopeSql = Prisma.empty;

  if (scope.kind === "DOCUMENTS") {
    if (scope.documentIds.length === 0) return []; // every selected document was deleted
    scopeSql = Prisma.sql`AND c.document_id IN (${Prisma.join(
      scope.documentIds.map((id) => Prisma.sql`${id}::uuid`),
    )})`;
  } else if (scope.kind === "SUBJECT") {
    if (!scope.subjectId) return []; // the subject was deleted
    scopeSql = Prisma.sql`AND d.subject_id = ${scope.subjectId}::uuid`;
  }

  const vectorLiteral = `[${vector.join(",")}]`;

  return retryRead(() =>
    prisma.$queryRaw<SourceChunk[]>(Prisma.sql`
      SELECT c.id::text AS id,
             c.document_id::text AS "documentId",
             d.title AS "documentTitle",
             c.page_start AS "pageStart",
             c.page_end AS "pageEnd",
             c.section_label AS "sectionLabel",
             c.content AS content,
             1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.user_id = ${userId}::uuid
        AND c.embedding IS NOT NULL
        AND d.status = 'READY'
        ${scopeSql}
      ORDER BY c.embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}`),
  );
}
