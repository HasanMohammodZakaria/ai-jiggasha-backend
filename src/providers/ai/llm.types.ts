export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  temperature: number;
  maxOutputTokens: number;
}

export interface LlmResult {
  text: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  generate(request: LlmRequest): Promise<LlmResult>;
}

// retryable = true: a timeout, 429 or 5xx (trying again may work).
// retryable = false: the provider refused the request (trying again will not help).
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
