import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import {
  auditSetup,
  cards as baseCards,
  champions,
} from "./ui-audit-fixture.mjs";
const out = "/tmp/ko-catalog-visible";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
const cards = Array.from({ length: 12 }, (_, i) => ({
  ...baseCards[0],
  id: "filter-" + i,
  name: "필터 검증 " + i,
  cardType: "WRESTLER",
  rarity: i % 2 ? "NORMAL" : "EPIC",
  cost: 1,
  tags: [i % 3 ? "other" : "zombie"],
  quantity: 3,
  isToken: false,
  isChampionToken: false,
  status: "PUBLISHED",
}));
try {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width < 1000,
      hasTouch: width < 1000,
    });
    const page = await context.newPage();
    await auditSetup(page);
    await page.route("**/api/collection", (r) =>
      r.fulfill({
        json: {
          cards,
          craftableCards: cards,
          champions: [],
          isTestAccount: true,
          prismSettings: [],
        },
      }),
    );
    await page.route("**/api/decks/options", (r) =>
      r.fulfill({ json: { cards, champions, isTestAccount: true } }),
    );
    await page.route("**/api/card-tags", (r) =>
      r.fulfill({ json: { labels: { zombie: "좀비", other: "기타" } } }),
    );
    for (const [path, gridId] of [
      ["collection", "collection-card-grid"],
      ["decks", "grid-card-collection"],
    ]) {
      await page.goto("http://127.0.0.1:5186/" + path);
      const grid = page.getByTestId(gridId);
      await grid.locator(":scope > article").first().waitFor();
      const tag = page.getByLabel("태그", { exact: true }),
        rarity = page.getByLabel("등급", { exact: true });
      await tag.scrollIntoViewIfNeeded();
      assert.equal(await tag.isVisible(), true);
      assert.equal(await page.locator("details[open]").count(), 0);
      await tag.selectOption("zombie");
      await rarity.selectOption("EPIC");
      await page.waitForFunction(
        (id) =>
          document.querySelector('[data-testid="' + id + '"]')?.children
            .length === 2,
        gridId,
      );
      await page.screenshot({ path: `${out}/${path}-${width}.png` });
      await page.reload();
      await tag.waitFor();
      assert.equal(await tag.inputValue(), "zombie");
      assert.equal(await rarity.inputValue(), "EPIC");
      await page.waitForFunction(
        (id) =>
          document.querySelector('[data-testid="' + id + '"]')?.children
            .length === 2,
        gridId,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      results.push({
        path,
        width,
        visible: true,
        combinedFilterCount: 2,
        persisted: true,
        noHorizontalOverflow: true,
      });
    }
    await context.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
