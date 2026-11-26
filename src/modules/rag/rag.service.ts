import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  embedTexts,
  EmbeddingRateLimitError,
} from "../../providers/ai/embedding.provider.js";
import { generateAnswer } from "../../providers/ai/llm.router.js";
import type { LlmMessage } from "../../providers/ai/llm.types.js";
import { logAiUsage } from "../../providers/ai/usage.log.js";
import { AppError } from "../../shared/errors.js";
import { buildMessages, SYSTEM_PROMPT } from "./rag.prompt.js";
import {
  searchChunks,
  type RetrievalScope,
  type SourceChunk,
} from "./rag.repository.js";

const NOT_FOUND_MESSAGE =
  "I couldn't find the answer to this in your notes. Try rephrasing your question, or check that the right documents are selected.";

export interface AnswerSource {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageStart: number | null;
  pageEnd: number | null;
  sectionLabel: string | null;
  excerpt: string;
  score: number;
}

export interface RagAnswer {
  content: string;
  provider: string | null;
  model: string | null;
  usedFallback: boolean;
  sources: AnswerSource[];
}

export interface AnswerParams {
  userId: string;
  question: string;
  scope: RetrievalScope;
  history: LlmMessage[];
}

async function embedQuestion(
  userId: string,
  question: string,
): Promise<number[]> {
  const started = Date.now();
  const entry = {
    userId,
    provider: "gemini",
    model: env.EMBEDDING_MODEL,
    operation: "EMBED_QUERY",
    tokensIn: Math.ceil(question.length / 3),
  };
  try {
    const [vector] = await embedTexts([question], "RETRIEVAL_QUERY");
    if (!vector) throw new Error("empty embedding");
    await logAiUsage({
      ...entry,
      latencyMs: Date.now() - started,
      status: "OK",
    });
    return vector;
  } catch (err) {
    if (err instanceof EmbeddingRateLimitError) {
      await logAiUsage({
        ...entry,
        latencyMs: Date.now() - started,
        status: "RATE_LIMITED",
      });
      throw new AppError(
        429,
        "AI_BUSY",
        "The AI service is busy. Please try again in a minute.",
      );
    }
    await logAiUsage({
      ...entry,
      latencyMs: Date.now() - started,
      status: "ERROR",
    });
    throw new AppError(
      503,
      "AI_UNAVAILABLE",
      "The AI service is not available right now. Please try again in a moment.",
    );
  }
}

// The model's [1] [2] markers only pick which retrieved chunks to show. The page, title and
// excerpt always come from our database, never from the model's text.
function citedNumbers(text: string, max: number): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(match[1]);
    if (n >= 1 && n <= max) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

function toSource(chunk: SourceChunk): AnswerSource {
  return {
    chunkId: chunk.id,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    sectionLabel: chunk.sectionLabel,
    excerpt: chunk.content.slice(0, 300),
    score: chunk.score,
  };
}

export async function answerQuestion(params: AnswerParams): Promise<RagAnswer> {
  const vector = await embedQuestion(params.userId, params.question);
  const found = await searchChunks(
    params.userId,
    vector,
    params.scope,
    env.RAG_TOP_K,
  );

  // Scores are logged so RAG_MIN_SCORE can be tuned with real notes.
  logger.info(
    { topScore: found[0]?.score ?? null, found: found.length },
    "RAG retrieval",
  );

  const chunks = found.filter((chunk) => chunk.score >= env.RAG_MIN_SCORE);

  // Nothing relevant: the LLM is not called at all.
  if (chunks.length === 0) {
    return {
      content: NOT_FOUND_MESSAGE,
      provider: null,
      model: null,
      usedFallback: false,
      sources: [],
    };
  }

  const answer = await generateAnswer(params.userId, {
    system: SYSTEM_PROMPT,
    messages: buildMessages(params.question, chunks, params.history),
    temperature: 0.2,
    maxOutputTokens: 1024,
  });

  const cited = citedNumbers(answer.text, chunks.length);
  const picked =
    cited.length > 0
      ? cited
          .map((n) => chunks[n - 1])
          .filter((c): c is SourceChunk => c !== undefined)
      : chunks.slice(0, 3);

  return {
    content: answer.text,
    provider: answer.provider,
    model: answer.model,
    usedFallback: answer.usedFallback,
    sources: picked.map(toSource),
  };
}
