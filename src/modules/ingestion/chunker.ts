import type { Piece } from "./text-extractor.js";

export interface Chunk {
  chunkIndex: number;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  sectionLabel: string | null;
  tokenCount: number;
}

// Non-Latin scripts use more tokens per character, so their chunks are smaller.
const LATIN = { target: 1800, overlap: 200, charsPerToken: 4 };
const OTHER = { target: 900, overlap: 100, charsPerToken: 2 };

// Splits one long paragraph at sentence ends (Latin, Bangla/Hindi danda, Urdu/Arabic marks).
function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let current = "";
  for (const sentence of text.split(/(?<=[.!?।۔؟])\s+/)) {
    if (sentence.length > max) {
      if (current) {
        out.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += max)
        out.push(sentence.slice(i, i + max));
      continue;
    }
    if (current && current.length + 1 + sentence.length > max) {
      out.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) out.push(current);
  return out;
}

// The end of the previous chunk is repeated at the start of the next one, cut at a word boundary.
function overlapTail(text: string, size: number): string {
  const tail = text.slice(-size);
  const space = tail.search(/\s/);
  return space === -1 ? tail : tail.slice(space + 1);
}

export function buildChunks(pieces: Piece[], language: string | null): Chunk[] {
  const cfg = language === null || language === "en" ? LATIN : OTHER;
  const chunks: Chunk[] = [];

  let parts: string[] = [];
  let length = 0;
  let pages: number[] = [];
  let section: string | null = null;
  let hasNew = false; // true once the current chunk holds text that is not just overlap

  const flush = (): void => {
    if (!hasNew) return;
    const content = parts.join(" ").trim();
    chunks.push({
      chunkIndex: chunks.length,
      content,
      pageStart: pages.length > 0 ? Math.min(...pages) : null,
      pageEnd: pages.length > 0 ? Math.max(...pages) : null,
      sectionLabel: section,
      tokenCount: Math.ceil(content.length / cfg.charsPerToken),
    });
    const carry = overlapTail(content, cfg.overlap);
    parts = carry ? [carry] : [];
    length = carry.length;
    pages = [];
    section = null;
    hasNew = false;
  };

  for (const piece of pieces) {
    for (const part of splitLong(piece.text, cfg.target)) {
      if (hasNew && length + 1 + part.length > cfg.target) flush();
      if (!hasNew) section = piece.section;
      parts.push(part);
      length += part.length + 1;
      hasNew = true;
      if (piece.page !== null) pages.push(piece.page);
    }
  }
  flush();

  return chunks;
}
