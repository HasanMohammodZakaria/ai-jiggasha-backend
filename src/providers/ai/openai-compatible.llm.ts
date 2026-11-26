import {
  LlmError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
} from "./llm.types.js";

const TIMEOUT_MS = 20_000;

interface Options {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  headers: Record<string, string>;
}

interface ChatCompletionBody {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function createOpenAiCompatibleProvider(options: Options): LlmProvider {
  return {
    name: options.name,
    model: options.model,
    async generate(request: LlmRequest): Promise<LlmResult> {
      let response: Response;
      try {
        response = await fetch(`${options.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiKey}`,
            ...options.headers,
          },
          body: JSON.stringify({
            model: options.model,
            messages: [
              { role: "system", content: request.system },
              ...request.messages,
            ],
            temperature: request.temperature,
            max_tokens: request.maxOutputTokens,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new LlmError(`${options.name} request failed`, true);
      }

      if (!response.ok) {
        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
        throw new LlmError(
          `${options.name} returned ${response.status}`,
          retryable,
        );
      }

      let body: ChatCompletionBody;
      try {
        body = (await response.json()) as ChatCompletionBody;
      } catch {
        throw new LlmError(
          `${options.name} returned an invalid response`,
          true,
        );
      }

      const text = body.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new LlmError(`${options.name} returned an empty answer`, true);
      }
      return {
        text,
        tokensIn: body.usage?.prompt_tokens ?? null,
        tokensOut: body.usage?.completion_tokens ?? null,
      };
    },
  };
}
