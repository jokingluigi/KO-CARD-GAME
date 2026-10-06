// Kept separate from the game bundle so sleeping servers wake during its download.
(() => {
  const api = new URL('api/', document.currentScript.src);
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
