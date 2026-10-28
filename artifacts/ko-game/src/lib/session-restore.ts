/** Idempotent session GET only. Never use this for credential POSTs. */
export function restoreSession<T>(
  primary: Promise<T>,
  fresh: () => Promise<T>,
  signal: AbortSignal,
  delayMs = 1500,
  retryable: (error: unknown) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false,
      started = false,
      failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const finish = (ok: boolean, value: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (ok) resolve(value as T);
      else reject(value);
    };
    const abort = () =>
      finish(false, new DOMException("Session lookup cancelled", "AbortError"));
    const observe = (request: Promise<T>) => {
      request.then(
        (value) => finish(true, value),
        (error) => {
          if (settled) return;
          if (!retryable(error)) {
            finish(false, error);
            return;
          }
          failures++;
          if (!started) start();
          else if (failures === 2) finish(false, error);
        },
      );
    };
    const start = () => {
      if (started || settled || signal.aborted) return;
      started = true;
      clearTimeout(timer);
      observe(Promise.resolve().then(fresh));
    };
    signal.addEventListener("abort", abort, { once: true });
    observe(primary);
    if (signal.aborted) abort();
    else timer = setTimeout(start, delayMs);
  });
}
