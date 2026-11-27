import {
  EMBED_QUEUE,
  getQueue,
  type EmbedDocumentJob,
} from "../../providers/queue/boss.js";

// delaySeconds: used when processing must continue later (quota or rate limit).
export async function enqueueEmbedding(
  documentId: string,
  delaySeconds = 0,
): Promise<void> {
  const job: EmbedDocumentJob = { documentId };
  await getQueue().send(
    EMBED_QUEUE,
    job,
    delaySeconds > 0 ? { startAfter: delaySeconds } : {},
  );
}
