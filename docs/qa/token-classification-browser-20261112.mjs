import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import {
  auditSetup,
  cards as baseCards,
  champions,
} from "./ui-audit-fixture.mjs";
const out = "/tmp/ko-token-browser";
await mkdir(out, { recursive: true });
const raw = JSON.parse(
  await readFile(
    "docs/qa/20261112-token-classification/public-fixture-before.json",
  ),
);
const wolf = {
  ...raw.find((c) => c.rarity === "TOKEN"),
  quantity: 1,
  imageUrl: null,
};
const cards = [
  {
    ...baseCards[0],
    id: "visible-normal",
    name: "정상 카드",
    cardType: "WRESTLER",
    rarity: "NORMAL",
    status: "PUBLISHED",
    isToken: false,
    isChampionToken: false,
    quantity: 3,
    imageUrl: null,
  },
  wolf,
];
const browser = await chromium.launch();
const results = [];
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
    const errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("PAGEERROR", e.message);
    });
    await auditSetup(page);
    await page.route("**/api/collection", (r) =>
      r.fulfill({
        json: {
          cards,
          craftableCards: cards,
          champions: [],
          isTestAccount: false,
          prismBalance: 100,
          championPrismBalance: 0,
          championPrismSetting: { configured: false },
          prismSettings: [],
        },
      }),
    );
    await page.route("**/api/decks/options", (r) =>
      r.fulfill({ json: { cards, champions, isTestAccount: false } }),
    );
    for (const [path, gridId, search] of [
      ["collection", "collection-card-grid", "카드 이름 검색"],
      ["decks", "grid-card-collection", "카드 이름으로 검색"],
    ]) {
      await page.goto("http://127.0.0.1:5186/" + path);
      const grid = page.getByTestId(gridId);
      try {
        await grid
          .locator(":scope > article")
          .first()
          .waitFor({ timeout: 15000 });
      } catch (e) {
        console.log(
          "BROWSER_DIAGNOSTIC",
          path,
          await page.locator("body").innerText(),
        );
        await page.screenshot({
          path: out + "/failed-" + path + "-" + width + ".png",
        });
        throw e;
      }
      assert.equal(await grid.locator(":scope > article").count(), 1);
      await page.getByLabel(search, { exact: true }).fill(wolf.name);
      await page.waitForFunction(
        (id) =>
          !document.querySelector('[data-testid="' + id + '"]')?.children
            .length,
        gridId,
      );
      assert.equal(await page.getByText(wolf.name, { exact: true }).count(), 0);
      await page.screenshot({
        path: `${out}/${path}-token-hidden-${width}.png`,
      });
      results.push({
        width,
        path,
        staleFalseTokenCheckboxHidden: true,
        ownedTokenHidden: true,
        normalCardVisible: true,
      });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
