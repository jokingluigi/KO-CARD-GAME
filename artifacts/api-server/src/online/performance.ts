import { monitorEventLoopDelay } from "node:perf_hooks";
const samples = new Map<string, number[]>();
const startedAt = new Date().toISOString();
let loop: ReturnType<typeof monitorEventLoopDelay> | undefined;
export function recordPerformance(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) return;
  const values = samples.get(name) ?? [];
  values.push(value);
  if (values.length > 1024) values.shift();
  samples.set(name, values);
}
export function performanceSnapshot() {
  loop ??= monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  const metrics = Object.fromEntries(
    [...samples].map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b),
        at = (p: number) =>
          Math.round(
            (sorted[
              Math.min(sorted.length - 1, Math.floor(sorted.length * p))
            ] ?? 0) * 100,
          ) / 100;
      return [
        name,
        { count: values.length, p50: at(0.5), p95: at(0.95), max: at(1) },
      ];
    }),
  );
  const memory = process.memoryUsage();
  return {
    startedAt,
    revision: process.env.RENDER_GIT_COMMIT ?? "local",
    sampleLimit: 1024,
    metrics,
    heapMB: Math.round(memory.heapUsed / 1048576),
    rssMB: Math.round(memory.rss / 1048576),
    eventLoopP95Ms: Number.isFinite(loop.mean)
      ? Math.round(loop.percentile(95) / 1e4) / 100
      : 0,
  };
}
