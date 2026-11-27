import { DocumentFileType } from "@prisma/client";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import { buildChunks, type Chunk } from "./chunker.js";
import { detectLanguage } from "./language.js";
import { extractDocx, extractPdf } from "./text-extractor.js";

export interface PreparedDocument {
  chunks: Chunk[];
  pageCount: number | null;
  language: string | null;
}

// Runs before anything is stored: a file we cannot read is rejected right away.
export async function prepareDocument(
  buffer: Buffer,
  fileType: DocumentFileType,
): Promise<PreparedDocument> {
  const extracted =
    fileType === DocumentFileType.PDF
      ? await extractPdf(buffer)
      : await extractDocx(buffer);

  const fullText = extracted.pieces.map((p) => p.text).join("\n");
  const visible = fullText.replace(/\s/g, "");

  if (visible.length < 100) {
    throw new AppError(
      422,
      "NO_READABLE_TEXT",
      "No readable text was found in this file. Scanned documents are not supported yet.",
    );
  }

  // Broken fonts often come out as replacement characters: refuse instead of indexing garbage.
  const broken = fullText.match(/\uFFFD/g)?.length ?? 0;
  if (broken / visible.length > 0.1) {
    throw new AppError(
      422,
      "TEXT_UNREADABLE",
      "The text in this file could not be read correctly (unsupported font or encoding).",
    );
  }

  const language = detectLanguage(fullText);
  const chunks = buildChunks(extracted.pieces, language);

  if (chunks.length > env.MAX_CHUNKS_PER_DOCUMENT) {
    throw new AppError(
      422,
      "DOCUMENT_TOO_LONG",
      "This file is too long to process. Please upload a shorter file or split it.",
    );
  }

  return { chunks, pageCount: extracted.pageCount, language };
}
