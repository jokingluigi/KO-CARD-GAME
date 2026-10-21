/** Local QA only: installed Chromium and isolated production WebSocket routing. */
const { chromium: base } = await import(
  process.env.KO_QA_BOARD_BASE_PLAYWRIGHT ??
    "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"
);
async function configure(ctx) {
  if (process.env.KO_BOARD_LEGACY_OPT_IN === "1")
    await ctx.addInitScript(() => {
      if (["localhost", "127.0.0.1"].includes(location.hostname))
        sessionStorage.setItem("ko-dev-black-gold-board", "1");
    });
  if (process.env.KO_COSMETICS_PRODUCTION_BUILD === "1") {
    // The real production transport has a fixed API origin. Redirect only its
    // destination in the test browser; use the real local ticket/WS server.
    await ctx.addInitScript(() => {
      if (!["localhost", "127.0.0.1"].includes(location.hostname)) return;
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(url, protocols) {
          const target = new URL(url, location.href);
          if (target.hostname === "ko-card-game.onrender.com") {
            target.protocol = location.protocol === "https:" ? "wss:" : "ws:";
            target.host = location.host;
          }
          super(target.href, protocols);
        }
      };
    });
    await ctx.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !["localhost", "127.0.0.1"].includes(url.hostname)
      )
        return route.abort("blockedbyclient");
      return route.continue();
    });
  }
  return ctx;
}
export const chromium = new Proxy(base, {
  get(target, key) {
    if (key === "launch")
      return async (options) => {
        const browser = await target.launch({
          ...options,
          channel: undefined,
          executablePath:
            process.env.KO_QA_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
        });
        return new Proxy(browser, {
          get(b, k) {
            if (k === "newContext")
              return async (opts) => configure(await b.newContext(opts));
            if (k === "newPage")
              return async (opts) => {
                const ctx = await configure(await b.newContext(opts));
                return ctx.newPage();
              };
            const value = Reflect.get(b, k);
            return typeof value === "function" ? value.bind(b) : value;
          },
        });
      };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
