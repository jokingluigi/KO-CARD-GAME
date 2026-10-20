import { invalidateStartupAuth, takeStartupAuth } from "./startup-client";

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
// Session restoration may span a free-service cold start. The form is shown
// independently after 1.2 seconds, so this does not block login input.
export const AUTH_REQUEST_TIMEOUT_MS = 60_000;
export const AUTH_SUBMIT_TIMEOUT_MS = 20_000;
let authRevision = 0;
let currentUserRequest: Promise<AuthResponse> | null = null;
let confirmedAuth: { response: AuthResponse; expiresAt: number } | null = null;

function invalidateAuth(): void {
  authRevision += 1;
  confirmedAuth = null;
  currentUserRequest = null;
  invalidateStartupAuth();
}

export class AuthRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AuthRequestError";
  }
}

async function readResponseMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** Only GET readiness probes are retried. Credentials are posted exactly once. */
async function waitForAuthServer(
  timeoutMs: number,
  cancelled?: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = globalThis.setTimeout(abort, timeoutMs);
  cancelled?.addEventListener("abort", abort, { once: true });
  if (cancelled?.aborted) abort();
  async function pause(ms: number) {
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        clearTimeout(wait);
        controller.signal.removeEventListener("abort", stop);
        resolve();
      };
      const stop = () => {
        clearTimeout(wait);
        controller.signal.removeEventListener("abort", stop);
        reject(new DOMException("Cancelled", "AbortError"));
      };
      const wait = globalThis.setTimeout(finish, ms);
      controller.signal.addEventListener("abort", stop, { once: true });
      if (controller.signal.aborted) stop();
    });
  }
  try {
    for (
      let attempt = 0;
      attempt < 8 && !controller.signal.aborted;
      attempt++
    ) {
      try {
        const response = await fetch(`${authBasePath}/api/healthz`, {
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        });
        if (
          response.ok &&
          ((await response.json()) as { status?: string }).status === "ok"
        )
          return;
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429 &&
          response.status !== 408
        )
          throw new AuthRequestError(
            "로그인 서버 연결을 확인하지 못했습니다.",
            response.status,
          );
      } catch (error) {
        if (error instanceof AuthRequestError) throw error;
        if (controller.signal.aborted) break;
      }
      await pause(Math.min(8000, 500 * 2 ** attempt));
    }
    throw new AuthRequestError(
      "서버 연결이 지연되고 있어. 잠시 후 다시 로그인해 줘.",
    );
  } catch (error) {
    if (cancelled?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (error instanceof AuthRequestError) throw error;
    throw new AuthRequestError(
      "서버 연결이 지연되고 있어. 잠시 후 다시 로그인해 줘.",
    );
  } finally {
    globalThis.clearTimeout(timer);
    cancelled?.removeEventListener("abort", abort);
  }
}

export async function fetchCurrentUser(
  options: { timeoutMs?: number } = {},
): Promise<AuthResponse> {
  if (confirmedAuth && Date.now() < confirmedAuth.expiresAt)
    return confirmedAuth.response;
  if (currentUserRequest) return currentUserRequest;
  const request = readCurrentUser(options);
  currentUserRequest = request;
  try {
    return await request;
  } finally {
    if (currentUserRequest === request) currentUserRequest = null;
  }
}

async function readCurrentUser(options: {
  timeoutMs?: number;
}): Promise<AuthResponse> {
  const revision = authRevision;
  const startup = takeStartupAuth();
  const timeoutMs = options.timeoutMs ?? AUTH_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      if (startup) {
        try {
          const result = await Promise.race([
            startup,
            new Promise<never>((_, reject) =>
              controller.signal.addEventListener(
                "abort",
                () =>
                  reject(
                    new AuthRequestError("인증 서버에 연결할 수 없습니다."),
                  ),
                { once: true },
              ),
            ),
          ]);
          return rememberAuth(result, revision, options);
        } catch (error) {
          if (controller.signal.aborted) throw error;
          // Retry a failed prefetch within the same overall request deadline.
        }
      }
      response = await fetch(`${authApiBase}/me`, {
        credentials: "include",
        cache: "no-store",
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
    const result = (await response.json()) as AuthResponse;
    return rememberAuth(result, revision, options);
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function rememberAuth(
  result: AuthResponse,
  revision: number,
  options: { timeoutMs?: number },
): Promise<AuthResponse> | AuthResponse {
  if (revision !== authRevision) return fetchCurrentUser(options);
  confirmedAuth =
    result.authenticated && result.user
      ? { response: result, expiresAt: Date.now() + 30_000 }
      : null;
  return result;
}

export async function logout(): Promise<void> {
  invalidateAuth();
  await fetch(`${authApiBase}/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function changeNickname(nickname: string): Promise<AuthUser> {
  invalidateAuth();
  const response = await fetch(`${authApiBase}/nickname`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  if (!response.ok)
    throw new AuthRequestError(
      await readResponseMessage(response, "닉네임을 변경하지 못했습니다."),
      response.status,
    );
  const body = (await response.json()) as AuthResponse;
  if (!body.user)
    throw new AuthRequestError("로그인 상태를 확인하지 못했습니다.");
  return body.user;
}

export async function submitAuth(
  mode: "login" | "register",
  values: Record<string, string>,
  options: {
    timeoutMs?: number;
    wakeTimeoutMs?: number;
    signal?: AbortSignal;
    onStage?: (stage: "connecting" | "submitting") => void;
  } = {},
): Promise<AuthUser> {
  invalidateAuth();
  options.onStage?.("connecting");
  await waitForAuthServer(
    options.wakeTimeoutMs ?? options.timeoutMs ?? 60_000,
    options.signal,
  );
  if (options.signal?.aborted)
    throw new DOMException("Cancelled", "AbortError");
  options.onStage?.("submitting");
  let response: Response;
  try {
    response = await fetch(`${authApiBase}/${mode}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
      cache: "no-store",
      signal: options.signal
        ? AbortSignal.any([
            options.signal,
            AbortSignal.timeout(options.timeoutMs ?? AUTH_SUBMIT_TIMEOUT_MS),
          ])
        : AbortSignal.timeout(options.timeoutMs ?? AUTH_SUBMIT_TIMEOUT_MS),
    });
  } catch {
    throw new AuthRequestError(
      "서버 응답이 지연되고 있습니다. 잠시 후 다시 로그인해 주세요.",
    );
  }
  if (!response.ok) {
    throw new Error(
      await readResponseMessage(response, "요청을 처리하지 못했습니다."),
    );
  }
  const body = (await response.json()) as AuthResponse;
  if (!body.authenticated || !body.user) {
    throw new Error("로그인 상태를 확인하지 못했습니다.");
  }
  invalidateAuth();
  confirmedAuth = { response: body, expiresAt: Date.now() + 30_000 };
  return body.user;
}

export async function submitTestAuth(
  role: "USER" | "ADMIN",
): Promise<AuthUser> {
  invalidateAuth();
  const response = await fetch(
    `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/test-auth/login`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    },
  );
  if (!response.ok) {
    throw new Error(
      await readResponseMessage(
        response,
        "개발용 테스트 로그인을 사용할 수 없습니다.",
      ),
    );
  }
  const body = (await response.json()) as AuthResponse;
  if (!body.authenticated || !body.user) {
    throw new Error("개발용 테스트 로그인 상태를 확인하지 못했습니다.");
  }
  return body.user;
}
