/** Bounded shared read; failures are never cached and invalidation beats in-flight reads. */
export function shortLivedRead<T>(
  read: () => Promise<T>,
  ttl = 1000,
  now = Date.now,
) {
  let generation = 0,
    cached: { value: T; expires: number } | undefined,
    pending: Promise<T> | undefined;
  return {
    invalidate() {
      generation++;
      cached = undefined;
      pending = undefined;
    },
    async get(): Promise<T> {
      if (cached && now() < cached.expires) return cached.value;
      if (pending) return pending;
      const token = generation;
      const job = read().then((value) => {
        if (generation === token) cached = { value, expires: now() + ttl };
        return value;
      });
      pending = job;
      try {
        return await job;
      } finally {
        if (pending === job) pending = undefined;
      }
    },
  };
}
