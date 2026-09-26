const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('오프라인 안내는 화면 이동에만 적용하고 계정·경기 API는 가로채지 않는다', async () => {
  const listeners = new Map();
  const offline = { status: 200, offline: true };
  const worker = {
    registration: { scope: 'https://example.com/game/' },
    addEventListener: (name, listener) => listeners.set(name, listener),
    skipWaiting: () => {},
  };
  let cachedUrl;
  const caches = {
    open: async () => ({ add: async (url) => { cachedUrl = url; } }),
    match: async (url) => url === cachedUrl ? offline : undefined,
  };
  let networkRequests = 0;
  vm.runInNewContext(readFileSync(join(__dirname, '../../public/service-worker.js'), 'utf8'), {
    self: worker, caches, URL, Response,
    fetch: async () => { networkRequests += 1; throw new Error('offline'); },
  });

  let installing;
  listeners.get('install')({ waitUntil: (promise) => { installing = promise; } });
  await installing;
  assert.equal(cachedUrl, 'https://example.com/game/offline.html');

  let navigation;
  listeners.get('fetch')({
    request: { method: 'GET', mode: 'navigate', url: 'https://example.com/game/online/match' },
    respondWith: (promise) => { navigation = promise; },
  });
  assert.equal(await navigation, offline);
  assert.equal(networkRequests, 1);

  let apiIntercepted = false;
  listeners.get('fetch')({
    request: { method: 'GET', mode: 'navigate', url: 'https://example.com/game/api/account' },
    respondWith: () => { apiIntercepted = true; },
  });
  assert.equal(apiIntercepted, false);
  assert.equal(networkRequests, 1);
});
