import { PgBoss } from "pg-boss";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export const EMBED_QUEUE = "embed-document";

export interface EmbedDocumentJob {
  documentId: string;
}

let boss: PgBoss | undefined;

// pg-boss keeps its jobs in the "pgboss" schema of the same Neon database.
// It uses the direct (non-pooled) connection string.
export async function startQueue(): Promise<PgBoss> {
  const instance = new PgBoss({ connectionString: env.DIRECT_URL });
  instance.on("error", (err: Error) => {
    logger.error({ errorName: err.name }, "pg-boss error");
  });
  await instance.start();
  await instance.createQueue(EMBED_QUEUE, {
    retryLimit: 3,
    retryDelay: 60,
    expireInSeconds: 60 * 60,
  });
  boss = instance;
  return instance;
}

export function getQueue(): PgBoss {
  if (!boss) throw new Error("Queue has not been started");
  return boss;
}

export async function stopQueue(): Promise<void> {
  if (boss) await boss.stop();
}
