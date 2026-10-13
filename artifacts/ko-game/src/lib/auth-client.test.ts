import assert from "node:assert/strict";
import test from "node:test";
import { fetchCurrentUser, submitAuth, logout, AuthRequestError } from "./auth-client";
import { startServerConnection, requestServerStatus } from './startup-client';

const originalFetch = globalThis.fetch;

test.afterEach(async () => {
  globalThis.fetch = async () => new Response('{}');
  await logout();
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
const account = { id: 'auth-qa', email: 'qa@example.invalid', nickname: 'QA', role: 'USER', currency: 0, currencyBalance: 0, prismBalance: 0, championPrismBalance: 0, isTestAccount: false };
test('login timeout releases the form instead of waiting indefinitely', async () => {
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError'))));
  const alive = setTimeout(() => {}, 100);
  try { await assert.rejects(submitAuth('login', {email: account.email, password: 'test-only-password'}, {timeoutMs:5}), (error:unknown) => error instanceof AuthRequestError); } finally { clearTimeout(alive); }
});
test('a late guest response from before login is replaced by current authentication', async () => {
  let release: (response:Response) => void = () => {}; let reads = 0;
  globalThis.fetch = async (path, init) => {
    assert.equal(init?.cache, 'no-store');
    if (String(path).endsWith('/login')) return new Response(JSON.stringify({authenticated:true,user:account}));
    if (++reads === 1) return new Promise(resolve => {release=resolve;});
    return new Response(JSON.stringify({authenticated:true,user:account}));
  };
  const pending = fetchCurrentUser({timeoutMs:100});
  await submitAuth('login', {email:account.email,password:'test-only-password'});
  release(new Response(JSON.stringify({authenticated:false,user:null})));
  assert.equal((await pending).user?.id, account.id);
  assert.equal(reads, 1, 'successful login supplies the current session without another round trip');
});

test('pending startup authentication obeys the caller deadline instead of blocking for a minute', async () => {
  globalThis.fetch = async (path, init) => String(path).endsWith('/me')
    ? new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    : new Response(JSON.stringify({ enabled: false, allowed: true, message: '' }));
  startServerConnection();
  await requestServerStatus();
  await assert.rejects(fetchCurrentUser({ timeoutMs: 5 }), AuthRequestError);
});

test('parallel session restores share one request; a network failure does not cache logout', async () => {
  let reads = 0;
  let release!: (response: Response) => void;
  globalThis.fetch = async () => { reads++; return new Promise(resolve => { release = resolve; }); };
  const first = fetchCurrentUser({ timeoutMs: 100 });
  const second = fetchCurrentUser({ timeoutMs: 100 });
  assert.equal(reads, 1);
  release(new Response('', { status: 503 }));
  await Promise.all([assert.rejects(first, AuthRequestError), assert.rejects(second, AuthRequestError)]);
  globalThis.fetch = async () => { reads++; return new Response(JSON.stringify({ authenticated: true, user: account })); };
  assert.equal((await fetchCurrentUser()).user?.id, account.id);
  assert.equal((await fetchCurrentUser()).user?.id, account.id);
  assert.equal(reads, 2, 'navigation reuses a recently confirmed user');
});

test('logout invalidates the navigation cache', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ authenticated: true, user: account }));
  await fetchCurrentUser();
  await logout();
  globalThis.fetch = async () => new Response(JSON.stringify({ authenticated: false, user: null }));
  assert.equal((await fetchCurrentUser()).authenticated, false);
});
