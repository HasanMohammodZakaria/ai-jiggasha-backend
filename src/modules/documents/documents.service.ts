import { createHash, randomUUID } from "node:crypto";
import {
  DocumentFileType,
  type Document as DocumentRow,
  type DocumentStatus,
} from "@prisma/client";
import { fileTypeFromBuffer } from "file-type";
import { documentStorage } from "../../providers/storage/cloudinary.documents.js";
import { AppError } from "../../shared/errors.js";
import * as repo from "./documents.repository.js";
import type {
  ListDocumentsQuery,
  UpdateDocumentInput,
  UploadDocumentInput,
} from "./documents.validators.js";

const DOWNLOAD_LINK_SECONDS = 5 * 60;

// The real file type is read from the file's bytes, never from its name or the browser's mime type.
const ALLOWED_TYPES: Record<
  string,
  { fileType: DocumentFileType; extension: "pdf" | "docx" }
> = {
  "application/pdf": { fileType: DocumentFileType.PDF, extension: "pdf" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    fileType: DocumentFileType.DOCX,
    extension: "docx",
  },
};

export interface PublicDocument {
  id: string;
  subjectId: string | null;
  title: string;
  originalName: string;
  fileType: DocumentFileType;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  errorMessage: string | null;
  pageCount: number | null;
  language: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentPage {
  documents: PublicDocument[];
  total: number;
  page: number;
  limit: number;
}

// Never return sha256 or the storage key to the client.
function toPublicDocument(doc: DocumentRow): PublicDocument {
  return {
    id: doc.id,
    subjectId: doc.subjectId,
    title: doc.title,
    originalName: doc.originalName,
    fileType: doc.fileType,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    errorMessage: doc.errorMessage,
    pageCount: doc.pageCount,
    language: doc.language,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function notFound(): AppError {
  return new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
}

function subjectNotFound(): AppError {
  return new AppError(404, "SUBJECT_NOT_FOUND", "Subject not found");
}

// Browsers send file names as UTF-8 but multer reads them as latin1: this restores Bangla/Urdu/Arabic names.
function cleanFileName(raw: string): string {
  const decoded = Buffer.from(raw, "latin1").toString("utf8");
  const base = decoded.split(/[\\/]/).pop() ?? decoded;
  return base.trim().slice(0, 255) || "document";
}

function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  return (withoutExtension || fileName).slice(0, 255);
}

export async function uploadDocument(
  userId: string,
  buffer: Buffer,
  rawFileName: string,
  input: UploadDocumentInput,
): Promise<PublicDocument> {
  const detected = await fileTypeFromBuffer(buffer);
  const allowed = detected ? ALLOWED_TYPES[detected.mime] : undefined;
  if (!detected || !allowed) {
    throw new AppError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "Only PDF and DOCX files are supported",
    );
  }

  if (
    input.subjectId &&
    !(await repo.findOwnedSubjectId(userId, input.subjectId))
  )
    throw subjectNotFound();

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const duplicate = await repo.findDuplicate(userId, sha256);
  if (duplicate) {
    throw new AppError(
      409,
      "DOCUMENT_ALREADY_EXISTS",
      `You have already uploaded this file as "${duplicate.title}"`,
      { documentId: duplicate.id },
    );
  }

  const originalName = cleanFileName(rawFileName);
  const documentId = randomUUID();
  const storageKey = await documentStorage.upload(buffer, {
    userId,
    documentId,
    extension: allowed.extension,
  });

  try {
    const doc = await repo.createDocument({
      id: documentId,
      userId,
      subjectId: input.subjectId ?? null,
      title: input.title ?? titleFromFileName(originalName),
      originalName,
      fileType: allowed.fileType,
      mimeType: detected.mime,
      sizeBytes: buffer.length,
      sha256,
      storageKey,
    });
    return toPublicDocument(doc);
  } catch (err) {
    // Saving failed after the upload: do not leave an orphan file behind.
    await documentStorage.remove(storageKey);
    throw err;
  }
}

export async function listDocuments(
  userId: string,
  query: ListDocumentsQuery,
): Promise<DocumentPage> {
  const { documents, total } = await repo.listDocuments(
    userId,
    { subjectId: query.subjectId, status: query.status },
    (query.page - 1) * query.limit,
    query.limit,
  );
  return {
    documents: documents.map(toPublicDocument),
    total,
    page: query.page,
    limit: query.limit,
  };
}

export async function getDocument(
  userId: string,
  id: string,
): Promise<PublicDocument> {
  const doc = await repo.findDocument(userId, id);
  if (!doc) throw notFound();
  return toPublicDocument(doc);
}

export async function updateDocument(
  userId: string,
  id: string,
  input: UpdateDocumentInput,
): Promise<PublicDocument> {
  if (
    input.subjectId &&
    !(await repo.findOwnedSubjectId(userId, input.subjectId))
  )
    throw subjectNotFound();

  const updated = await repo.updateDocument(userId, id, {
    title: input.title,
    subjectId: input.subjectId,
  });
  if (!updated) throw notFound();

  return getDocument(userId, id);
}

export async function deleteDocument(
  userId: string,
  id: string,
): Promise<void> {
  const doc = await repo.findDocument(userId, id);
  if (!doc) throw notFound();

  await repo.deleteDocument(userId, id);
  await documentStorage.remove(doc.storageKey);
}

export async function getDownloadLink(
  userId: string,
  id: string,
): Promise<{ url: string; expiresAt: Date }> {
  const doc = await repo.findDocument(userId, id);
  if (!doc) throw notFound();
  return documentStorage.getDownloadUrl(doc.storageKey, DOWNLOAD_LINK_SECONDS);
}
