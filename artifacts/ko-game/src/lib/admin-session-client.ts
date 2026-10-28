import { restoreSession } from "./session-restore";
import { AuthRequestError, type AuthResponse } from "./auth-client";

/** Admin entry must not wait behind the menu's minute-long cold-start probe. */
export async function fetchAdminSession(
  signal?: AbortSignal,
  timeoutMs = 8_000,
): Promise<AuthResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, timeoutMs);
  async function read(): Promise<AuthResponse> {
    const response = await fetch(
      `${(import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "")}/api/admin/session`,
      {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok)
      throw new AuthRequestError(
        "관리자 인증 서버가 응답하지 않았어. 다시 시도해 줘.",
        response.status,
      );
    return (await response.json()) as AuthResponse;
  }
  try {
    return await restoreSession(
      read(),
      read,
      controller.signal,
      1500,
      (error) =>
        !(error instanceof AuthRequestError) ||
        error.status === undefined ||
        error.status >= 500,
    );
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (error instanceof AuthRequestError) throw error;
    throw new AuthRequestError(
      "관리자 세션 연결이 지연되고 있어. 로그인 정보는 지우지 않았어.",
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
    signal?.removeEventListener("abort", abort);
  }
}
