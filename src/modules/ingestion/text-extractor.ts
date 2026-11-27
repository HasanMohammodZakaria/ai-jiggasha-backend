import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors.js";

// One paragraph-sized piece of text, with where it came from.
export interface Piece {
  text: string;
  page: number | null; // PDF only
  section: string | null; // DOCX only (nearest heading above)
}

export interface Extracted {
  pieces: Piece[];
  pageCount: number | null;
}

function unreadable(kind: string): AppError {
  return new AppError(
    422,
    "DOCUMENT_UNREADABLE",
    `We could not read this ${kind} file. It may be damaged or password protected.`,
  );
}

// Lines of one paragraph are joined; blank lines separate paragraphs.
function toParagraphs(raw: string): string[] {
  return raw
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{2,}/g, "\u0001")
    .replace(/\n/g, " ")
    .split("\u0001")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

export async function extractPdf(buffer: Buffer): Promise<Extracted> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    if (pdf.numPages > env.MAX_PAGES_PER_DOCUMENT) {
      throw new AppError(
        422,
        "DOCUMENT_TOO_LONG",
        `This PDF has ${pdf.numPages} pages. The limit is ${env.MAX_PAGES_PER_DOCUMENT} pages.`,
      );
    }
    const { text } = await extractText(pdf, { mergePages: false });

    const pieces: Piece[] = [];
    text.forEach((pageText, index) => {
      for (const paragraph of toParagraphs(pageText)) {
        pieces.push({ text: paragraph, page: index + 1, section: null });
      }
    });
    return { pieces, pageCount: pdf.numPages };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn(
      { errorName: err instanceof Error ? err.name : "unknown" },
      "PDF parse failed",
    );
    throw unreadable("PDF");
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// DOCX has no page numbers, so the nearest heading above a paragraph is used as its "section".
export async function extractDocx(buffer: Buffer): Promise<Extracted> {
  try {
    const { value: html } = await mammoth.convertToHtml({ buffer });

    const pieces: Piece[] = [];
    let section: string | null = null;
    const blocks = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/g;

    for (const match of html.matchAll(blocks)) {
      const tag = match[1] ?? "";
      const text = stripTags(match[2] ?? "");
      if (!text) continue;
      if (tag.startsWith("h")) {
        section = text.slice(0, 255);
        continue;
      }
      pieces.push({ text, page: null, section });
    }
    return { pieces, pageCount: null };
  } catch (err) {
    logger.warn(
      { errorName: err instanceof Error ? err.name : "unknown" },
      "DOCX parse failed",
    );
    throw unreadable("DOCX");
  }
}
