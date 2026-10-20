import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftReadCache } from "./draft-read-cache";

test("coalesces simultaneous settings reads and isolates caller mutations", async () => {
  const cache = new DraftReadCache<{
    enabled: boolean;
    config: { value: number };
  }>(1000);
  let calls = 0,
    resolve!: (v: { enabled: boolean; config: { value: number } }) => void;
  const load = () => {
    calls++;
    return new Promise<{ enabled: boolean; config: { value: number } }>(
      (r) => (resolve = r),
    );
  };
  const reads = Array.from({ length: 10 }, () => cache.read("global", load));
  resolve({ enabled: true, config: { value: 1 } });
  const values = await Promise.all(reads);
  assert.equal(calls, 1);
  values[0].config.value = 999;
  assert.equal((await cache.read("global", load)).config.value, 1);
});
test("expires on time, retries failures and evicts entries by count and bytes", async () => {
  const now = Date.now;
  let time = 1000;
  Date.now = () => time;
  try {
    const cache = new DraftReadCache<string>(1000, 2, 18);
    let reads = 0;
    const load = async () => {
      reads++;
      return "123456";
    };
    await cache.read("a", load);
    await cache.read("b", load);
    await cache.read("a", load);
    assert.equal(reads, 2);
    await cache.read("c", load);
    await cache.read("b", load);
    assert.equal(reads, 4);
    time += 1001;
    await cache.read("b", load);
    assert.equal(reads, 5);
    await assert.rejects(
      cache.read("error", async () => {
        throw new Error("offline");
      }),
    );
    assert.equal(await cache.read("error", async () => "ok"), "ok");
    await cache.read("large", async () => "x".repeat(100));
    await cache.read("large", load);
    assert.equal(reads, 6);
  } finally {
    Date.now = now;
  }
});
test("administrator invalidation during an in-flight read never republishes stale settings", async () => {
  const cache = new DraftReadCache<boolean>(1000);
  let resolve!: (v: boolean) => void,
    calls = 0;
  const load = async () => {
    calls++;
    if (calls === 1) return new Promise<boolean>((r) => (resolve = r));
    return false;
  };
  const stale = cache.read("global", load);
  cache.clear();
  resolve(true);
  assert.equal(await stale, false);
  assert.equal(await cache.read("global", load), false);
  assert.equal(calls, 2);
});
