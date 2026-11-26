import { logger } from "../../config/logger.js";
import { prisma } from "../../config/prisma.js";

export interface AiUsageEntry {
  userId: string | null;
  provider: string;
  model: string;
  operation: string;
  tokensIn: number | null;
  latencyMs: number;
  status: "OK" | "RATE_LIMITED" | "ERROR";
}

// Logging must never break the request that triggered it.
export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    await prisma.aiUsageLog.create({ data: entry });
  } catch (err) {
    logger.warn(
      { errorName: err instanceof Error ? err.name : "unknown" },
      "Could not write AI usage log",
    );
  }
}
