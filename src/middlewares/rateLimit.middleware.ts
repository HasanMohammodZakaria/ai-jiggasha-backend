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

// 10 sign-ups per hour per IP in production (relaxed in development for testing)
export const registerLimiter = limiter(60 * 60 * 1000, 10, 200);
