import { AuthProvider } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

export interface NewUser {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
  avatarStorageKey: string | null;
}

export interface NewRefreshToken {
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface NewRefreshTokenRow extends NewRefreshToken {
  id?: string;
  userId: string;
}

export function findUserIdByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

// One query: the user and the first refresh token are created together (atomic).
export function createUserWithSession(user: NewUser, token: NewRefreshToken) {
  return prisma.user.create({
    data: { ...user, refreshTokens: { create: token } },
  });
}

export function createRefreshToken(data: NewRefreshTokenRow) {
  return prisma.refreshToken.create({ data });
}

export function findRefreshTokenByHash(tokenHash: string) {
  return prisma.refreshToken.findUnique({ where: { tokenHash } });
}

// Marks a token as used. Returns false if it was already revoked (someone else got there first).
export async function markRotated(
  id: string,
  replacedById: string,
): Promise<boolean> {
  const result = await prisma.refreshToken.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date(), replacedById },
  });
  return result.count === 1;
}

// Ends a whole login session: every token that came from the same login.
export function revokeFamily(familyId: string) {
  return prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ---------- Google sign-in ----------

export interface NewGoogleUser {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
}

export interface NewAuthAccount {
  providerAccountId: string; // Google "sub"
  email: string;
}

export function findGoogleAccount(providerAccountId: string) {
  return prisma.authAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: AuthProvider.GOOGLE,
        providerAccountId,
      },
    },
    include: { user: true },
  });
}

// One query: user + Google account + first refresh token (atomic). No password.
export function createGoogleUser(
  user: NewGoogleUser,
  account: NewAuthAccount,
  token: NewRefreshToken,
) {
  return prisma.user.create({
    data: {
      ...user,
      emailVerifiedAt: new Date(), // Google already verified this email
      authAccounts: { create: { provider: AuthProvider.GOOGLE, ...account } },
      refreshTokens: { create: token },
    },
  });
}

// Links Google to an existing user. All in one transaction:
// 1) create the link, 2) mark email verified (and optionally remove the password / set avatar),
// 3) end every existing session of that user.
export async function linkGoogleAccount(
  userId: string,
  account: NewAuthAccount,
  options: { wipePassword: boolean; avatarUrl: string | null },
) {
  const now = new Date();
  const [, user] = await prisma.$transaction([
    prisma.authAccount.create({
      data: { userId, provider: AuthProvider.GOOGLE, ...account },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: now,
        ...(options.wipePassword ? { passwordHash: null } : {}),
        ...(options.avatarUrl ? { avatarUrl: options.avatarUrl } : {}),
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  return user;
}
