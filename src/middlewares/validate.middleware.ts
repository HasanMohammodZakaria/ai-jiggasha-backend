import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

// Parses and replaces req.body. A ZodError is thrown and handled by the central error handler (400).
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body ?? {});
    next();
  };
}
