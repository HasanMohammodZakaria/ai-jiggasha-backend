import type { Request, Response } from "express";
import { setAuthCookies } from "../../shared/cookies.js";
import * as authService from "./auth.service.js";
import type { RegisterInput } from "./auth.validators.js";

function sessionMeta(req: Request): authService.SessionMeta {
  return {
    userAgent: req.get("user-agent")?.slice(0, 512) ?? null,
    ipAddress: req.ip ?? null,
  };
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
