import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import {
  deleteImage,
  uploadAvatarImage,
} from "../../providers/storage/cloudinary.js";
import { AppError } from "../../shared/errors.js";
import { processAvatar } from "../../shared/image.js";
import { hashPassword } from "../../shared/password.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  newFamilyId,
  refreshTokenExpiry,
  signAccessToken,
} from "../../shared/tokens.js";
import * as repo from "./auth.repository.js";
import type { RegisterInput } from "./auth.validators.js";

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

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
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
