import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";
import { AppError } from "../shared/errors.js";

function send(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const error: { code: string; message: string; details?: unknown } = {
    code,
    message,
  };
  if (details !== undefined) error.details = details;
  res.status(status).json({ error });
}

function bodyParserErrorType(err: unknown): string | undefined {
  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    typeof err.type === "string"
  ) {
    return err.type;
  }
  return undefined;
}

export function notFoundHandler(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(new AppError(404, "NOT_FOUND", "Route not found"));
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    send(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    send(
      res,
      400,
      "VALIDATION_ERROR",
      "Invalid request data",
      err.issues.map((i) => ({
        path: i.path.map(String).join("."),
        message: i.message,
      })),
    );
    return;
  }

  const type = bodyParserErrorType(err);
  if (type === "entity.parse.failed") {
    send(res, 400, "INVALID_JSON", "Request body is not valid JSON");
    return;
  }
  if (type === "entity.too.large") {
    send(res, 413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    return;
  }

  // Unknown error: log details on the server only, never send them to the client.
  logger.error({ err, method: req.method, path: req.path }, "Unhandled error");
  send(
    res,
    500,
    "INTERNAL_ERROR",
    "Something went wrong. Please try again later.",
  );
}
