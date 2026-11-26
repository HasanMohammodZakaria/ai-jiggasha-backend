// Excel, Google Sheets and LibreOffice treat a cell that starts with these characters as a
// formula. A leading apostrophe makes it plain text.
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

// The byte-order mark makes Excel read Bangla, Urdu and Arabic text correctly.
export function flashcardsToCsv(
  cards: { front: string; back: string }[],
): string {
  const rows = [
    ["Front", "Back"],
    ...cards.map((card) => [card.front, card.back]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function summaryToMarkdown(
  title: string,
  length: string,
  content: string,
): string {
  return `# ${title}\n\n_Summary (${length.toLowerCase()})_\n\n${content}\n`;
}

// Works for any language: a plain ASCII name plus the real UTF-8 name.
export function contentDisposition(
  baseName: string,
  extension: string,
): string {
  const clean =
    baseName
      .replace(/[\\/:*?"<>|\r\n]+/g, " ")
      .trim()
      .slice(0, 80) || "export";
  const ascii = clean.replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}.${extension}"; filename*=UTF-8''${encoded}.${extension}`;
}
