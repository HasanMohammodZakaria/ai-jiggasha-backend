import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env.js";

// Must match vector(1536) in schema.prisma. Changing it means re-embedding every chunk.
export const EMBEDDING_DIMENSIONS = 1536;

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

// Google says "slow down": wait and try again later.
export class EmbeddingRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Embedding rate limit reached");
    this.name = "EmbeddingRateLimitError";
  }
}

// Retrying will not help (bad key, bad request).
export class EmbeddingFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingFatalError";
  }
}

const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// Only the 3072-dimension output is normalized by the API; smaller sizes must be normalized here.
function normalize(vector: number[]): number[] {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum);
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

function statusOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

export async function embedTexts(
  texts: string[],
  task: EmbeddingTask,
): Promise<number[][]> {
  let embeddings;
  try {
    const response = await client.models.embedContent({
      model: env.EMBEDDING_MODEL,
      contents: texts,
      config: { taskType: task, outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    embeddings = response.embeddings ?? [];
  } catch (err) {
    const status = statusOf(err);
    if (status === 429) throw new EmbeddingRateLimitError(60);
    if (status !== undefined && status >= 400 && status < 500) {
      throw new EmbeddingFatalError(`Embedding request rejected (${status})`);
    }
    throw err; // timeouts and 5xx: the caller retries
  }

  if (embeddings.length !== texts.length) {
    throw new EmbeddingFatalError("Unexpected embedding response");
  }
  return embeddings.map((item) => {
    const values = item.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingFatalError("Unexpected embedding size");
    }
    return normalize(values);
  });
}
