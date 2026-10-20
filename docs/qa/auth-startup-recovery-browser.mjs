/** Browser network faults use isolated fixtures; never submit production credentials. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.KO_QA_CHROME_EXECUTABLE
    ? { executablePath: process.env.KO_QA_CHROME_EXECUTABLE }
    : { channel: process.env.KO_QA_CHROME_CHANNEL ?? "chromium" }),
});
const origin = process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5181";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const account = {
  id: "cold-login-qa",
  email: "cold@example.invalid",
  nickname: "COLD_QA",
  role: "ADMIN",
  currency: 0,
  currencyBalance: 0,
  prismBalance: 0,
  championPrismBalance: 0,
  isTestAccount: false,
};
const report = [],
  errors = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage();
    const sessionReleases = [];
    let releaseHealth,
      posts = 0,
      loggedIn = false;
    const writes = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") writes.push(path);
      if (path === "/api/auth/me") {
        if (loggedIn)
          return route.fulfill({
            json: { authenticated: true, user: account },
          });
        return new Promise((resolve) =>
          sessionReleases.push(async () => {
            try {
              await route.fulfill({
                json: { authenticated: false, user: null },
              });
            } catch {}
            resolve();
          }),
        );
      }
      if (path === "/api/healthz")
        return new Promise(
          (resolve) =>
            (releaseHealth = async () => {
              await route.fulfill({ json: { status: "ok" } });
              resolve();
            }),
        );
      if (path === "/api/auth/login") {
        posts++;
        loggedIn = true;
        assert.deepEqual(route.request().postDataJSON(), {
          email: account.email,
          password: "fixture-password",
        });
        return route.fulfill({ json: { authenticated: true, user: account } });
      }
      if (path === "/api/server-status")
        return route.fulfill({
          json: { enabled: false, allowed: true, message: "" },
        });
      if (path === "/api/main-content")
        return route.fulfill({
          json: { notices: [], background: null, bgm: null },
        });
      return route.fulfill({
        json: {
          cards: [],
          champions: [],
          decks: [],
          frames: [],
          items: [],
          media: [],
          available: false,
        },
      });
    });
    await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
    await page.locator("input[type=email]").waitFor({ timeout: 5000 });
    await page.locator("input[type=email]").fill(account.email);
    await page.locator("input[type=password]").fill("fixture-password");
    await page.locator("button[type=submit]").click();
    await page.getByRole("button", { name: "서버 연결 중..." }).waitFor();
    assert.equal(posts, 0);
    assert.equal(
      await page.locator("input[type=password]").inputValue(),
      "fixture-password",
    );
    await page.waitForTimeout(width === 390 ? 9000 : 300);
    assert.equal(
      await page.locator("input[type=password]").inputValue(),
      "fixture-password",
    );
    assert.equal(posts, 0);
    assert.ok(releaseHealth);
    await releaseHealth();
    await page
      .getByText(account.nickname, { exact: true })
      .waitFor({ timeout: 10000 });
    assert.equal(posts, 1);
    assert.deepEqual(writes, ["/api/auth/login"]);
    for (const release of sessionReleases) await release();
    await page.waitForTimeout(200);
    assert.equal(
      await page.locator("input[type=email]").count(),
      0,
      "late guest response cannot undo login",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    report.push({
      width,
      case: "slow session and server wake preserve input, post once, ignore late guest",
      status: "PASS",
    });
    await context.close();
  }
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (route) => {
      assert.equal(
        route.request().method(),
        "GET",
        "menu checks are read-only",
      );
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/me")
        return route.fulfill({ json: { authenticated: true, user: account } });
      if (path === "/api/admin/card-skins")
        return route.fulfill({
          json: {
            skins: [
              {
                id: "legacy-skin",
                cardDefinitionId: "old-card",
                cardName: "기존 선수",
                name: "보존된 팩 스킨",
                description: "",
                imageAssetId: null,
                imageUrl: null,
                status: "DRAFT",
              },
            ],
            cards: [{ id: "old-card", name: "기존 선수" }],
          },
        });
      return route.fulfill({
        json: {
          enabled: false,
          allowed: true,
          message: "",
          items: [],
          cards: [],
          champions: [],
        },
      });
    });
    await page.goto(origin + "/admin/cosmetics");
    await page
      .getByRole("heading", { name: "꾸미기 관리", exact: true, level: 1 })
      .waitFor();
    assert.equal(
      await page
        .locator('nav[aria-label="관리 메뉴"] a[href="/admin/skins"]')
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator('nav[aria-label="관리 메뉴"] a[href="/admin/cosmetics"]')
        .count(),
      1,
    );
    await page
      .getByLabel("아이템 이름", { exact: true })
      .fill("저장하지 않은 꾸미기");
    page.once("dialog", (d) => d.dismiss());
    await page
      .getByRole("button", { name: "기존 카드팩 스킨", exact: true })
      .click();
    await page.waitForURL("**/admin/cosmetics");
    assert.equal(
      await page.getByLabel("아이템 이름", { exact: true }).inputValue(),
      "저장하지 않은 꾸미기",
    );
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "기존 카드팩 스킨", exact: true })
      .click();
    await page.getByText("보존된 팩 스킨", { exact: true }).waitFor();
    await page.reload();
    await page
      .getByRole("heading", { name: "꾸미기 관리", exact: true, level: 1 })
      .waitFor();
    await page.getByText("보존된 팩 스킨", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "스킨·이모티콘 · 지급·장착", exact: true })
      .click();
    await page.getByLabel("아이템 이름", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    report.push({
      width,
      case: "one cosmetic menu, legacy skin alias and dirty draft guard",
      status: "PASS",
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await mkdir("qa-results/auth-startup", { recursive: true });
  await writeFile(
    "qa-results/auth-startup/browser-results.json",
    JSON.stringify({ report, pageErrors: errors }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ report, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
