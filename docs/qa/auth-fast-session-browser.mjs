/** Real HttpOnly cookie + isolated API; delayed transport is injected only in this browser. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const origin = "http://127.0.0.1:5193",
  api = "http://127.0.0.1:17994";
const out = "qa-results/auth-fast-session";
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  results = [];
async function setup(width, storageState, mode = "normal") {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    ...(storageState ? { storageState } : {}),
  });
  const page = await context.newPage(),
    errors = [],
    calls = [];
  let reads = 0,
    release;
  const old = new Promise((r) => (release = r));
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/api/**", async (route) => {
    const request = route.request(),
      u = new URL(request.url()),
      path = u.pathname;
    calls.push({ path, method: request.method() });
    try {
      if (
        ((path === "/api/auth/me" && mode === "stalled") ||
          (path === "/api/admin/session" && mode === "stalled-admin")) &&
        ++reads === 1
      ) {
        await old;
        return await route.fulfill({
          status: 503,
          json: { message: "old stalled connection" },
        });
      }
      if (path === "/api/server-status" && mode === "stale-status") {
        if (!request.headers().cookie) {
          await old;
          return await route.fulfill({
            json: { enabled: true, allowed: false, message: "OLD STATUS" },
          });
        }
        return await route.fulfill({
          json: { enabled: true, allowed: true, message: "current" },
        });
      }
      if (
        path.startsWith("/api/auth/") ||
        path === "/api/server-status" ||
        path === "/api/admin/session"
      ) {
        const response = await route.fetch({ url: api + path + u.search });
        if (path === "/api/auth/login" && mode === "slow-login") await old;
        return await route.fulfill({ response });
      }
      if (path.endsWith("/ws-ticket"))
        return await route.fulfill({ status: 503, json: {} });
      return await route.fulfill({
        json: {
          cards: [],
          champions: [],
          decks: [],
          frames: [],
          notices: [],
          items: [],
          media: [],
          background: null,
          bgm: null,
        },
      });
    } catch (e) {
      if (!request.failure()) throw e;
    }
  });
  return { context, page, calls, errors, release };
}
async function login(page) {
  await page.locator("input[type=email]").fill("cookie@auth.invalid");
  await page.locator("input[type=password]").fill("Local-cookie-only-123!");
  await page
    .getByRole("button", { name: "로그인", exact: true })
    .last()
    .click();
  await page.locator(".ko-main-menu").waitFor({ timeout: 15000 });
}
try {
  for (const width of [390, 1440]) {
    let x = await setup(width);
    await x.page.goto(origin);
    await x.page.locator("input[type=email]").waitFor();
    const began = Date.now();
    await login(x.page);
    const loginMs = Date.now() - began;
    assert.equal(x.calls.filter((c) => c.path === "/api/auth/login").length, 1);
    assert.equal(
      x.calls.filter((c) => c.path === "/api/healthz").length,
      0,
      "normal login must not wait for health",
    );
    const cookie = (await x.context.cookies()).find(
      (c) => c.name === "ko_session",
    );
    assert.ok(cookie?.httpOnly);
    assert.equal(cookie.sameSite, "Lax");
    assert.ok(cookie.expires > Date.now() / 1000 + 29 * 86400);
    const state = await x.context.storageState();
    assert.deepEqual(x.errors, []);
    await x.page.screenshot({ path: `${out}/logged-in-${width}.png` });
    await x.context.close();
    x = await setup(width, state);
    let start = Date.now();
    await x.page.goto(origin);
    await x.page.locator(".ko-main-menu").waitFor({ timeout: 10000 });
    const restoredMs = Date.now() - start;
    assert.equal(x.calls.filter((c) => c.path === "/api/auth/login").length, 0);
    await x.page.reload();
    await x.page.locator(".ko-main-menu").waitFor({ timeout: 10000 });
    assert.equal(x.calls.filter((c) => c.path === "/api/auth/login").length, 0);
    assert.deepEqual(x.errors, []);
    await x.context.close();
    x = await setup(width, state, "stalled");
    start = Date.now();
    await x.page.goto(origin);
    await x.page.locator(".ko-main-menu").waitFor({ timeout: 8000 });
    const recoveredMs = Date.now() - start;
    assert.equal(
      x.calls.filter((c) => c.path === "/api/auth/me").length,
      2,
      "one bounded fresh read unblocks the stalled initial GET",
    );
    assert.ok(recoveredMs < 7000);
    assert.equal(x.calls.filter((c) => c.path === "/api/auth/login").length, 0);
    x.release();
    await x.page.waitForTimeout(200);
    assert.deepEqual(x.errors, []);
    await x.page.screenshot({ path: `${out}/restored-${width}.png` });
    await x.context.close();
    x = await setup(width, state, "stalled-admin");
    start = Date.now();
    await x.page.goto(origin + "/admin");
    await x.page
      .getByRole("heading", { name: "운영 개요", exact: true })
      .waitFor({ timeout: 8000 });
    const adminRecoveryMs = Date.now() - start;
    assert.equal(
      x.calls.filter((c) => c.path === "/api/admin/session").length,
      2,
    );
    x.release();
    await x.page.waitForTimeout(150);
    assert.deepEqual(x.errors, []);
    await x.context.close();
    x = await setup(width, state);
    await x.page.goto(origin);
    await x.page.locator(".ko-main-menu").waitFor();
    await x.page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await x.page.locator("input[type=email]").waitFor();
    await x.context.close();
    x = await setup(width, state);
    await x.page.goto(origin);
    await x.page.locator("input[type=email]").waitFor();
    assert.equal(
      await x.page.locator(".ko-main-menu").count(),
      0,
      "revoked cookie must not restore authentication",
    );
    await x.context.close();
    results.push({
      width,
      realCookiePersistent: true,
      loginMs,
      restoredMs,
      stalledRecoveryMs: recoveredMs,
      adminRecoveryMs,
      loginPosts: 1,
      loginHealthPreflights: 0,
      reloadWithoutLogin: true,
      revokedSessionRejected: true,
    });
  }
  const slow = await setup(390, undefined, "slow-login");
  await slow.page.goto(origin);
  await slow.page.locator("input[type=email]").waitFor();
  await slow.page.locator("input[type=email]").fill("cookie@auth.invalid");
  await slow.page
    .locator("input[type=password]")
    .fill("Local-cookie-only-123!");
  const submitted = Date.now();
  await slow.page.locator("button[type=submit]").click();
  await slow.page.waitForTimeout(21000);
  assert.equal(
    await slow.page.locator("input[type=password]").inputValue(),
    "Local-cookie-only-123!",
  );
  assert.equal(
    await slow.page.locator("button[type=submit]").isDisabled(),
    true,
  );
  slow.release();
  await slow.page.locator(".ko-main-menu").waitFor({ timeout: 8000 });
  assert.equal(
    slow.calls.filter((c) => c.path === "/api/auth/login").length,
    1,
  );
  assert.equal(slow.calls.filter((c) => c.path === "/api/healthz").length, 0);
  assert.deepEqual(slow.errors, []);
  await slow.context.close();
  results.push({
    slowLoginResponseMs: Date.now() - submitted,
    singleCredentialPost: true,
    passwordPreserved: true,
  });
  const x = await setup(390, undefined, "stale-status");
  await x.page.goto(origin);
  await x.page.locator("input[type=email]").waitFor();
  await login(x.page);
  x.release();
  await x.page.waitForTimeout(500);
  assert.equal(await x.page.locator(".ko-main-menu").count(), 1);
  assert.equal(
    await x.page.getByText("서버 점검 중", { exact: true }).count(),
    0,
  );
  assert.deepEqual(x.errors, []);
  await x.context.close();
  results.push({ staleMaintenanceResponseIgnored: true });
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
