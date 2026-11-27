import { Prisma } from "@prisma/client";
import { logger } from "../config/logger.js";

// Prisma error codes that mean "the connection broke", not "the query is wrong".
const CONNECTION_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);

function connectionErrorCode(err: unknown): string | null {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    CONNECTION_CODES.has(err.code)
  ) {
    return err.code;
  }
  if (err instanceof Prisma.PrismaClientInitializationError) return "init";
  return null;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Only for reads: running a read twice is always safe, running a write twice may not be.
// Neon can drop a pooled connection while it sits idle; the second try opens a fresh one.
export async function retryRead<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const code = connectionErrorCode(err);
    if (code === null) throw err;
    logger.warn(
      { code },
      "Database connection dropped, retrying the read once",
    );
    await sleep(500);
    return run();
  }
}
