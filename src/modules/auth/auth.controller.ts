import type { Request, Response } from "express";
import {
  clearAuthCookies,
  REFRESH_COOKIE,
  setAuthCookies,
} from "../../shared/cookies.js";
import { AppError } from "../../shared/errors.js";
import * as authService from "./auth.service.js";
import type {
  GoogleInput,
  LoginInput,
  RegisterInput,
} from "./auth.validators.js";

function sessionMeta(req: Request): authService.SessionMeta {
  return {
    userAgent: req.get("user-agent")?.slice(0, 512) ?? null,
    ipAddress: req.ip ?? null,
  };
}

function refreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function register(req: Request, res: Response): Promise<void> {
  const input = req.body as RegisterInput; // already validated by validateBody()
  const result = await authService.register(
    input,
    req.file?.buffer,
    sessionMeta(req),
  );
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(201).json({ data: { user: result.user } });
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = req.body as LoginInput;
  const result = await authService.login(input, sessionMeta(req));
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.json({ data: { user: result.user } });
}

export async function google(req: Request, res: Response): Promise<void> {
  const input = req.body as GoogleInput;
  const result = await authService.loginWithGoogle(
    input.credential,
    sessionMeta(req),
  );
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res
    .status(result.isNewUser ? 201 : 200)
    .json({ data: { user: result.user, isNewUser: result.isNewUser } });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = refreshCookie(req);
  try {
    if (!token)
      throw new AppError(
        401,
        "SESSION_EXPIRED",
        "Your session has expired. Please log in again.",
      );
    const tokens = await authService.refresh(token, sessionMeta(req));
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    res.json({ data: { ok: true } });
  } catch (err) {
    clearAuthCookies(res); // a failed refresh ends the session in the browser too
    throw err;
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = refreshCookie(req);
  if (token) await authService.logout(token);
  clearAuthCookies(res);
  res.json({ data: { ok: true } });
}

export async function me(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, "UNAUTHENTICATED", "Please log in");
  const user = await authService.getCurrentUser(userId);
  res.json({ data: { user } });
}
