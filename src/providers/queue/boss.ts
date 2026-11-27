import { PgBoss } from "pg-boss";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export const EMBED_QUEUE = "embed-document";

export interface EmbedDocumentJob {
  documentId: string;
}

let boss: PgBoss | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startQueue(): Promise<PgBoss> {
  const instance = new PgBoss({ connectionString: env.DIRECT_URL });

  instance.on("error", (err: Error) => {
    logger.warn(
      { reason: err.message, code: (err as NodeJS.ErrnoException).code },
      "pg-boss connection problem",
    );
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await instance.start();
      await instance.createQueue(EMBED_QUEUE, {
        retryLimit: 3,
        retryDelay: 60,
        expireInSeconds: 60 * 60,
      });
      boss = instance;
      return instance;
    } catch (err) {
      lastError = err;
      logger.warn({ attempt }, "Failed to start pg-boss queue, retrying...");
      if (attempt < 3) {
        await sleep(attempt * 1500);
      }
    }
  }

  throw lastError;
}

export function getQueue(): PgBoss {
  if (!boss) throw new Error("Queue has not been started");
  return boss;
}

export async function stopQueue(): Promise<void> {
  if (boss) await boss.stop();
}
