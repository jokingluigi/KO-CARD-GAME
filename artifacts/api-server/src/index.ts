import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureProductionAdmin } from "./lib/production-admin";
import { attachOnlineMatchWebSocket } from "./online/websocket";

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
  await ensureProductionAdmin();

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
