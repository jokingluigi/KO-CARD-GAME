/** Bounded HTTP + body reads. Never retries a mutation or assumes a lost reply means failure. */
export class ClientRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly outcomeUnknown = false,
  ) {
    super(message);
    this.name = "ClientRequestError";
  }
}
export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  options: { label?: string; timeoutMs?: number } = {},
): Promise<T> {
  const mutation = !["GET", "HEAD"].includes(
    (init.method ?? "GET").toUpperCase(),
  );
  const label = options.label ?? "요청";
  const controller = new AbortController();
  const cancel = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener("abort", cancel, { once: true });
  if (init.signal?.aborted) cancel();
  const timer = setTimeout(
    () =>
      controller.abort(new DOMException("Deadline exceeded", "TimeoutError")),
    options.timeoutMs ?? (mutation ? 20000 : 12000),
  );
  let rejectAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    rejectAbort = () =>
      reject(
        controller.signal.reason ?? new DOMException("Cancelled", "AbortError"),
      );
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
  });
  const unknown = `${label} 결과를 확인하지 못했어요. 이미 처리됐을 수 있으니 다시 실행하기 전에 결과를 확인해 주세요.`;
  try {
    return await Promise.race([
      interrupted,
      (async () => {
        if (controller.signal.aborted) throw controller.signal.reason;
        const response = await fetch(url, {
          ...init,
          cache: init.cache ?? "no-store",
          credentials: "include",
          signal: controller.signal,
        });
        if (response.status === 204 && response.ok) return undefined as T;
        const body = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        if (!response.ok)
          throw new ClientRequestError(
            typeof body?.message === "string"
              ? body.message
              : `${label}을 처리하지 못했어요.`,
            response.status,
            mutation && response.status >= 500,
          );
        if (body === null)
          throw new ClientRequestError(
            mutation
              ? unknown
              : `${label} 응답을 읽지 못했어요. 다시 확인해 주세요.`,
            response.status,
            mutation,
          );
        return body as T;
      })(),
    ]);
  } catch (error) {
    if (init.signal?.aborted) throw init.signal.reason ?? error;
    if (error instanceof ClientRequestError) throw error;
    throw new ClientRequestError(
      mutation
        ? unknown
        : `${label} 연결이 지연되고 있어요. 연결을 확인한 뒤 다시 시도해 주세요.`,
      undefined,
      mutation,
    );
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", cancel);
    if (rejectAbort)
      controller.signal.removeEventListener("abort", rejectAbort);
  }
}
