import type { AuthResponse } from './auth-client';

export type ServerStatus = { enabled: boolean; allowed: boolean; message: string };
type StartupEntry<T> = { request: Promise<T>; expiresAt: number };
declare global {
  interface Window {
    __koStartupConnection?: { status: StartupEntry<ServerStatus>; auth: StartupEntry<AuthResponse> };
  }
}
const api = `${(import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')}/api`;
let statusRequest: Promise<ServerStatus> | null = null;
let startupAuth: { request: Promise<AuthResponse>; expiresAt: number } | null = null;
let startupStatus: { request: Promise<ServerStatus>; expiresAt: number } | null = null;

async function requestJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${api}${path}`, {
      credentials: 'include', cache: 'no-store', signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Startup request failed: ${response.status}`);
    return await response.json() as T;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export function requestServerStatus(): Promise<ServerStatus> {
  const initial = startupStatus;
  startupStatus = null;
  if (initial && Date.now() <= initial.expiresAt) return initial.request;
  if (!statusRequest) {
    statusRequest = requestJson<ServerStatus>('/server-status').finally(() => {
      statusRequest = null;
    });
  }
  return statusRequest;
}

export function invalidateStartupAuth(): void { startupAuth = null; }

export function takeStartupAuth(): Promise<AuthResponse> | undefined {
  const entry = startupAuth;
  startupAuth = null;
  if (!entry || Date.now() > entry.expiresAt) return undefined;
  return entry.request;
}

export function startServerConnection(): void {
  // This small HTML entry runs while the main game bundle is still downloading.
  if (typeof window !== 'undefined' && window.__koStartupConnection) {
    startupStatus = window.__koStartupConnection.status;
    startupAuth = window.__koStartupConnection.auth;
    delete window.__koStartupConnection;
    return;
  }
  const status = { request: requestServerStatus(), expiresAt: Infinity };
  startupStatus = status;
  void status.request.then(() => { status.expiresAt = Date.now() + 15_000; }).catch(() => {
    if (startupStatus === status) startupStatus = null;
  });
  if (startupAuth) return;
  const entry = { request: requestJson<AuthResponse>('/auth/me'), expiresAt: Infinity };
  startupAuth = entry;
  void entry.request.then(() => { entry.expiresAt = Date.now() + 15_000; }).catch(() => {
    if (startupAuth === entry) startupAuth = null;
  });
}

if (typeof window !== 'undefined') startServerConnection();
