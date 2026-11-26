import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";
import { csrfProtection } from "./middlewares/csrf.middleware.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/error.middleware.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { subjectsRouter } from "./modules/subjects/subjects.routes.js";
import { documentsRouter } from "./modules/documents/documents.routes.js";
import { conversationsRouter } from "./modules/conversations/conversations.routes.js";
import { studyRouter } from "./modules/study/study.routes.js";
import { exportsRouter } from "./modules/exports/exports.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(csrfProtection);

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", database: "up" });
    } catch (err) {
      logger.error({ err }, "Health check: database unreachable");
      res.status(503).json({ status: "degraded", database: "down" });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/subjects", subjectsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use("/api/study", studyRouter);
  app.use("/api/exports", exportsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
