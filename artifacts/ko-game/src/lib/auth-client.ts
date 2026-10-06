import { invalidateStartupAuth, takeStartupAuth } from './startup-client';

export type AuthUser = {
  id: string;
  email: string;
  nickname: string;
  role: "USER" | "ADMIN";
  currency: number;
  currencyBalance: number;
  prismBalance: number;
  championPrismBalance: number;
  isTestAccount: boolean;
};

export type AuthResponse = {
  authenticated: boolean;
  user: AuthUser | null;
};

const authBasePath = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");
const authApiBase = `${authBasePath}/api/auth`;
export const AUTH_REQUEST_TIMEOUT_MS = 8_000;

export class AuthRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AuthRequestError";
  }
}

async function readResponseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchCurrentUser(options: { timeoutMs?: number } = {}): Promise<AuthResponse> {
  const startup = takeStartupAuth();
  if (startup) {
    try { return await startup; } catch { /* Retry with the regular bounded request below. */ }
  }
  const timeoutMs = options.timeoutMs ?? AUTH_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(`${authApiBase}/me`, {
        credentials: "include",
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new AuthRequestError("인증 서버에 연결할 수 없습니다.");
      }
      throw new AuthRequestError("인증 상태를 확인하지 못했습니다.");
    }
    if (!response.ok) {
      throw new AuthRequestError(
        await readResponseMessage(response, "인증 상태를 확인하지 못했습니다."),
        response.status,
      );
    }
    return (await response.json()) as AuthResponse;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function logout(): Promise<void> {
  invalidateStartupAuth();
  await fetch(`${authApiBase}/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function changeNickname(nickname: string): Promise<AuthUser> {
  invalidateStartupAuth();
  const response = await fetch(`${authApiBase}/nickname`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  if (!response.ok) throw new AuthRequestError(await readResponseMessage(response, "닉네임을 변경하지 못했습니다."), response.status);
  const body = (await response.json()) as AuthResponse;
  if (!body.user) throw new AuthRequestError("로그인 상태를 확인하지 못했습니다.");
  return body.user;
}

export async function submitAuth(
  mode: "login" | "register",
  values: Record<string, string>,
): Promise<AuthUser> {
  invalidateStartupAuth();
  const response = await fetch(`${authApiBase}/${mode}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!response.ok) {
    throw new Error(await readResponseMessage(response, "요청을 처리하지 못했습니다."));
  }
  const body = (await response.json()) as AuthResponse;
  if (!body.authenticated || !body.user) {
    throw new Error("로그인 상태를 확인하지 못했습니다.");
  }
  return body.user;
}

export async function submitTestAuth(role: "USER" | "ADMIN"): Promise<AuthUser> {
  invalidateStartupAuth();
  const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/test-auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!response.ok) {
    throw new Error(await readResponseMessage(response, "개발용 테스트 로그인을 사용할 수 없습니다."));
  }
  const body = (await response.json()) as AuthResponse;
  if (!body.authenticated || !body.user) {
    throw new Error("개발용 테스트 로그인 상태를 확인하지 못했습니다.");
  }
  return body.user;
}
