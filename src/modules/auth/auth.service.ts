import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
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
  hashRefreshToken,
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

  // New login = new session family.
  const refreshToken = generateRefreshToken();
  await repo.createRefreshToken({
    userId: user.id,
    familyId: newFamilyId(),
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiry(),
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });
  return {
    user: toPublicUser(user),
    accessToken: signAccessToken(user.id),
    refreshToken,
  };
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
