import { AppError } from "../../shared/errors.js";
import * as studyRepo from "../study/study.repository.js";
import {
  contentDisposition,
  flashcardsToCsv,
  summaryToMarkdown,
} from "./exports.formatters.js";

export interface ExportFile {
  body: string;
  contentType: string;
  disposition: string;
}

export async function exportFlashcardSet(
  userId: string,
  id: string,
  format: "csv" | "json",
): Promise<ExportFile> {
  const set = await studyRepo.findFlashcardSet(userId, id);
  if (!set)
    throw new AppError(
      404,
      "FLASHCARD_SET_NOT_FOUND",
      "Flashcard set not found",
    );

  const cards = set.cards.map((card) => ({
    front: card.front,
    back: card.back,
  }));
  if (format === "json") {
    return {
      body: JSON.stringify({ title: set.title, cards }, null, 2),
      contentType: "application/json; charset=utf-8",
      disposition: contentDisposition(`${set.title} flashcards`, "json"),
    };
  }
  return {
    body: flashcardsToCsv(cards),
    contentType: "text/csv; charset=utf-8",
    disposition: contentDisposition(`${set.title} flashcards`, "csv"),
  };
}

export async function exportSummary(
  userId: string,
  id: string,
): Promise<ExportFile> {
  const summary = await studyRepo.findSummary(userId, id);
  if (!summary)
    throw new AppError(404, "SUMMARY_NOT_FOUND", "Summary not found");
  return {
    body: summaryToMarkdown(
      summary.documentTitle,
      summary.length,
      summary.content,
    ),
    contentType: "text/markdown; charset=utf-8",
    disposition: contentDisposition(`${summary.documentTitle} summary`, "md"),
  };
}
