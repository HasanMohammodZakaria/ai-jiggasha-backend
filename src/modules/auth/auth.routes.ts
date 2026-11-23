import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import {
  loginLimiter,
  refreshLimiter,
  registerLimiter,
} from "../../middlewares/rateLimit.middleware.js";
import { avatarUpload } from "../../middlewares/upload.middleware.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import * as controller from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.validators.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  registerLimiter,
  avatarUpload,
  validateBody(registerSchema),
  controller.register,
);
authRouter.post(
  "/login",
  loginLimiter,
  validateBody(loginSchema),
  controller.login,
);
authRouter.post("/refresh", refreshLimiter, controller.refresh);
authRouter.post("/logout", controller.logout);
authRouter.get("/me", requireAuth, controller.me);
