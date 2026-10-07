// Kept separate from the game bundle so sleeping servers wake during its download.
(() => {
  const api = new URL('api/', document.currentScript.src);
  // Wake the existing API service directly while the static site proxy connects.
  // Authentication continues through the same-origin proxy; no cookies cross origins.
  if (window.location?.hostname === 'ko-card-game-vr69.onrender.com') {
    void fetch('https://ko-card-game.onrender.com/api/healthz', {
      credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(60000),
    }).catch(() => {});
  }
  function request(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const entry = { request: null, expiresAt: Infinity };
    entry.request = fetch(new URL(path, api), {
      credentials: 'include', cache: 'no-store', signal: controller.signal,
    }).then(response => {
      if (!response.ok) throw new Error(`Startup request failed: ${response.status}`);
      return response.json();
    }).finally(() => clearTimeout(timer));
    entry.request.then(() => { entry.expiresAt = Date.now() + 15000; }, () => { entry.expiresAt = 0; });
    return entry;
  }
  window.__koStartupConnection = { status: request('server-status'), auth: request('auth/me') };
})();
