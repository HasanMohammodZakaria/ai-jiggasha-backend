import type { Mail } from "./brevo.mailer.js";

type MailBody = Omit<Mail, "to">;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function passwordResetMail(params: {
  name: string;
  link: string;
  minutes: number;
}): MailBody {
  const name = escapeHtml(params.name);
  const link = escapeHtml(params.link);
  return {
    subject: "Reset your Jiggasha password",
    text:
      `Hi ${params.name},\n\n` +
      `We received a request to reset your Jiggasha password. Open this link to choose a new one:\n\n` +
      `${params.link}\n\n` +
      `The link works once and expires in ${params.minutes} minutes.\n` +
      `If you did not ask for this, you can ignore this email. Your password stays the same.\n`,
    html:
      `<p>Hi ${name},</p>` +
      `<p>We received a request to reset your Jiggasha password.</p>` +
      `<p><a href="${link}">Choose a new password</a></p>` +
      `<p>The link works once and expires in ${params.minutes} minutes.</p>` +
      `<p>If you did not ask for this, you can ignore this email. Your password stays the same.</p>`,
  };
}

export function passwordChangedMail(params: { name: string }): MailBody {
  const name = escapeHtml(params.name);
  return {
    subject: "Your Jiggasha password was changed",
    text:
      `Hi ${params.name},\n\n` +
      `Your Jiggasha password was just changed and you were logged out on all devices.\n` +
      `If this was not you, reset your password right away and check your account.\n`,
    html:
      `<p>Hi ${name},</p>` +
      `<p>Your Jiggasha password was just changed and you were logged out on all devices.</p>` +
      `<p>If this was not you, reset your password right away and check your account.</p>`,
  };
}
