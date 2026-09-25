export type OnlineBackgroundTaskContext = {
  requestId: string;
  route: string;
  matchId?: string;
};

export type OnlineBackgroundTaskFailure = OnlineBackgroundTaskContext & {
  errorCategory: "DATABASE_SCHEMA_MISMATCH" | "ONLINE_BACKGROUND_FAILURE";
  postgresCode?: string;
};

function postgresCodeFrom(error: unknown): string | undefined {
  const visited = new Set<object>();
  let current = error;

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const record = current as { code?: unknown; cause?: unknown };
    if (typeof record.code === "string" && /^[0-9A-Z]{5}$/.test(record.code)) {
      return record.code;
    }
    current = record.cause;
  }

  return undefined;
}

export function classifyOnlineBackgroundFailure(
  error: unknown,
  context: OnlineBackgroundTaskContext,
): OnlineBackgroundTaskFailure {
  const postgresCode = postgresCodeFrom(error);
  return {
    ...context,
    errorCategory: postgresCode === "42703"
      ? "DATABASE_SCHEMA_MISMATCH"
      : "ONLINE_BACKGROUND_FAILURE",
    ...(postgresCode ? { postgresCode } : {}),
  };
}

export function runOnlineBackgroundTask(
  task: () => Promise<unknown>,
  context: OnlineBackgroundTaskContext,
  reportFailure: (failure: OnlineBackgroundTaskFailure) => void,
): void {
  void Promise.resolve()
    .then(task)
    .catch((error: unknown) => {
      const failure = classifyOnlineBackgroundFailure(error, context);
      try {
        reportFailure(failure);
      } catch {
        console.error("Failed to report an online background task failure");
      }
    });
}