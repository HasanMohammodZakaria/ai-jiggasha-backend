import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

function post(mail: Mail): Promise<Response> {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM_ADDRESS },
      to: [{ email: mail.to }],
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

// Sends one transactional email through Brevo's HTTP API.
// One retry for network errors, timeouts, 429 and 5xx. Throws EMAIL_SEND_FAILED if it still fails.
export async function sendMail(mail: Mail): Promise<void> {
  let status: number | string = "network-error";
  let detail: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await post(mail);
      if (res.ok) return;
      status = res.status;
      detail = (await res.json().catch(() => null)) as {
        code?: string;
        message?: string;
      } | null;
      if (res.status < 500 && res.status !== 429) break; // client errors will not succeed on retry
    } catch (err) {
      status = err instanceof Error ? err.name : "unknown";
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 800));
  }

  // Never log the API key or the email body.
  logger.error(
    { status, brevoCode: detail?.code, brevoMessage: detail?.message },
    "Brevo email send failed",
  );
  throw new AppError(502, "EMAIL_SEND_FAILED", "Could not send the email");
}
