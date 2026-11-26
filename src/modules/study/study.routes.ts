import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import * as controller from "./study.controller.js";
import {
  createFlashcardSetSchema,
  createQuizSchema,
  createSummarySchema,
  submitAttemptSchema,
} from "./study.validators.js";

// Every generation costs AI quota: 5 per minute per user.
const generationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? "anonymous",
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "You are generating too fast. Please wait a moment.",
    },
  },
});

export const studyRouter = Router();

// Every study route needs a logged-in user.
studyRouter.use(requireAuth);

studyRouter.post(
  "/summaries",
  generationLimiter,
  validateBody(createSummarySchema),
  controller.createSummary,
);
studyRouter.get("/summaries", controller.listSummaries);
studyRouter.get("/summaries/:id", controller.getSummary);
studyRouter.delete("/summaries/:id", controller.deleteSummary);

studyRouter.post(
  "/flashcard-sets",
  generationLimiter,
  validateBody(createFlashcardSetSchema),
  controller.createFlashcardSet,
);
studyRouter.get("/flashcard-sets", controller.listFlashcardSets);
studyRouter.get("/flashcard-sets/:id", controller.getFlashcardSet);
studyRouter.delete("/flashcard-sets/:id", controller.deleteFlashcardSet);

studyRouter.post(
  "/quizzes",
  generationLimiter,
  validateBody(createQuizSchema),
  controller.createQuiz,
);
studyRouter.get("/quizzes", controller.listQuizzes);
studyRouter.get("/quizzes/:id", controller.getQuiz);
studyRouter.delete("/quizzes/:id", controller.deleteQuiz);
studyRouter.post(
  "/quizzes/:id/attempts",
  validateBody(submitAttemptSchema),
  controller.submitAttempt,
);
studyRouter.get("/quizzes/:id/attempts", controller.listAttempts);
