import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  embedTexts,
  EmbeddingFatalError,
  EmbeddingRateLimitError,
} from "../../providers/ai/embedding.provider.js";
import {
  EMBED_QUEUE,
  getQueue,
  type EmbedDocumentJob,
} from "../../providers/queue/boss.js";
import {
  DailyQuotaExceededError,
  EMBED_OPERATION,
  reserveEmbeddingQuota,
} from "./embedding.quota.js";
import { enqueueEmbedding } from "./ingestion.queue.js";
import * as repo from "./ingestion.repository.js";

const BATCH_SIZE = 12;
const QUOTA_RETRY_SECONDS = 60 * 60;
const RATE_LIMIT_RETRY_SECONDS = 90;
const ATTEMPT_DELAYS_MS = [0, 2_000, 8_000]; // transient errors: three tries in a row

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Embeds one batch. Returns normally on success; throws the last error after three tries.
async function embedWithRetry(texts: string[]): Promise<number[][]> {
  let lastError: unknown;
  for (const delay of ATTEMPT_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    try {
      return await embedTexts(texts, "RETRIEVAL_DOCUMENT");
    } catch (err) {
      if (
        err instanceof EmbeddingRateLimitError ||
        err instanceof EmbeddingFatalError
      )
        throw err;
      lastError = err;
    }
  }
  throw lastError;
}

// Safe to run more than once: it only touches chunks that have no embedding yet.
export async function processDocument(documentId: string): Promise<void> {
  const doc = await repo.findProcessingDocument(documentId);
  if (!doc) return; // deleted or already finished

  let noteCleared = doc.errorMessage === null;

  for (;;) {
    const pending = await repo.listPendingChunks(documentId, BATCH_SIZE);
    if (pending.length === 0) {
      await repo.markReady(documentId);
      logger.info({ documentId }, "Document is ready");
      return;
    }

    const tokens = pending.reduce((sum, c) => sum + c.tokenCount, 0);

    try {
      await reserveEmbeddingQuota(pending.length, tokens);
    } catch (err) {
      if (err instanceof DailyQuotaExceededError) {
        await repo.setNote(
          documentId,
          "Daily AI limit reached. Processing will continue automatically.",
        );
        await enqueueEmbedding(documentId, QUOTA_RETRY_SECONDS);
        return;
      }
      throw err;
    }

    const started = Date.now();
    const usage = {
      userId: doc.userId,
      model: env.EMBEDDING_MODEL,
      operation: EMBED_OPERATION,
      units: pending.length,
      tokensIn: tokens,
    };

    try {
      const vectors = await embedWithRetry(pending.map((c) => c.content));
      await repo.saveEmbeddings(
        pending.map((chunk, i) => ({ id: chunk.id, vector: vectors[i] ?? [] })),
        env.EMBEDDING_MODEL,
      );
      await repo.logUsage({
        ...usage,
        latencyMs: Date.now() - started,
        status: "OK",
      });
      if (!noteCleared) {
        await repo.setNote(documentId, null);
        noteCleared = true;
      }
    } catch (err) {
      const latencyMs = Date.now() - started;

      if (err instanceof EmbeddingRateLimitError) {
        await repo.logUsage({ ...usage, latencyMs, status: "RATE_LIMITED" });
        await repo.setNote(
          documentId,
          "AI service is busy. Processing will continue automatically.",
        );
        await enqueueEmbedding(
          documentId,
          Math.max(err.retryAfterSeconds, RATE_LIMIT_RETRY_SECONDS),
        );
        return;
      }

      await repo.logUsage({ ...usage, latencyMs, status: "ERROR" });
      logger.error(
        { documentId, errorName: err instanceof Error ? err.name : "unknown" },
        "Embedding failed",
      );
      await repo.markFailed(
        documentId,
        "We could not process this document. Please try uploading it again.",
      );
      return;
    }
  }
}

export async function registerIngestionWorker(): Promise<void> {
  await getQueue().work<EmbedDocumentJob>(EMBED_QUEUE, async (jobs) => {
    for (const job of jobs) await processDocument(job.data.documentId);
  });
}
