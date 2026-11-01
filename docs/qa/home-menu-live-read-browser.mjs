/** Deployed bundle smoke test. Only public content reads; account data is intercepted. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "docs/qa/20261101-ux-accessibility";
const browser = await chromium.launch(),
  page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
  }),
  errors = [],
  writes = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.route("**/api/**", async (r) => {
    const req = r.request(),
      p = new URL(req.url()).pathname;
    if (req.method() !== "GET") {
      writes.push({ method: req.method(), path: p });
      return r.abort();
    }
    if (p.endsWith("/main-content") || p.includes("/storage/"))
      return r.continue();
    let json = {};
    if (p.endsWith("/auth/me"))
      json = {
        authenticated: true,
        user: {
          id: "read-only-smoke",
          nickname: "배포 화면 확인",
          role: "USER",
          currencyBalance: 0,
          prismBalance: 0,
          championPrismBalance: 0,
        },
      };
    else if (p.endsWith("/server-status"))
      json = { enabled: false, allowed: true };
    else if (p.endsWith("/cards")) json = { cards: [] };
    else if (p.endsWith("/champions")) json = { champions: [] };
    else if (p.endsWith("/card-frames")) json = { frames: [] };
    else if (p.endsWith("/decks")) json = { decks: [] };
    else if (p.endsWith("/availability")) json = { enabled: true };
    return r.fulfill({ json });
  });
  await page.goto("https://ko-card-game-vr69.onrender.com/");
  await page.getByTestId("button-battle-modes").waitFor();
  await page.locator(".ko-main-menu__art-original").waitFor();
  await page.locator(".ko-main-menu__art-original").evaluate((n) => n.decode());
  await page.evaluate(() => document.fonts.ready);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  );
  await page.screenshot({ path: `${out}/deployed-home.png` });
  await page.getByTestId("button-battle-modes").click();
  await page.waitForURL("**/online");
  await page.getByTestId("button-mode-ai").waitFor();
  assert.equal(await page.locator(".ko-battle-mode-grid>button").count(), 4);
  await page.screenshot({
    path: `${out}/deployed-mode-picker.png`,
  });

  assert.ok(
    writes.every((r) => r.path === "/api/online-matches/ws-ticket"),
    "only blocked presence ticket attempts; no game mutations",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/deployed-browser.json`,
    JSON.stringify(
      {
        deployedBundle: true,
        publicBackgroundDecoded: true,
        accountIntercepted: true,
        modePicker: true,
        noScroll: true,
        blockedRequests: writes,
        productionWritesSent: 0,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("PASS deployed home and mode picker; public content reads only");
} finally {
  await browser.close();
}
