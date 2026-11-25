import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { documentUpload } from "../../middlewares/upload.middleware.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import * as controller from "./documents.controller.js";
import {
  updateDocumentSchema,
  uploadDocumentSchema,
} from "./documents.validators.js";

export const documentsRouter = Router();

// Every document route needs a logged-in user.
documentsRouter.use(requireAuth);

documentsRouter.get("/", controller.list);
documentsRouter.post(
  "/",
  documentUpload,
  validateBody(uploadDocumentSchema),
  controller.upload,
);
documentsRouter.get("/:id", controller.get);
documentsRouter.get("/:id/download", controller.download);
documentsRouter.patch(
  "/:id",
  validateBody(updateDocumentSchema),
  controller.update,
);
documentsRouter.delete("/:id", controller.remove);
