import type { AuthResponse } from "./auth-client";

export type ServerStatus = {
  enabled: boolean;
  allowed: boolean;
  message: string;
};
export type StartupEntry<T> = {
  request: Promise<T>;
  expiresAt: number;
  cancel?: () => void;
};
declare global {
  interface Window {
    __koStartupConnection?: {
      status: StartupEntry<ServerStatus>;
      auth: StartupEntry<AuthResponse>;
    };
  }
}
const api = `${(import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "")}/api`;
let statusRequest: Promise<ServerStatus> | null = null;
let startupAuth: StartupEntry<AuthResponse> | null = null;
let startupStatus: StartupEntry<ServerStatus> | null = null;

async function requestJson<T>(
  path: string,
  controller = new AbortController(),
): Promise<T> {
  const timer = globalThis.setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${api}${path}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Startup request failed: ${response.status}`);
    return (await response.json()) as T;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function shareStatus(request: Promise<ServerStatus>) {
  const shared = request.finally(() => {
    if (statusRequest === shared) statusRequest = null;
  });
  statusRequest = shared;
  return shared;
}
export function requestServerStatus(): Promise<ServerStatus> {
  const initial = startupStatus;
  startupStatus = null;
  if (initial && Date.now() <= initial.expiresAt)
    return shareStatus(initial.request);
  return (
    statusRequest ?? shareStatus(requestJson<ServerStatus>("/server-status"))
  );
}
export function invalidateServerStatus(): void {
  startupStatus?.cancel?.();
  startupStatus = null;
  statusRequest = null;
}
export function invalidateStartupAuth(): void {
  startupAuth?.cancel?.();
  startupAuth = null;
}
export function takeStartupAuthEntry(): StartupEntry<AuthResponse> | undefined {
  const entry = startupAuth;
  startupAuth = null;
  if (!entry || Date.now() > entry.expiresAt) {
    entry?.cancel?.();
    return undefined;
  }
  return entry;
}
export function takeStartupAuth(): Promise<AuthResponse> | undefined {
  return takeStartupAuthEntry()?.request;
}

export function startServerConnection(): void {
  // This small HTML entry runs while the main game bundle is still downloading.
  if (typeof window !== "undefined" && window.__koStartupConnection) {
    startupStatus = window.__koStartupConnection.status;
    startupAuth = window.__koStartupConnection.auth;
    delete window.__koStartupConnection;
    return;
  }
  const status = { request: requestServerStatus(), expiresAt: Infinity };
  startupStatus = status;
  void status.request
    .then(() => {
      status.expiresAt = Date.now() + 15_000;
    })
    .catch(() => {
      if (startupStatus === status) startupStatus = null;
    });
  if (startupAuth) return;
  const controller = new AbortController();
  const entry: StartupEntry<AuthResponse> = {
    request: requestJson<AuthResponse>("/auth/me", controller),
    expiresAt: Infinity,
    cancel: () => controller.abort(),
  };
  startupAuth = entry;
  void entry.request
    .then(() => {
      entry.expiresAt = Date.now() + 15_000;
    })
    .catch(() => {
      if (startupAuth === entry) startupAuth = null;
    });
}

if (typeof window !== "undefined") startServerConnection();
