import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchAdminSession} from './admin-session-client';
const originalFetch = globalThis.fetch;
test.afterEach(() => {globalThis.fetch = originalFetch;});
test('admin entry uses its own current session lookup and includes the existing cookie', async () => {
  globalThis.fetch = async (url,init) => {
    assert.equal(url,'/api/admin/session'); assert.equal(init?.credentials,'include'); assert.equal(init?.cache,'no-store');
    return new Response(JSON.stringify({authenticated:true,user:{id:'admin',role:'ADMIN'}}));
  };
  assert.equal((await fetchAdminSession(undefined,50)).user?.role,'ADMIN');
});
test('an unresponsive admin lookup is bounded without logging out or clearing the session', async () => {
  const calls:string[]=[];
  globalThis.fetch = async (url,init) => {calls.push(String(url)); return new Promise((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));};
  await assert.rejects(fetchAdminSession(undefined,5),/로그인 정보는 지우지 않았어/);
  assert.deepEqual(calls,['/api/admin/session']);
});
test('leaving admin aborts its lookup; a server failure does not become a guest session', async () => {
  globalThis.fetch = async (_url,init)=>new Promise((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));
  const abort=new AbortController(),request=fetchAdminSession(abort.signal,50);abort.abort();
  await assert.rejects(request,error=>error instanceof DOMException&&error.name==='AbortError');
  globalThis.fetch=async()=>new Response('{}',{status:503});
  await assert.rejects(fetchAdminSession(undefined,50),/관리자 인증 서버/);
});
