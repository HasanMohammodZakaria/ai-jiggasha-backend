import type { Request, Response } from "express";
import { AppError } from "../../shared/errors.js";
import * as documentsService from "./documents.service.js";
import {
  documentIdParamSchema,
  listDocumentsQuerySchema,
  type UpdateDocumentInput,
  type UploadDocumentInput,
} from "./documents.validators.js";

function currentUserId(req: Request): string {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, "UNAUTHENTICATED", "Please log in");
  return userId;
}

// A malformed id throws a ZodError, which the central error handler turns into a 400.
function documentId(req: Request): string {
  return documentIdParamSchema.parse(req.params).id;
}

export async function upload(req: Request, res: Response): Promise<void> {
  const input = req.body as UploadDocumentInput; // already validated by validateBody()
  const file = req.file;
  if (!file) {
    throw new AppError(
      400,
      "FILE_REQUIRED",
      "Please choose a PDF or DOCX file to upload",
    );
  }
  const document = await documentsService.uploadDocument(
    currentUserId(req),
    file.buffer,
    file.originalname,
    input,
  );
  res.status(201).json({ data: { document } });
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = listDocumentsQuerySchema.parse(req.query);
  const result = await documentsService.listDocuments(
    currentUserId(req),
    query,
  );
  res.json({ data: result });
}

export async function get(req: Request, res: Response): Promise<void> {
  const document = await documentsService.getDocument(
    currentUserId(req),
    documentId(req),
  );
  res.json({ data: { document } });
}

export async function update(req: Request, res: Response): Promise<void> {
  const input = req.body as UpdateDocumentInput;
  const document = await documentsService.updateDocument(
    currentUserId(req),
    documentId(req),
    input,
  );
  res.json({ data: { document } });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await documentsService.deleteDocument(currentUserId(req), documentId(req));
  res.json({ data: { ok: true } });
}

export async function download(req: Request, res: Response): Promise<void> {
  const link = await documentsService.getDownloadLink(
    currentUserId(req),
    documentId(req),
  );
  res.json({ data: link });
}
