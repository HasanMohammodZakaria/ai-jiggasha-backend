import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import * as controller from "./subjects.controller.js";
import {
  createSubjectSchema,
  updateSubjectSchema,
} from "./subjects.validators.js";

export const subjectsRouter = Router();

// Every subject route needs a logged-in user.
subjectsRouter.use(requireAuth);

subjectsRouter.get("/", controller.list);
subjectsRouter.post("/", validateBody(createSubjectSchema), controller.create);
subjectsRouter.get("/:id", controller.get);
subjectsRouter.patch(
  "/:id",
  validateBody(updateSubjectSchema),
  controller.update,
);
subjectsRouter.delete("/:id", controller.remove);
