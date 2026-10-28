import test from "node:test";
import assert from "node:assert/strict";
import { restoreSession } from "./session-restore";
const pause = (n: number) => new Promise((r) => setTimeout(r, n));
test("fast authoritative session or guest result never starts a fallback", async () => {
  for (const authenticated of [true, false]) {
    let calls = 0;
    assert.deepEqual(
      await restoreSession(
        Promise.resolve({ authenticated }),
        async () => {
          calls++;
          return { authenticated: true };
        },
        new AbortController().signal,
        5,
      ),
      { authenticated },
    );
    await pause(10);
    assert.equal(calls, 0);
  }
});
test("a stalled session is restored by exactly one fresh GET and ignores late errors", async () => {
  let reject!: (e: Error) => void,
    calls = 0;
  const original = new Promise<string>((_, no) => (reject = no));
  assert.equal(
    await restoreSession(
      original,
      async () => {
        calls++;
        return "verified";
      },
      new AbortController().signal,
      5,
    ),
    "verified",
  );
  reject(Error("old request aborted"));
  await pause(10);
  assert.equal(calls, 1);
});
test("failed fallback does not discard a healthy late original session", async () => {
  let resolve!: (x: string) => void;
  const primary = new Promise<string>((yes) => (resolve = yes));
  const pending = restoreSession(
    primary,
    async () => {
      throw Error("temporary gateway error");
    },
    new AbortController().signal,
    5,
  );
  await pause(15);
  resolve("verified");
  assert.equal(await pending, "verified");
});
test("primary transport failure retries once immediately; two failures surface an error", async () => {
  let calls = 0;
  await assert.rejects(
    restoreSession(
      Promise.reject(Error("first")),
      async () => {
        calls++;
        throw Error("second");
      },
      new AbortController().signal,
      100,
    ),
    /second/,
  );
  assert.equal(calls, 1);
});
test("cancellation cleans the hedge timer and never invents authentication", async () => {
  const c = new AbortController();
  let calls = 0;
  const pending = restoreSession(
    new Promise(() => {}),
    async () => {
      calls++;
      return "bad";
    },
    c.signal,
    10,
  );
  c.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await pause(15);
  assert.equal(calls, 0);
});
test("an authoritative rejected session is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    restoreSession(
      Promise.reject(Error("denied")),
      async () => {
        calls++;
        return "bad";
      },
      new AbortController().signal,
      5,
      () => false,
    ),
    /denied/,
  );
  assert.equal(calls, 0);
});
