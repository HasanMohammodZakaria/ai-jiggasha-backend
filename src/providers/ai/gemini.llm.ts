import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env.js";
import {
  LlmError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
} from "./llm.types.js";

const TIMEOUT_MS = 20_000;
const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

function statusOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createGeminiProvider(): LlmProvider {
  const model = env.GEMINI_CHAT_MODEL;
  return {
    name: "gemini",
    model,
    async generate(request: LlmRequest): Promise<LlmResult> {
      let response;
      try {
        response = await withTimeout(
          client.models.generateContent({
            model,
            contents: request.messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            config: {
              systemInstruction: request.system,
              temperature: request.temperature,
              maxOutputTokens: request.maxOutputTokens,
            },
          }),
          TIMEOUT_MS,
        );
      } catch (err) {
        const status = statusOf(err);
        const retryable =
          status === undefined ||
          status === 408 ||
          status === 429 ||
          status >= 500;
        throw new LlmError("gemini request failed", retryable);
      }

      const text = response.text?.trim();
      // An empty answer usually means the reply was blocked: try the next provider.
      if (!text) throw new LlmError("gemini returned an empty answer", false);

      return {
        text,
        tokensIn: response.usageMetadata?.promptTokenCount ?? null,
        tokensOut: response.usageMetadata?.candidatesTokenCount ?? null,
      };
    },
  };
}
