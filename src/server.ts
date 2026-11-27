import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";
import { registerIngestionWorker } from "./modules/ingestion/ingestion.worker.js";
import { startQueue, stopQueue } from "./providers/queue/boss.js";

async function main(): Promise<void> {
  // The queue must be running before the first upload can enqueue a job.
  await startQueue();
  await registerIngestionWorker();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`Jiggasha API listening on http://localhost:${env.PORT}`);
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, "Shutting down");
    server.close(async () => {
      await stopQueue();
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

main().catch((err: unknown) => {
  logger.error({ err }, "Failed to start the server");
  process.exit(1);
});
