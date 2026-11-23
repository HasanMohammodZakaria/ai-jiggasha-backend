import type { NextFunction, Request, Response } from "express";
import { ACCESS_COOKIE } from "../shared/cookies.js";
import { AppError } from "../shared/errors.js";
import { verifyAccessToken } from "../shared/tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

// Reads the access token from the HttpOnly cookie and sets req.user.
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token: unknown = req.cookies?.[ACCESS_COOKIE];
  const payload = typeof token === "string" ? verifyAccessToken(token) : null;
  if (!payload) {
    next(new AppError(401, "UNAUTHENTICATED", "Please log in"));
    return;
  }
  req.user = { id: payload.sub };
  next();
}
