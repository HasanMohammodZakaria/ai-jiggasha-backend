import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { isProduction } from "../config/env.js";
import { AppError } from "../shared/errors.js";

function limiter(
  windowMs: number,
  productionLimit: number,
  developmentLimit: number,
): RequestHandler {
  return rateLimit({
    windowMs,
    limit: isProduction ? productionLimit : developmentLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(
        new AppError(
          429,
          "TOO_MANY_REQUESTS",
          "Too many requests. Please try again later.",
        ),
      );
    },
  });
}

const MINUTE = 60 * 1000;

// Per IP. Production limits are strict; development limits are relaxed for testing.
export const registerLimiter = limiter(60 * MINUTE, 10, 200);
export const loginLimiter = limiter(15 * MINUTE, 10, 200);
export const refreshLimiter = limiter(15 * MINUTE, 60, 500);
