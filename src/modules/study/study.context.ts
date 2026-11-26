export interface ContextChunk {
  id: string;
  pageStart: number | null;
  pageEnd: number | null;
  sectionLabel: string | null;
  content: string;
}

// Keeps one request within the free-tier token limits.
const MAX_CONTEXT_CHARS = 24_000;

// A long document is sampled evenly from start to end, in reading order.
export function selectContext(chunks: ContextChunk[]): ContextChunk[] {
  const total = chunks.reduce((sum, c) => sum + c.content.length, 0);
  if (total <= MAX_CONTEXT_CHARS) return chunks;

  const average = total / chunks.length;
  const keep = Math.max(1, Math.floor(MAX_CONTEXT_CHARS / average));
  const picked: ContextChunk[] = [];
  for (let i = 0; i < keep; i += 1) {
    const chunk = chunks[Math.floor((i * chunks.length) / keep)];
    if (chunk) picked.push(chunk);
  }
  return picked;
}
