/** Process-local, bounded read caches. No battle state, auth or results are cached. */
export class DraftReadCache<T> {
  private entries = new Map<
    string,
    { value: T; expires: number; bytes: number }
  >();
  private pending = new Map<string, Promise<T>>();
  private bytes = 0;
  private generation = 0;
  constructor(
    private ttl: number,
    private maxEntries = 1,
    private maxBytes = 1024 * 1024,
  ) {}
  clear() {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
    this.bytes = 0;
  }
  async read(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now(),
      entry = this.entries.get(key);
    if (entry && entry.expires > now) {
      this.entries.delete(key);
      this.entries.set(key, entry);
      return structuredClone(entry.value);
    }
    if (entry) {
      this.entries.delete(key);
      this.bytes -= entry.bytes;
    }
    const running = this.pending.get(key);
    if (running) return structuredClone(await running);
    const generation = this.generation;
    const promise = load();
    this.pending.set(key, promise);
    try {
      const value = await promise;
      // An administrator save during this read must not publish old settings.
      if (generation !== this.generation) return this.read(key, load);
      const bytes = Buffer.byteLength(JSON.stringify(value));
      if (bytes <= this.maxBytes) {
        this.entries.set(key, {
          value: structuredClone(value),
          expires: Date.now() + this.ttl,
          bytes,
        });
        this.bytes += bytes;
        while (
          this.entries.size > this.maxEntries ||
          this.bytes > this.maxBytes
        ) {
          const first = this.entries.keys().next().value!;
          this.bytes -= this.entries.get(first)!.bytes;
          this.entries.delete(first);
        }
      }
      return structuredClone(value);
    } finally {
      if (this.pending.get(key) === promise) this.pending.delete(key);
    }
  }
}
