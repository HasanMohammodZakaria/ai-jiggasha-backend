import { sendMail } from "./providers/email/brevo.mailer.js";

const to = process.argv[2];
if (!to) {
  console.error("Usage: npx tsx src/tmp-email-check.ts you@example.com");
  process.exit(1);
}

await sendMail({
  to,
  subject: "Jiggasha test email",
  text: "If you can read this, Brevo works.",
  html: "<p>If you can read this, <b>Brevo works</b>.</p>",
});
console.log("Sent. Check the inbox (and the spam folder).");
