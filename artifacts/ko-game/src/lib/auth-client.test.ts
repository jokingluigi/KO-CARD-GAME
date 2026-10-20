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
    if (String(path).endsWith('/healthz')) return new Response(JSON.stringify({status:'ok'}));
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

test('a pending server wake never sends credentials; readiness submits exactly once',async()=>{
 let release!:(value:Response)=>void;const calls:string[]=[],stages:string[]=[];
 globalThis.fetch=async(path,init)=>{calls.push(String(path));if(String(path).endsWith('/healthz')){assert.equal(init?.credentials,'omit');assert.equal(init?.body,undefined);return new Promise(resolve=>release=resolve);}return new Response(JSON.stringify({authenticated:true,user:account}));};
 const login=submitAuth('login',{email:account.email,password:'test-only-password'},{wakeTimeoutMs:1000,onStage:stage=>stages.push(stage)});
 assert.deepEqual(calls,['/api/healthz']);
 release(new Response(JSON.stringify({status:'ok'})));
 assert.equal((await login).id,account.id);
 assert.deepEqual(calls,['/api/healthz','/api/auth/login']);assert.deepEqual(stages,['connecting','submitting']);
});
test('temporary gateway error retries only health reads, never the login POST',async()=>{
 let health=0,posts=0;globalThis.fetch=async(path)=>{
  if(String(path).endsWith('/healthz'))return ++health===1?new Response('warming',{status:503}):new Response(JSON.stringify({status:'ok'}));
  posts++;return new Response(JSON.stringify({authenticated:true,user:account}));
 };
 assert.equal((await submitAuth('login',{email:account.email,password:'test-only-password'},{wakeTimeoutMs:2000})).id,account.id);
 assert.equal(health,2);assert.equal(posts,1);
});
test('unavailable server times out without posting a password',async()=>{
 let posts=0;globalThis.fetch=async(path,init)=>{
  if(!String(path).endsWith('/healthz')){posts++;throw Error('password must not be posted');}
  return new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));
 };
 await assert.rejects(submitAuth('login',{email:account.email,password:'test-only-password'},{wakeTimeoutMs:5}),AuthRequestError);assert.equal(posts,0);
});
test('leaving the form while waking cancels the eventual credential submission',async()=>{
 const controller=new AbortController();let posts=0;
 globalThis.fetch=async(path,init)=>{
  if(!String(path).endsWith('/healthz')){posts++;throw Error('unexpected credentials');}
  return new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));
 };
 const pending=submitAuth('login',{email:account.email,password:'test-only-password'},{signal:controller.signal});controller.abort();await assert.rejects(pending);assert.equal(posts,0);
});
test('a login POST failure is reported without automatic credential replay',async()=>{
 let posts=0;globalThis.fetch=async(path)=>{
  if(String(path).endsWith('/healthz'))return new Response(JSON.stringify({status:'ok'}));
  posts++;throw new TypeError('connection lost after submit');
 };
 await assert.rejects(submitAuth('login',{email:account.email,password:'test-only-password'}),AuthRequestError);assert.equal(posts,1);
});
