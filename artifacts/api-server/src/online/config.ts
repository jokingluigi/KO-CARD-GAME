export const ONLINE_MATCH_CONFIG = {
  turnTimeLimitSeconds: 90,
  reconnectGraceSeconds: 60,
  runtimeCleanupGraceMs: 5_000,
  reconnectInitialDelayMs: 500,
  reconnectMaxDelayMs: 8_000,
} as const;