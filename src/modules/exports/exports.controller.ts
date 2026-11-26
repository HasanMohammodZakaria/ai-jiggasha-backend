import type { Request, Response } from "express";
import { AppError } from "../../shared/errors.js";
import * as exportsService from "./exports.service.js";
import {
  exportIdParamSchema,
  flashcardExportQuerySchema,
} from "./exports.validators.js";

function currentUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, "UNAUTHENTICATED", "Please log in");
  return userId;
}

function send(res: Response, file: exportsService.ExportFile): void {
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", file.disposition);
  res.setHeader("Cache-Control", "no-store");
  res.send(file.body);
}

export async function flashcardSet(req: Request, res: Response): Promise<void> {
  const { id } = exportIdParamSchema.parse(req.params);
  const { format } = flashcardExportQuerySchema.parse(req.query);
  send(
    res,
    await exportsService.exportFlashcardSet(currentUserId(req), id, format),
  );
}

export async function summary(req: Request, res: Response): Promise<void> {
  const { id } = exportIdParamSchema.parse(req.params);
  send(res, await exportsService.exportSummary(currentUserId(req), id));
}
