import type { ZodType } from "zod";
import { AppError } from "../../shared/errors.js";
import { generateAnswer } from "./llm.router.js";
import type { LlmRequest } from "./llm.types.js";

// Models sometimes wrap JSON in ```json fences or add a sentence around it.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

export interface JsonAnswer<T> {
  data: T;
  provider: string;
  model: string;
}

// The answer is checked with the Zod schema. A wrong format gets one more try.
export async function generateJson<T>(
  userId: string,
  request: LlmRequest,
  schema: ZodType<T>,
): Promise<JsonAnswer<T>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const answer = await generateAnswer(userId, request);
    const parsed = schema.safeParse(extractJson(answer.text));
    if (parsed.success) {
      return {
        data: parsed.data,
        provider: answer.provider,
        model: answer.model,
      };
    }
  }
  throw new AppError(
    502,
    "AI_BAD_RESPONSE",
    "The AI returned an unexpected answer. Please try again.",
  );
}
