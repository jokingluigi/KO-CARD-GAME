import test from "node:test";
import assert from "node:assert/strict";
import { requestJson, ClientRequestError } from "./client-request";
const original = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = original;
});
test("one request, preserves payload and server validation, supports no-content", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(init?.credentials, "include");
    assert.equal(init?.cache,"no-store");
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify({ message: "수량을 확인하세요." }), {
      status: 422,
    });
  };
  await assert.rejects(
    requestJson("/fake", { method: "POST", body: "{}" }),
    (e) =>
      e instanceof ClientRequestError &&
      e.status === 422 &&
      !e.outcomeUnknown &&
      e.message === "수량을 확인하세요.",
  );
  assert.equal(calls, 1);
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await requestJson("/fake"), undefined);
});
test("deadline includes fetch and never automatically resubmits a mutation", async () => {
  let calls = 0;
  globalThis.fetch = () => {
    calls++;
    return new Promise(() => {});
  };
  await assert.rejects(
    requestJson("/fake", { method: "POST" }, { timeoutMs: 5 }),
    (e) =>
      e instanceof ClientRequestError &&
      e.outcomeUnknown &&
      /이미 처리/.test(e.message),
  );
  assert.equal(calls, 1);
});
test("response body stalls are bounded, read errors remain retryable without claiming a write", async () => {
  globalThis.fetch = async () =>
    new Response(new ReadableStream({ start() {} }));
  await assert.rejects(
    requestJson("/fake", {}, { timeoutMs: 5 }),
    (e) =>
      e instanceof ClientRequestError &&
      !e.outcomeUnknown &&
      /연결/.test(e.message),
  );
});
test("cancellation before dispatch sends nothing", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("{}");
  };
  const c = new AbortController();
  c.abort(new DOMException("stop", "AbortError"));
  await assert.rejects(
    requestJson("/fake", { signal: c.signal }),
    (e) => e instanceof DOMException && e.name === "AbortError",
  );
  assert.equal(calls, 0);
});
test("malformed success and server failure never report a mutation as definitely unsuccessful", async () => {
  for (const response of [
    new Response("<html>"),
    new Response("{}", { status: 502 }),
  ]) {
    globalThis.fetch = async () => response;
    await assert.rejects(
      requestJson("/fake", { method: "POST" }),
      (e) => e instanceof ClientRequestError && e.outcomeUnknown,
    );
  }
});
