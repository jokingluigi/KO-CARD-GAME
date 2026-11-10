import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import {
  auditSetup,
  cards as baseCards,
  champions,
} from "./ui-audit-fixture.mjs";
const out = "docs/qa/20261110-catalog-tags";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  results = [];
const cards = Array.from({ length: 121 }, (_, i) => ({
  ...baseCards[i % baseCards.length],
  id: "browse-" + i,
  name: `목록 검증 ${String(i).padStart(3, "0")}`,
  cardType: i % 4 === 0 ? "TECHNIQUE" : "WRESTLER",
  rarity: i % 5 === 0 ? "EPIC" : "NORMAL",
  cost: i % 7,
  quantity: 3,
  isToken: false,
  isChampionToken: false,
  status: "PUBLISHED",
  tags: ["browse-tag"],
  imageUrl: null,
  version: 1,
  effectId: null,
  effectConfig: {},
}));
async function scrollPosition(page, selector) {
  return page.locator(selector).evaluate((node) => {
    for (let p = node.parentElement; p; p = p.parentElement)
      if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return p.scrollTop;
    return scrollY;
  });
}
try {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width !== 1440,
      hasTouch: width !== 1440,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await auditSetup(page);
    await page.route("**/api/collection", (r) =>
      r.fulfill({
        json: {
          cards,
          craftableCards: cards,
          champions: [],
          prismBalance: 1000,
          championPrismBalance: 0,
          championPrismSetting: { configured: false },
          prismSettings: [],
          isTestAccount: true,
        },
      }),
    );
    await page.route("**/api/decks/options", (r) =>
      r.fulfill({ json: { cards, champions, isTestAccount: true } }),
    );
    await page.route("**/api/card-tags", (r) =>
      r.fulfill({ json: { labels: { "browse-tag": "변경된 태그" } } }),
    );
    await page.goto("http://127.0.0.1:5186/collection");
    const grid = page.getByTestId("collection-card-grid");
    await grid.locator(":scope > article").first().waitFor();
    assert.equal(await grid.locator(":scope > article").count(), 40);
    const columns = await grid.evaluate(
      (n) => getComputedStyle(n).gridTemplateColumns.split(" ").length,
    );
    if (width === 390) assert.equal(columns, 3);
    await page.getByRole("button", { name: "크게 보기", exact: true }).click();
    if (width === 390)
      assert.equal(
        await grid.evaluate(
          (n) => getComputedStyle(n).gridTemplateColumns.split(" ").length,
        ),
        2,
      );
    await page.getByRole("button", { name: "모아 보기", exact: true }).click();
    await page.getByTestId("catalog-continuation").scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="collection-card-grid"]').children
          .length >= 80,
    );
    await page
      .locator('[data-motion-key="browse-50"]')
      .scrollIntoViewIfNeeded();
    await page.locator('[data-motion-key="browse-50"]').evaluate((node) =>
      node.addEventListener(
        "pointerdown",
        () => {
          let host = window;
          for (let p = node.parentElement; p; p = p.parentElement)
            if (/auto|scroll/.test(getComputedStyle(p).overflowY)) {
              host = p;
              break;
            }
          window.__catalogPointerY = host === window ? scrollY : host.scrollTop;
        },
        { once: true },
      ),
    );
    await page.locator('[data-motion-key="browse-50"]').click();
    const before = await page.evaluate(() => window.__catalogPointerY);
    const dialog = page.getByRole("dialog").first();
    await dialog.waitFor();
    await dialog.getByLabel("변경된 태그 태그 카드 보기").waitFor();
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    const after = await scrollPosition(page, ".ko-collection");
    assert.ok(after > 1000);
    assert.ok(
      Math.abs(before - after) < 400,
      `detail restore shifted ${before}->${after}`,
    );
    await page.reload();
    await grid.locator(":scope > article").first().waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="collection-card-grid"]').children
          .length >= 80,
    );
    await page.waitForTimeout(200);
    const restored = await scrollPosition(page, ".ko-collection");
    assert.ok(restored > 1000, `reload scroll lost ${restored}`);
    await page
      .getByLabel("카드 이름 검색", { exact: true })
      .fill("목록 검증 120");
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="collection-card-grid"]')?.children
          .length === 1,
    );
    await page.getByLabel("카드 이름 검색", { exact: true }).fill("");
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="collection-card-grid"]').children
          .length >= 40,
    );
    await page.locator(".ko-collection-controls").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/collection-${width}x${height}.png` });
    await page.goto("http://127.0.0.1:5186/decks");
    const deckGrid = page.getByTestId("grid-card-collection");
    await deckGrid.locator(":scope > article").first().waitFor();
    if (width < 1101)
      await page
        .locator(".ko-workspace-nav")
        .getByRole("button", { name: "내 덱", exact: true })
        .click();
    await page.getByTestId("button-create-deck").click();
    await page
      .locator(".ko-workspace-nav")
      .getByRole("button", { name: "카드 찾기", exact: true })
      .click();
    assert.equal(await deckGrid.locator(":scope > article").count(), 40);
    await page.getByTestId("catalog-continuation").scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="grid-card-collection"]').children
          .length >= 80,
    );
    await page
      .getByTestId("card-collection-browse-50")
      .scrollIntoViewIfNeeded();
    await page
      .getByTestId("button-add-card-action-browse-50")
      .evaluate((node) =>
        node.addEventListener(
          "pointerdown",
          () => {
            let host = window;
            for (let p = node.parentElement; p; p = p.parentElement)
              if (/auto|scroll/.test(getComputedStyle(p).overflowY)) {
                host = p;
                break;
              }
            window.__deckPointerY = host === window ? scrollY : host.scrollTop;
          },
          { once: true },
        ),
      );
    await page.getByTestId("button-add-card-action-browse-50").click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="text-card-ownership-browse-50"]')
        ?.textContent.includes("덱 1"),
    );
    const addedAt = await scrollPosition(page, "#deck-library");
    const pointerAt = await page.evaluate(() => window.__deckPointerY);
    assert.ok(
      Math.abs(addedAt - pointerAt) < 120,
      "adding card must preserve scroll",
    );
    const deckBefore = await scrollPosition(page, "#deck-library");
    if (width < 1101) {
      await page.locator(".ko-mobile-current-deck").click();
      await page.locator("#deck-workspace").waitFor({ state: "visible" });
      await page.locator(".ko-mobile-current-deck").click();
      await deckGrid.waitFor({ state: "visible" });
      await page.waitForTimeout(100);
      const deckAfter = await scrollPosition(page, "#deck-library");
      assert.ok(
        Math.abs(deckBefore - deckAfter) < 400,
        `workspace return ${deckBefore}->${deckAfter}`,
      );
    }
    await page.getByTestId("input-card-search").fill("목록 검증 120");
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="grid-card-collection"]').children
          .length === 1,
    );
    await page.getByTestId("input-card-search").fill("");
    await page.locator(".ko-decks__toolbar").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/decks-${width}x${height}.png` });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      initial: 40,
      scrollLoadsMore: true,
      densitySwitch: true,
      detailKeepsScroll: true,
      reloadKeepsScroll: true,
      filters: true,
      mobileDeckReturn: width < 1101,
      addCardKeepsScroll: true,
      pageErrors: errors,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  out + "/catalog-browser.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
