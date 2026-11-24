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

// ---------- Password reset ----------

export interface NewPasswordResetToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  requestedIp: string | null;
  requestedUserAgent: string | null;
}

export function countRecentResetTokens(userId: string, since: Date) {
  return prisma.passwordResetToken.count({
    where: { userId, createdAt: { gte: since } },
  });
}

// Older unused reset links stop working when a new one is requested or the password changes.
export function invalidateResetTokens(userId: string) {
  return prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
}

export function createPasswordResetToken(data: NewPasswordResetToken) {
  return prisma.passwordResetToken.create({ data });
}

export function findResetTokenByHash(tokenHash: string) {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
}

// Single use: only one request can flip usedAt from null. Expired tokens are refused too.
export async function consumeResetToken(id: string): Promise<boolean> {
  const now = new Date();
  const result = await prisma.passwordResetToken.updateMany({
    where: { id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  return result.count === 1;
}

// New password + end every session of the user, in one transaction.
export async function setPasswordAndRevokeSessions(
  userId: string,
  passwordHash: string,
  markEmailVerified: boolean,
): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        ...(markEmailVerified ? { emailVerifiedAt: now } : {}),
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
}
