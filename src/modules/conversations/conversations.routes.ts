import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import * as controller from "./conversations.controller.js";
import {
  createConversationSchema,
  renameConversationSchema,
  sendMessageSchema,
} from "./conversations.validators.js";

// Each question costs AI quota: 10 per minute per user.
const messageLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? "anonymous",
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "You are asking too fast. Please wait a moment.",
    },
  },
});

export const conversationsRouter = Router();

// Every conversation route needs a logged-in user.
conversationsRouter.use(requireAuth);

conversationsRouter.get("/", controller.list);
conversationsRouter.post(
  "/",
  validateBody(createConversationSchema),
  controller.create,
);
conversationsRouter.get("/:id", controller.get);
conversationsRouter.patch(
  "/:id",
  validateBody(renameConversationSchema),
  controller.rename,
);
conversationsRouter.delete("/:id", controller.remove);
conversationsRouter.post(
  "/:id/messages",
  messageLimiter,
  validateBody(sendMessageSchema),
  controller.sendMessage,
);
