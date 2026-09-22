export const ONLINE_WS_PATH = "/api/online-matches/ws";
export const ONLINE_WS_TICKET_PATH = "/api/online-matches/ws-ticket";
export const PRODUCTION_ONLINE_WS_ORIGIN = "https://ko-card-game.onrender.com";

function normalizedBasePath(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export function onlineApiUrl(path: string, baseUrl: string): string {
  return `${normalizedBasePath(baseUrl)}${path}`;
}

export function onlineWebSocketUrl(
  ticket: string | undefined,
  options: {
    production: boolean;
    baseUrl: string;
    protocol: string;
    host: string;
  },
): string {
  const query = ticket ? `?ticket=${encodeURIComponent(ticket)}` : "";
  if (options.production) return `wss://${new URL(PRODUCTION_ONLINE_WS_ORIGIN).host}${ONLINE_WS_PATH}${query}`;
  const protocol = options.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${options.host}${normalizedBasePath(options.baseUrl)}${ONLINE_WS_PATH}${query}`;
}