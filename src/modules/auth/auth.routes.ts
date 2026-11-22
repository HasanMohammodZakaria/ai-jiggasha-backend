import { Router } from "express";
import { registerLimiter } from "../../middlewares/rateLimit.middleware.js";
import { avatarUpload } from "../../middlewares/upload.middleware.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import * as controller from "./auth.controller.js";
import { registerSchema } from "./auth.validators.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  registerLimiter,
  avatarUpload,
  validateBody(registerSchema),
  controller.register,
);
