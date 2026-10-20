/** Coalesces upload-triggered housekeeping without caching negative reference checks. */
export class AssetCleanupGate {
  private pending: Promise<void> | null = null;
  private nextRun = 0;
  constructor(
    private interval = 5 * 60_000,
    private retryDelay = 30_000,
  ) {}
  run(task: () => Promise<void>): Promise<void> {
    if (this.pending) return this.pending;
    if (Date.now() < this.nextRun) return Promise.resolve();
    this.nextRun = Date.now() + this.interval;
    const promise = Promise.resolve()
      .then(task)
      .catch((error) => {
        this.nextRun = Date.now() + this.retryDelay;
        throw error;
      })
      .finally(() => {
        if (this.pending === promise) this.pending = null;
      });
    this.pending = promise;
    return promise;
  }
}
