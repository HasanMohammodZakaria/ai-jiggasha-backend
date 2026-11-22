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

export function findUserIdByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } });
}

// One query: the user and the first refresh token are created together (atomic).
export function createUserWithSession(user: NewUser, token: NewRefreshToken) {
  return prisma.user.create({
    data: { ...user, refreshTokens: { create: token } },
  });
}
