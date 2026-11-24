import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { verifyGoogleCredential } from "../../providers/auth/google.verifier.js";
import { sendMail, type Mail } from "../../providers/email/brevo.mailer.js";
import {
  passwordChangedMail,
  passwordResetMail,
} from "../../providers/email/email.templates.js";
import {
  deleteImage,
  uploadAvatarImage,
} from "../../providers/storage/cloudinary.js";
import { AppError } from "../../shared/errors.js";
import { processAvatar } from "../../shared/image.js";
import {
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from "../../shared/password.js";
import {
  generateRefreshToken,
  generateResetToken,
  hashRefreshToken,
  hashResetToken,
  newFamilyId,
  refreshTokenExpiry,
  signAccessToken,
} from "../../shared/tokens.js";
import * as repo from "./auth.repository.js";
import type { LoginInput, RegisterInput } from "./auth.validators.js";

export interface SessionMeta {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends Tokens {
  user: PublicUser;
}

export interface GoogleAuthResult extends AuthResult {
  isNewUser: boolean;
}

// Never return passwordHash or storage keys to the client.
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

function emailTaken(): AppError {
  return new AppError(
    409,
    "EMAIL_ALREADY_USED",
    "An account with this email already exists",
  );
}

function invalidCredentials(): AppError {
  return new AppError(
    401,
    "INVALID_CREDENTIALS",
    "Incorrect email or password",
  );
}

// One message for every refresh problem (unknown, expired, reused): attackers learn nothing.
function sessionExpired(): AppError {
  return new AppError(
    401,
    "SESSION_EXPIRED",
    "Your session has expired. Please log in again.",
  );
}

// A new login always starts a new session family with its first refresh token.
async function startSession(
  userId: string,
  meta: SessionMeta,
): Promise<Tokens> {
  const refreshToken = generateRefreshToken();
  await repo.createRefreshToken({
    userId,
    familyId: newFamilyId(),
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiry(),
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });
  return { accessToken: signAccessToken(userId), refreshToken };
}

export async function register(
  input: RegisterInput,
  avatarFile: Buffer | undefined,
  meta: SessionMeta,
): Promise<AuthResult> {
  if (await repo.findUserIdByEmail(input.email)) throw emailTaken();

  const userId = randomUUID();

  // Cheap checks first: validate and process the image before the expensive password hash.
  const webp = avatarFile ? await processAvatar(avatarFile) : undefined;
  const passwordHash = await hashPassword(input.password);
  const stored = webp ? await uploadAvatarImage(webp, userId) : undefined;

  const refreshToken = generateRefreshToken();

  try {
    const user = await repo.createUserWithSession(
      {
        id: userId,
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        avatarUrl: stored?.url ?? null,
        avatarStorageKey: stored?.publicId ?? null,
      },
      {
        familyId: newFamilyId(),
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: refreshTokenExpiry(),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    );
    return {
      user: toPublicUser(user),
      accessToken: signAccessToken(user.id),
      refreshToken,
    };
  } catch (err) {
    // Registration failed after the upload: do not leave an orphan image behind.
    if (stored) await deleteImage(stored.publicId);
    // Two sign-ups with the same email at the same moment: the unique index catches the second one.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    )
      throw emailTaken();
    throw err;
  }
}

export async function login(
  input: LoginInput,
  meta: SessionMeta,
): Promise<AuthResult> {
  const user = await repo.findUserByEmail(input.email);

  // Unknown email and Google-only accounts (no password) look exactly like a wrong password.
  if (!user?.passwordHash) {
    await verifyAgainstDummy(input.password); // same work as a real check, so timing does not leak
    throw invalidCredentials();
  }
  if (!(await verifyPassword(user.passwordHash, input.password)))
    throw invalidCredentials();

  return { user: toPublicUser(user), ...(await startSession(user.id, meta)) };
}

function displayName(name: string | null, email: string): string {
  const fromGoogle = name?.trim();
  if (fromGoogle && fromGoogle.length >= 2) return fromGoogle.slice(0, 80);
  const fromEmail = email.split("@")[0] ?? "";
  return fromEmail.length >= 2 ? fromEmail.slice(0, 80) : "Student";
}

// Sign in (or sign up) with a Google ID token. Identity = Google "sub", never the email alone.
export async function loginWithGoogle(
  credential: string,
  meta: SessionMeta,
): Promise<GoogleAuthResult> {
  const identity = await verifyGoogleCredential(credential);
  if (!identity.emailVerified) {
    throw new AppError(
      401,
      "GOOGLE_EMAIL_NOT_VERIFIED",
      "Your Google email address is not verified",
    );
  }

  // 1) Already linked: just log in.
  const linked = await repo.findGoogleAccount(identity.sub);
  if (linked) {
    return {
      user: toPublicUser(linked.user),
      ...(await startSession(linked.user.id, meta)),
      isNewUser: false,
    };
  }

  const account = { providerAccountId: identity.sub, email: identity.email };
  const picture =
    identity.picture && identity.picture.length <= 1000
      ? identity.picture
      : null;

  try {
    // 2) An account with this email already exists: link Google to it.
    const existing = await repo.findUserByEmail(identity.email);
    if (existing) {
      // A password account was never email-verified (verification is not built yet), so someone else
      // could have registered this address first. The Google owner has proven the address, so we
      // remove that password (they can set a new one with "forgot password") and end all old sessions.
      const user = await repo.linkGoogleAccount(existing.id, account, {
        wipePassword:
          existing.emailVerifiedAt === null && existing.passwordHash !== null,
        avatarUrl: existing.avatarUrl ? null : picture,
      });
      return {
        user: toPublicUser(user),
        ...(await startSession(user.id, meta)),
        isNewUser: false,
      };
    }

    // 3) Brand new user.
    const refreshToken = generateRefreshToken();
    const user = await repo.createGoogleUser(
      {
        id: randomUUID(),
        fullName: displayName(identity.name, identity.email),
        email: identity.email,
        avatarUrl: picture,
      },
      account,
      {
        familyId: newFamilyId(),
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: refreshTokenExpiry(),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    );
    return {
      user: toPublicUser(user),
      accessToken: signAccessToken(user.id),
      refreshToken,
      isNewUser: true,
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Two Google sign-ins for the same person at the same moment: the second one asks to retry.
      throw new AppError(
        409,
        "GOOGLE_SIGNIN_CONFLICT",
        "Please try signing in again",
      );
    }
    throw err;
  }
}

// Rotation: every refresh token works exactly once and is replaced by a new one.
export async function refresh(
  rawToken: string,
  meta: SessionMeta,
): Promise<Tokens> {
  const record = await repo.findRefreshTokenByHash(hashRefreshToken(rawToken));
  if (!record) throw sessionExpired();

  if (record.revokedAt) {
    // An already-used token came back: it may have been stolen. End the whole session family.
    await repo.revokeFamily(record.familyId);
    throw sessionExpired();
  }
  if (record.expiresAt <= new Date()) throw sessionExpired();

  const newToken = generateRefreshToken();
  const newId = randomUUID();

  // Only one request can win this update; a parallel request with the same token loses.
  if (!(await repo.markRotated(record.id, newId))) {
    await repo.revokeFamily(record.familyId);
    throw sessionExpired();
  }

  await repo.createRefreshToken({
    id: newId,
    userId: record.userId,
    familyId: record.familyId,
    tokenHash: hashRefreshToken(newToken),
    expiresAt: refreshTokenExpiry(),
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  return {
    accessToken: signAccessToken(record.userId),
    refreshToken: newToken,
  };
}

export async function logout(rawToken: string): Promise<void> {
  const record = await repo.findRefreshTokenByHash(hashRefreshToken(rawToken));
  if (record) await repo.revokeFamily(record.familyId);
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await repo.findUserById(userId);
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Please log in");
  return toPublicUser(user);
}

// ---------- Forgot / reset / change password ----------

const MAX_RESET_EMAILS_PER_HOUR = 3;

function invalidResetToken(): AppError {
  return new AppError(
    400,
    "INVALID_RESET_TOKEN",
    "This reset link is invalid or has expired. Please request a new one.",
  );
}

// Notification emails must never slow down or break the request that triggered them.
function sendInBackground(mail: Mail): void {
  void sendMail(mail).catch((err: unknown) => {
    logger.error(
      { errorName: err instanceof Error ? err.name : "unknown" },
      "Background email failed",
    );
  });
}

// The controller answers the client first, then runs this. It does nothing visible when the
// email is unknown, so the response never reveals which emails are registered.
export async function requestPasswordReset(
  email: string,
  meta: SessionMeta,
): Promise<void> {
  const user = await repo.findUserByEmail(email);
  if (!user) return;

  // Per-account cap: stops someone from flooding a student's inbox.
  const since = new Date(Date.now() - 60 * 60 * 1000);
  if (
    (await repo.countRecentResetTokens(user.id, since)) >=
    MAX_RESET_EMAILS_PER_HOUR
  )
    return;

  const token = generateResetToken();
  await repo.invalidateResetTokens(user.id); // only the newest link works
  await repo.createPasswordResetToken({
    userId: user.id,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(
      Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
    ),
    requestedIp: meta.ipAddress,
    requestedUserAgent: meta.userAgent,
  });

  const link = `${env.FRONTEND_ORIGIN}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    ...passwordResetMail({
      name: user.fullName,
      link,
      minutes: env.PASSWORD_RESET_TTL_MINUTES,
    }),
  });
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  const record = await repo.findResetTokenByHash(hashResetToken(token));
  if (!record || record.usedAt || record.expiresAt <= new Date())
    throw invalidResetToken();

  const passwordHash = await hashPassword(newPassword);

  // Single use: if two requests race with the same link, only one gets past this line.
  if (!(await repo.consumeResetToken(record.id))) throw invalidResetToken();

  // Having the emailed link proves the owner controls the address.
  await repo.setPasswordAndRevokeSessions(
    record.userId,
    passwordHash,
    record.user.emailVerifiedAt === null,
  );
  await repo.invalidateResetTokens(record.userId);

  sendInBackground({
    to: record.user.email,
    ...passwordChangedMail({ name: record.user.fullName }),
  });
}

// Logged-in password change. Other devices are logged out; this device gets a fresh session.
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  meta: SessionMeta,
): Promise<Tokens> {
  const user = await repo.findUserById(userId);
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Please log in");

  if (!user.passwordHash) {
    throw new AppError(
      400,
      "NO_PASSWORD_SET",
      'Your account has no password yet. Use "Forgot password" to set one.',
    );
  }
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    // 400, not 401: the frontend treats 401 as "session expired" and would try to refresh.
    throw new AppError(
      400,
      "INCORRECT_CURRENT_PASSWORD",
      "The current password is incorrect",
    );
  }

  const passwordHash = await hashPassword(newPassword);
  await repo.setPasswordAndRevokeSessions(user.id, passwordHash, false);
  await repo.invalidateResetTokens(user.id); // an old reset link must not undo this change

  sendInBackground({
    to: user.email,
    ...passwordChangedMail({ name: user.fullName }),
  });
  return startSession(user.id, meta);
}
