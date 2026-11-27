// Script-based guess: good enough to pick chunk sizes and to save documents.language.
// Arabic and Urdu share a script, so a few Urdu-only letters decide between them.
const URDU_ONLY = /[ٹڈڑںےھہۂۃ]/g;

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

export function detectLanguage(text: string): string | null {
  const sample = text.slice(0, 20_000);
  const scores: Record<string, number> = {
    bn: count(sample, /[\u0980-\u09FF]/g),
    hi: count(sample, /[\u0900-\u097F]/g),
    arabicScript: count(sample, /[\u0600-\u06FF\u0750-\u077F]/g),
    en: count(sample, /[A-Za-z]/g),
  };

  let best = "";
  let bestScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  if (bestScore < 20) return null;

  if (best === "arabicScript") {
    const urduHits = count(sample, URDU_ONLY);
    return urduHits / bestScore > 0.01 ? "ur" : "ar";
  }
  return best;
}
