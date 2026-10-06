import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { fetchCurrentUser } from './auth-client';
import { invalidateStartupAuth, requestServerStatus, startServerConnection } from './startup-client';

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; invalidateStartupAuth(); });
const status = { enabled: false, allowed: true, message: '' };
const guest = { authenticated: false, user: null };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

test('HTML startup begins status and auth in parallel; gate and home reuse both pending requests', async () => {
  const calls: string[] = [];
  const pending = new Map<string, (response: Response) => void>();
  globalThis.fetch = async (path, init) => {
    assert.equal(init?.credentials, 'include');
    assert.equal(init?.cache, 'no-store');
    calls.push(String(path));
    return new Promise(resolve => pending.set(String(path), resolve));
  };
  startServerConnection();
  assert.deepEqual(calls, ['/api/server-status', '/api/auth/me']);
  const gate = requestServerStatus();
  const manualRetry = requestServerStatus();
  const auth = fetchCurrentUser();
  assert.equal(calls.length, 2);
  pending.get('/api/auth/me')!(json(guest));
  pending.get('/api/server-status')!(json(status));
  assert.deepEqual(await auth, guest);
  assert.deepEqual(await gate, status);
  assert.deepEqual(await manualRetry, status);
});

test('already completed startup results avoid another round trip and are consumed only once', async () => {
  const calls: string[] = [];
  globalThis.fetch = async path => { calls.push(String(path)); return json(String(path).endsWith('/me') ? guest : status); };
  startServerConnection();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await requestServerStatus(), status);
  assert.deepEqual(await fetchCurrentUser(), guest);
  assert.equal(calls.length, 2);
  await fetchCurrentUser();
  assert.equal(calls.length, 3);
});

test('maintenance denial is preserved and failed startup auth retries instead of assuming logout', async () => {
  let authCalls = 0;
  const denied = { enabled: true, allowed: false, message: '점검' };
  globalThis.fetch = async path => String(path).endsWith('/me')
    ? (++authCalls === 1 ? new Response('', { status: 503 }) : json(guest)) : json(denied);
  startServerConnection();
  assert.deepEqual(await requestServerStatus(), denied);
  assert.deepEqual(await fetchCurrentUser({ timeoutMs: 50 }), guest);
  assert.equal(authCalls, 2);
});

test('invalidated or expired prefetched authentication cannot restore an old session', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  let authCalls = 0;
  globalThis.fetch = async path => { if (String(path).endsWith('/me')) authCalls++; return json(String(path).endsWith('/me') ? guest : status); };
  try {
    startServerConnection();
    await new Promise(resolve => setImmediate(resolve));
    now += 16_000;
    await requestServerStatus();
    await fetchCurrentUser();
    assert.equal(authCalls, 2);
    startServerConnection();
    await requestServerStatus();
    invalidateStartupAuth();
    await fetchCurrentUser();
    assert.equal(authCalls, 4);
  } finally { Date.now = originalNow; }
});

test('failed status checks release the single-flight request for a safe retry', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? new Response('', { status: 503 }) : json(status);
  await assert.rejects(requestServerStatus());
  assert.deepEqual(await requestServerStatus(), status);
  assert.equal(calls, 2);
});

test('separate HTML script connects before the game module and is adopted without duplicate fetches', async () => {
  const calls: string[] = [];
  const pageWindow: any = {};
  const fetcher = async (path: URL) => {
    calls.push(path.href);
    return json(path.pathname.endsWith('/me') ? guest : status);
  };
  runInNewContext(await readFile(new URL('../../public/server-connection.js', import.meta.url), 'utf8'), {
    document: { currentScript: { src: 'https://game.invalid/sub/server-connection.js' } },
    window: pageWindow, fetch: fetcher, URL, AbortController, setTimeout, clearTimeout, Date,
  });
  assert.deepEqual(calls, ['https://game.invalid/sub/api/server-status', 'https://game.invalid/sub/api/auth/me']);
  const runtime = globalThis as typeof globalThis & { window?: Window };
  const originalWindow = Object.getOwnPropertyDescriptor(runtime, 'window');
  Object.defineProperty(runtime, 'window', { configurable: true, writable: true, value: pageWindow });
  globalThis.fetch = async () => { throw new Error('duplicate startup fetch'); };
  try {
    startServerConnection();
    assert.equal(pageWindow.__koStartupConnection, undefined);
    const gate = requestServerStatus();
    const manualRetry = requestServerStatus();
    assert.deepEqual(await gate, status);
    assert.deepEqual(await manualRetry, status);
    assert.deepEqual(await fetchCurrentUser(), guest);
  } finally {
    if (originalWindow) Object.defineProperty(runtime, 'window', originalWindow);
    else Reflect.deleteProperty(runtime, 'window');
  }
});
