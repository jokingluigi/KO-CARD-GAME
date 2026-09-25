import assert from "node:assert/strict";
import { test } from "node:test";
import { runOnlineBackgroundTask } from "./background-task";

test("reports a nested PostgreSQL schema error without propagating query details", async () => {
  const reported = new Promise<unknown>((resolve) => {
    runOnlineBackgroundTask(
      async () => {
        const postgresError = Object.assign(new Error('column "schema_version" does not exist'), {
          code: "42703",
        });
        throw Object.assign(new Error("Drizzle query failed with parameters"), {
          cause: postgresError,
        });
      },
      {
        requestId: "turn-timeout:match-1:3",
        route: "background.turn-timeout",
        matchId: "match-1",
      },
      resolve,
    );
  });

  assert.deepEqual(await reported, {
    requestId: "turn-timeout:match-1:3",
    route: "background.turn-timeout",
    matchId: "match-1",
    errorCategory: "DATABASE_SCHEMA_MISMATCH",
    postgresCode: "42703",
  });
});

test("reports non-PostgreSQL failures as background errors", async () => {
  const reported = new Promise<unknown>((resolve) => {
    runOnlineBackgroundTask(
      async () => {
        throw new Error("unexpected background failure");
      },
      {
        requestId: "connection-state:match-1:3",
        route: "background.connection-state",
        matchId: "match-1",
      },
      resolve,
    );
  });

  assert.deepEqual(await reported, {
    requestId: "connection-state:match-1:3",
    route: "background.connection-state",
    matchId: "match-1",
    errorCategory: "ONLINE_BACKGROUND_FAILURE",
  });
});