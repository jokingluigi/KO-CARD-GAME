/** Read-only inventory fixture, existing project illustrations, actual wardrobe page. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const fixture = JSON.parse(
    await readFile("qa-results/cosmetics/fixture.json", "utf8"),
  ),
  origin = process.env.KO_COSMETICS_FRONTEND;
assert.equal(new URL(origin).hostname, "127.0.0.1");
const data = JSON.parse(
  await readFile("artifacts/ko-game/qa/art-direction-data.json", "utf8"),
);
const championFiles = [
  "champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
  "champion-0db142af-750e-4929-a464-5daf1bc75452.png",
];
const cardFiles = [
  "card-102e8061-c3b8-44a5-a11c-56379996fee7.png",
  "card-75863228-ae51-48cb-afec-43cc391672a8.png",
  "card-bcf2ac9b-1afd-41a3-a653-5f9af1e033bf.png",
  "card-db6c775a-0933-4e55-9fdc-a94861c6e10a.png",
  "card-epic-spell-veil-of-silence.png",
  "card-latest-wrestler-10.png",
];
const source = (file) => origin + "/wardrobe-review/" + file;
const champions = championFiles.map((file) => ({
  ...data.champions.champions.find((c) => file.includes(c.id)),
  imageUrl: source(file),
}));
assert.ok(champions.every((c) => c.id));
const cards = cardFiles.map((file, i) => ({
  ...(data.cards.cards.find((c) => file.includes(c.id)) ?? data.cards.cards[i]),
  imageUrl: source(file),
}));
const item = (type, id, name, targetId, file) => ({
  id,
  type,
  name,
  description:
    "화면 구성 확인을 위한 격리된 목록입니다. 프로젝트의 기존 일러스트를 사용합니다.",
  targetId,
  imageAssets: { art: source(file) },
  isActive: true,
  sortOrder: 0,
});
const items = [
  ...champions.map((c, i) =>
    item("CHAMPION_SKIN", "hero-" + i, c.name, c.id, championFiles[i]),
  ),
  ...cards.map((c, i) =>
    item("CARD_SKIN", "card-" + i, c.name, c.id, cardFiles[i]),
  ),
  item("CARD_BACK", "back", "카드 뒷면", null, cardFiles[0]),
];
const inventory = {
  owned: items.map((item, i) => ({
    item,
    acquiredAt: new Date(Date.UTC(2026, 10, 2, 0, i)).toISOString(),
  })),
  cards,
  champions,
  loadout: {
    version: 1,
    skins: { ["champion:" + champions[0].id]: items[0] },
    cardBack: null,
    emotes: [],
  },
};
const browser = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 1000],
  ]) {
    const c = await browser.newContext({ viewport: { width, height } });
    const [name, ...value] = fixture.cookies["player-a"].split("=");
    await c.addCookies([{ name, value: value.join("="), url: origin }]);
    const p = await c.newPage();
    await p.route("**/api/cosmetics", (r) => r.fulfill({ json: inventory }));
    await p.route("**/api/cosmetics/equipment", (r) => r.abort());
    await p.route("**/wardrobe-review/*", async (r) => {
      const file = new URL(r.request().url()).pathname.split("/").pop();
      assert.ok([...championFiles, ...cardFiles].includes(file));
      await r.fulfill({
        contentType: "image/png",
        body: await readFile("artifacts/ko-game/qa/retro-font/assets/" + file),
      });
    });
    await p.goto(origin + "/cosmetics");
    await p.locator(".ko-wardrobe__thumbnail img").first().waitFor();
    await p
      .locator(".ko-wardrobe__thumbnail img")
      .evaluateAll((ns) =>
        Promise.all(ns.map((n) => n.decode().catch(() => {}))),
      );
    await p.screenshot({
      path: `qa-results/wardrobe-emote/gallery-champions-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await p
      .getByRole("button", {
        name: champions[0].name + " 자세히 보기",
        exact: true,
      })
      .click();
    const detail =
      width >= 1000
        ? p.getByLabel("선택 아이템 미리보기")
        : p.getByRole("dialog");
    await detail
      .locator("img")
      .evaluateAll((ns) =>
        Promise.all(ns.map((n) => n.decode().catch(() => {}))),
      );
    if (width < 1000) {
      await detail.evaluate(async (n) => {
        await Promise.all(
          n
            .getAnimations({ subtree: true })
            .filter((a) => a.effect?.getTiming().iterations !== Infinity)
            .map((a) => a.finished.catch(() => {})),
        );
      });
      const surface = await detail.evaluate((n) => ({
        background: getComputedStyle(n).backgroundColor,
        opacity: getComputedStyle(n).opacity,
      }));
      assert.equal(
        surface.background,
        "rgb(17, 18, 22)",
        JSON.stringify(surface),
      );
      assert.equal(surface.opacity, "1");
      await p.screenshot({
        path: `qa-results/wardrobe-emote/champion-detail-${width}.png`,
        animations: "disabled",
      });
      await detail.getByRole("button", { name: "닫기", exact: true }).click();
      await detail.waitFor({ state: "detached" });
    }
    await p.getByRole("button", { name: "카드 스킨", exact: true }).click();
    await p.locator(".ko-wardrobe__thumbnail img").first().waitFor();
    await p
      .locator(".ko-wardrobe__thumbnail img")
      .evaluateAll((ns) =>
        Promise.all(ns.map((n) => n.decode().catch(() => {}))),
      );
    await p.screenshot({
      path: `qa-results/wardrobe-emote/gallery-cards-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    results.push({
      width,
      height,
      readOnlyInventoryFixture: true,
      existingIllustrations: true,
      noHorizontalOverflow: true,
    });
    await c.close();
  }
  await writeFile(
    "qa-results/wardrobe-emote/gallery-review-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
