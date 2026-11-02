const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
let sent = 0;
export function reportClientFailure(
  kind: "RENDER" | "SCRIPT" | "NETWORK" = "RENDER",
  error?: unknown,
) {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    "local-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2);
  try {
    sessionStorage.setItem("ko-last-diagnostic", id);
  } catch {}
  if (sent++ >= 5) return id;
  const faultType =
    error instanceof Error &&
    ["TypeError", "ReferenceError", "RangeError", "SyntaxError"].includes(
      error.name,
    )
      ? error.name
      : "Other";
  const match =
    error instanceof Error
      ? error.stack?.match(/([a-zA-Z0-9_.-]+\.js):(\d{1,8}):(\d{1,8})/)
      : null;
  const source = match ? `${match[1]}:${match[2]}:${match[3]}` : undefined;
  const path = window.location.pathname;
  const screen = path.includes("match")
    ? "BATTLE"
    : path.includes("decks")
      ? "DECKS"
      : path.includes("collection") || path.includes("cosmetics")
        ? "COLLECTION"
        : path.includes("shop") || path.includes("packs")
          ? "SHOP"
          : path.includes("quests") || path.includes("attendance")
            ? "REWARDS"
            : path.includes("settings") || path.includes("recovery")
              ? "ACCOUNT"
              : path === "/"
                ? "HOME"
                : "OTHER";
  // Deliberately omit exception messages, player content, tokens, full paths and query/hash.
  void fetch(base + "/api/client-diagnostics", {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      kind,
      screen,
      faultType,
      source,
      build: import.meta.env.VITE_BUILD_REVISION ?? "unknown",
      online: navigator.onLine,
    }),
    keepalive: true,
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
  return id;
}
export function installClientDiagnostics() {
  const report = (event: ErrorEvent) =>
    reportClientFailure("SCRIPT", event.error);
  window.addEventListener("error", report);
  return () => window.removeEventListener("error", report);
}
