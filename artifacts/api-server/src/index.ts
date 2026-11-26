import { startUsageStatisticsWorker } from './lib/usage-statistics-store';
import {startQuestProgressWorker} from './lib/quest-progress-outbox';
import {startDraftWorker} from './lib/draft-service';
import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureProductionAdmin } from "./lib/production-admin";
import { attachOnlineMatchWebSocket } from "./online/websocket";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ensureApplicationStorage } from "./lib/startup-schema";

/**
 * 안전망: 이미 끝난(끊긴) 파일 전송에서 늦게 터지는 '시간 초과·중단' 오류는 기록만 하고 넘어간다.
 * 그 외 오류는 예전처럼 서버를 다시 시작한다. (2026-11-26 음악 전송 시간 초과로 4~5분마다 꺼지던 문제)
 */
const TRANSFER_ERRORS = new Set(["AbortError", "TimeoutError"]);
const TRANSFER_CODES = new Set(["ERR_STREAM_PREMATURE_CLOSE", "ECONNRESET", "EPIPE", "ABORT_ERR"]);
process.on("uncaughtException", (error: Error & { code?: string }) => {
  if (TRANSFER_ERRORS.has(error?.name) || TRANSFER_CODES.has(String(error?.code))) {
    logger.warn({ err: error }, "Ignored late transfer error (connection already closed)");
    return;
  }
  logger.fatal({ err: error }, "Uncaught exception");
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  await db.execute(sql`ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz`);
  await ensureApplicationStorage();
  await ensureProductionAdmin();
  startDraftWorker();
  startUsageStatisticsWorker();
  startQuestProgressWorker();

  const server = createServer(app);
  attachOnlineMatchWebSocket(server);
  server.listen(port, () => {
    const err = undefined;
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void start().catch((error) => {
  logger.error({ err: error }, "Server startup failed");
  process.exit(1);
});
