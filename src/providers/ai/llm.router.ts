import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors.js";
import { LlmError, type LlmProvider, type LlmRequest } from "./llm.types.js";
import { createOpenAiCompatibleProvider } from "./openai-compatible.llm.js";
import { logAiUsage } from "./usage.log.js";

type ProviderName = (typeof env.ANSWER_FALLBACK_ORDER)[number];

// Every provider with a key. The order they are tried in comes from ANSWER_FALLBACK_ORDER.
const available: Record<ProviderName, LlmProvider | null> = {
  groq: env.GROQ_API_KEY
    ? createOpenAiCompatibleProvider({
        name: "groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: env.GROQ_API_KEY,
        model: env.GROQ_MODEL,
        headers: {},
      })
    : null,
  openrouter: env.OPENROUTER_API_KEY
    ? createOpenAiCompatibleProvider({
        name: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_MODEL,
        headers: { "HTTP-Referer": env.FRONTEND_ORIGIN, "X-Title": "Jiggasha" },
      })
    : null,
  mistral: env.MISTRAL_API_KEY
    ? createOpenAiCompatibleProvider({
        name: "mistral",
        baseUrl: "https://api.mistral.ai/v1",
        apiKey: env.MISTRAL_API_KEY,
        model: env.MISTRAL_MODEL,
        headers: {},
      })
    : null,
};

// A provider without a key is skipped. Gemini is not used for answers, only for embeddings.
const providers: LlmProvider[] = [...new Set(env.ANSWER_FALLBACK_ORDER)]
  .map((name) => available[name])
  .filter((provider): provider is LlmProvider => provider !== null);

// First try, then two retries (1 s and 3 s later) for temporary errors.
const ATTEMPT_DELAYS_MS = [0, 1_000, 3_000];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface LlmAnswer {
  text: string;
  provider: string;
  model: string;
  usedFallback: boolean;
}

export async function generateAnswer(
  userId: string,
  request: LlmRequest,
): Promise<LlmAnswer> {
  for (const [index, provider] of providers.entries()) {
    for (const delay of ATTEMPT_DELAYS_MS) {
      if (delay > 0) await sleep(delay);
      const started = Date.now();
      try {
        const result = await provider.generate(request);
        await logAiUsage({
          userId,
          provider: provider.name,
          model: provider.model,
          operation: "CHAT",
          tokensIn: result.tokensIn,
          latencyMs: Date.now() - started,
          status: "OK",
        });
        return {
          text: result.text,
          provider: provider.name,
          model: provider.model,
          usedFallback: index > 0,
        };
      } catch (err) {
        const retryable = err instanceof LlmError ? err.retryable : true;
        await logAiUsage({
          userId,
          provider: provider.name,
          model: provider.model,
          operation: "CHAT",
          tokensIn: null,
          latencyMs: Date.now() - started,
          status: "ERROR",
        });
        logger.warn(
          {
            provider: provider.name,
            errorName: err instanceof Error ? err.name : "unknown",
          },
          "LLM attempt failed",
        );
        if (!retryable) break; // go to the next provider
      }
    }
  }

  throw new AppError(
    503,
    "AI_UNAVAILABLE",
    "The AI service is not available right now. Please try again in a moment.",
  );
}
