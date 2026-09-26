/* KO CARD GAME requires a connection for login, matches, and account data. */
const OFFLINE_CACHE = 'ko-card-game-offline-v1';
const offlineUrl = new URL('./offline.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(offlineUrl)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith('ko-card-game-offline-') && key !== OFFLINE_CACHE)
      .map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const relativePath = url.pathname.slice(scope.pathname.length);
  if (relativePath.startsWith('api/') || relativePath.startsWith('objects/')) return;

  event.respondWith(fetch(request).catch(async () =>
    (await caches.match(offlineUrl)) ?? Response.error()));
});
