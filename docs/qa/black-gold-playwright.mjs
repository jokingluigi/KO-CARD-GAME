/** Tooling adapter: opt in only on loopback development sites; real assertions stay unchanged. */
const { chromium: base } = await import(
  process.env.KO_QA_BOARD_BASE_PLAYWRIGHT ??
    "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"
);
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
              return async (opts) => {
                const ctx = await b.newContext(opts);
                await ctx.addInitScript(() => {
                  if (["localhost", "127.0.0.1"].includes(location.hostname))
                    sessionStorage.setItem("ko-dev-black-gold-board", "1");
                });
                return ctx;
              };
            // Browser.newPage creates its context internally, so it needs the
            // same opt-in as callers that explicitly create a context.
            if (k === "newPage")
              return async (opts) => {
                const page = await b.newPage(opts);
                await page.addInitScript(() => {
                  if (["localhost", "127.0.0.1"].includes(location.hostname))
                    sessionStorage.setItem("ko-dev-black-gold-board", "1");
                });
                return page;
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
