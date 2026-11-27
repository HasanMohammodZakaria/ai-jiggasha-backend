import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";

export const EMBED_OPERATION = "EMBED_DOCUMENT";

// The daily budget is used up: processing continues later, the document is not failed.
export class DailyQuotaExceededError extends Error {
  constructor() {
    super("Daily embedding budget reached");
    this.name = "DailyQuotaExceededError";
  }
}

interface Entry {
  at: number;
  requests: number;
  tokens: number;
}

const WINDOW_MS = 60_000;
const recent: Entry[] = [];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Every text counts as one request. Google may count a whole batch as one, but that is not
// verified, so this is the safe (slower) assumption.
export async function reserveEmbeddingQuota(
  requests: number,
  tokens: number,
): Promise<void> {
  const need = Math.min(requests, env.EMBEDDING_MAX_RPM);
  const needTokens = Math.min(tokens, env.EMBEDDING_MAX_TPM);

  // Daily budget: counted from the usage log (survives restarts); rolling 24 hours.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await prisma.aiUsageLog.aggregate({
    _sum: { units: true },
    where: { operation: EMBED_OPERATION, createdAt: { gte: since } },
  });
  if ((used._sum.units ?? 0) + need > env.EMBEDDING_DAILY_BUDGET) {
    throw new DailyQuotaExceededError();
  }

  // Per-minute limits: wait until the last 60 seconds leave enough room.
  for (;;) {
    const now = Date.now();
    while (recent.length > 0 && now - (recent[0]?.at ?? now) >= WINDOW_MS) {
      recent.shift();
    }
    const usedRequests = recent.reduce((sum, e) => sum + e.requests, 0);
    const usedTokens = recent.reduce((sum, e) => sum + e.tokens, 0);

    if (
      usedRequests + need <= env.EMBEDDING_MAX_RPM &&
      usedTokens + needTokens <= env.EMBEDDING_MAX_TPM
    ) {
      recent.push({ at: now, requests: need, tokens: needTokens });
      return;
    }
    const oldest = recent[0];
    const wait = oldest ? oldest.at + WINDOW_MS - now + 50 : 1000;
    await sleep(Math.min(Math.max(wait, 250), WINDOW_MS));
  }
}
