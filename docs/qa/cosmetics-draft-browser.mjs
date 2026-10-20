import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(
    process.env.KO_QA_PLAYWRIGHT ??
      "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
  ).href
);
const fixture = JSON.parse(
  await readFile("qa-results/cosmetics/draft-fixture.json", "utf8"),
);
const origin = process.env.KO_COSMETICS_FRONTEND ?? "http://127.0.0.1:5177";
for (const url of [origin, fixture.origin])
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.KO_QA_CHROMIUM_EXECUTABLE ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox"],
});
const errors = [],
  results = [];
async function client(user) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.route("**/api/**", async (route) => {
    const u = new URL(route.request().url());
    const response = await route.fetch({
      url: fixture.origin + u.pathname + u.search,
      headers: { ...route.request().headers(), cookie: fixture.cookies[user] },
    });
    await route.fulfill({ response });
  });
  await context.route("https://cosmetics-draft.invalid/*", async (route) => {
    const name = route.request().url().endsWith("/a.webp")
      ? "champion.webp"
      : "card.webp";
    await route.fulfill({
      contentType: "image/webp",
      body: await readFile(
        "docs/qa/admin-usage-statistics-20261016/fixtures/" + name,
      ),
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/draft/match/" + fixture.id);
  return { context, page };
}
async function check(name, task) {
  await task();
  results.push({ name, status: "PASS" });
  console.log("PASS " + name);
}
try {
  const [a, b] = await Promise.all([client("cos-a"), client("cos-b")]);
  await check(
    "Draft PvP both browsers use persisted seat-specific skins and different opaque card backs",
    async () => {
      for (const { page } of [a, b])
        await page
          .getByRole("button", { name: "이미지 이모티콘", exact: true })
          .waitFor();
      await a.page.waitForTimeout(4700);
      assert.equal(
        await a.page.locator(".ko-player-champion img").getAttribute("src"),
        fixture.assetA,
      );
      assert.equal(
        await b.page.locator(".ko-opponent-champion img").getAttribute("src"),
        fixture.assetA,
      );
      assert.equal(
        await a.page
          .locator(".ko-opponent-hand .cosmetic-card-back")
          .first()
          .getAttribute("src"),
        fixture.assetB,
      );
      assert.equal(
        await b.page
          .locator(".ko-opponent-hand .cosmetic-card-back")
          .first()
          .getAttribute("src"),
        fixture.assetA,
      );
      await a.page.screenshot({ path: "qa-results/cosmetics/draft-a.png" });
      await b.page.screenshot({ path: "qa-results/cosmetics/draft-b.png" });
    },
  );
  await check(
    "Draft image emote ACK and existing polling deliver A to both screens once",
    async () => {
      await a.page
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .tap();
      await a.page
        .getByRole("button", { name: "드래프트 이모티콘 A", exact: true })
        .tap();
      for (const { page } of [a, b]) {
        const image = page.locator(
          '[data-cosmetic-emote-player="PLAYER_ONE"] img',
        );
        await image.waitFor();
        assert.equal(await image.getAttribute("src"), fixture.assetA);
      }
      await b.page.screenshot({ path: "qa-results/cosmetics/draft-emote.png" });
    },
  );
  await check(
    "Draft opponent image emote is delivered through the same independent transport",
    async () => {
      await b.page
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .tap();
      await b.page
        .getByRole("button", { name: "드래프트 이모티콘 B", exact: true })
        .tap();
      for (const { page } of [a, b]) {
        const image = page.locator(
          '[data-cosmetic-emote-player="PLAYER_TWO"] img',
        );
        await image.waitFor();
        assert.equal(await image.getAttribute("src"), fixture.assetB);
      }
    },
  );
  await check(
    "Draft reload restores frozen equipment despite unequip after room creation; mobile fits",
    async () => {
      await a.page.reload();
      await a.page
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .waitFor();
      assert.equal(
        await a.page
          .locator(".ko-player-zones .cosmetic-card-back")
          .getAttribute("src"),
        fixture.assetA,
      );
      for (const width of [360, 412]) {
        await a.page.setViewportSize({ width, height: 844 });
        assert.ok(
          await a.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
      }
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "qa-results/cosmetics/draft-browser-results.json",
    JSON.stringify(
      {
        kind: "two Chromium mobile emulations using actual local Draft HTTP APIs",
        results,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
