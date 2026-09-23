import assert from "node:assert/strict";
import test from "node:test";
import { fetchCurrentUser } from "./auth-client";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("fetchCurrentUser preserves an unauthenticated response", async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ authenticated: false, user: null }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
  assert.deepEqual(await fetchCurrentUser({ timeoutMs: 50 }), { authenticated: false, user: null });
});

test("fetchCurrentUser converts a timeout into a recoverable error", async () => {
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
  await assert.rejects(
    fetchCurrentUser({ timeoutMs: 5 }),
    (error: unknown) => error instanceof Error && error.message === "인증 서버에 연결할 수 없습니다.",
  );
});

test("fetchCurrentUser surfaces a bounded server error without logging out", async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ message: "인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
  await assert.rejects(
    fetchCurrentUser({ timeoutMs: 50 }),
    (error: unknown) => error instanceof Error && error.message.includes("인증 서버에 연결할 수 없습니다."),
  );
});