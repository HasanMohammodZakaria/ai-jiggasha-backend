import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors.js";

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export interface GoogleIdentity {
  sub: string; // Google's permanent, unique user id (the identity key; never use the email as identity)
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

// Checks signature, issuer, expiry and audience (must be OUR client id) of the ID token.
export async function verifyGoogleCredential(
  credential: string,
): Promise<GoogleIdentity> {
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email)
      throw new Error("Missing required claims");
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  } catch (err) {
    // Log only the error type: library messages can contain the token itself.
    logger.warn(
      { errorName: err instanceof Error ? err.name : "unknown" },
      "Google ID token rejected",
    );
    throw new AppError(
      401,
      "INVALID_GOOGLE_TOKEN",
      "Google sign-in failed. Please try again.",
    );
  }
}
