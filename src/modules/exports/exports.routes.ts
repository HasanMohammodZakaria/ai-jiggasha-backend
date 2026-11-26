import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import * as controller from "./exports.controller.js";

export const exportsRouter = Router();

// Every export route needs a logged-in user.
exportsRouter.use(requireAuth);

exportsRouter.get("/flashcard-sets/:id", controller.flashcardSet);
exportsRouter.get("/summaries/:id", controller.summary);
