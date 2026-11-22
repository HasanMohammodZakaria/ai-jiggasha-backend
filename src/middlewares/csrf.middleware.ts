import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const allowedOrigin = new URL(env.FRONTEND_ORIGIN).origin;

function originOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

// Cookies are sent automatically by browsers, so every state-changing request
// must come from our own frontend (checked via the Origin or Referer header).
export function csrfProtection(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin = originOf(req.get("origin")) ?? originOf(req.get("referer"));
  if (origin !== allowedOrigin) {
    next(new AppError(403, "CSRF_BLOCKED", "Request origin is not allowed"));
    return;
  }
  next();
}
