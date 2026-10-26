/** Real isolated administrator UI/HTTP flow; no production writes. */
await import("./champion-common-art-browser.mjs");
import { chromium } from "./black-gold-playwright.mjs";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const fixture = JSON.parse(
  await readFile("qa-results/cosmetics/fixture.json", "utf8"),
);
const origin = process.env.KO_COSMETICS_FRONTEND;
if (!origin || new URL(origin).hostname !== "127.0.0.1")
  throw new Error("Local fixture only");
const out = "qa-results/admin-deletion";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [360, 740],
    [1440, 900],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 600,
      isMobile: width < 600,
    });
    const [name, ...value] = fixture.cookies.admin.split("=");
    await ctx.addCookies([{ name, value: value.join("="), url: origin }]);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let accept = true;
    page.on("dialog", (dialog) =>
      accept ? dialog.accept() : dialog.dismiss(),
    );
    async function api(path, method = "GET", body) {
      return page.evaluate(
        async ({ path, method, body }) => {
          const r = await fetch("/api" + path, {
            method,
            headers: { "Content-Type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
          return { status: r.status, body: await r.json().catch(() => ({})) };
        },
        { path, method, body },
      );
    }
    await page.goto(origin + "/admin/notices");
    const notice = await api("/admin/notices", "POST", {
      title: "UI 삭제 공지 " + width,
      body: "삭제와 취소를 검증합니다.",
      displayOrder: 0,
      enabled: true,
    });
    assert.equal(notice.status, 201);
    await page.reload();
    const article = page.locator(`[data-notice-id="${notice.body.notice.id}"]`);
    await article.waitFor();
    accept = false;
    await article.getByRole("button", { name: "삭제", exact: true }).click();
    accept = true;
    assert.ok(
      (await api("/notices")).body.notices.some(
        (n) => n.id === notice.body.notice.id,
      ),
    );
    await article.getByRole("button", { name: "삭제", exact: true }).click();
    await article.waitFor({ state: "detached" });
    assert.ok(
      !(await api("/notices")).body.notices.some(
        (n) => n.id === notice.body.notice.id,
      ),
    );
    await page.screenshot({
      path: `${out}/notice-deleted-${width}.png`,
      fullPage: true,
    });
    const skin = await api("/admin/cosmetics/items", "POST", {
      ...fixture.registered.CHAMPION_SKIN,
      name: "UI 삭제 스킨 " + width,
    });
    assert.equal(skin.status, 201);
    await page.goto(origin + "/admin/cosmetics");
    await page
      .getByRole("button", { name: new RegExp("UI 삭제 스킨 " + width) })
      .click();
    accept = false;
    await page
      .getByRole("button", { name: "아이템 삭제", exact: true })
      .click();
    accept = true;
    assert.ok(
      (await api("/admin/cosmetics")).body.items.some(
        (i) => i.id === skin.body.item.id,
      ),
    );
    await page
      .getByRole("button", { name: "아이템 삭제", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "아이템을 삭제했습니다" })
      .waitFor();
    assert.ok(
      !(await api("/admin/cosmetics")).body.items.some(
        (i) => i.id === skin.body.item.id,
      ),
    );
    await page.screenshot({
      path: `${out}/skin-deleted-${width}.png`,
      fullPage: true,
    });
    const cardIds = fixture.cards.flatMap((c, i) =>
      Array(i === 8 ? 1 : 3).fill(c.id),
    );
    const product = await api("/admin/shop-decks", "POST", {
      name: "UI 삭제 상품 " + width,
      description: "삭제 테스트",
      imageUrl: null,
      cardDefinitionIds: cardIds,
      price: 0,
      recommendedChampionId: fixture.championId,
      includeChampion: false,
      allowUnpublished: false,
      enabled: false,
      displayOrder: 0,
    });
    assert.equal(product.status, 201, JSON.stringify(product));
    await page.goto(origin + "/admin/shop-decks");
    await page
      .getByRole("button", { name: "UI 삭제 상품 " + width, exact: true })
      .click();
    await page
      .getByRole("button", { name: "덱 상품 삭제", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "덱 상품을 삭제했습니다" })
      .waitFor();
    assert.ok(
      !(await api("/admin/shop-decks")).body.items.some(
        (i) => i.id === product.body.item.id,
      ),
    );
    await page.screenshot({
      path: `${out}/product-deleted-${width}.png`,
      fullPage: true,
    });
    const season = await api("/admin/quests/seasons", "POST", {
      name: "UI 삭제 시즌 " + width,
      startsAt: "2099-01-01T00:00:00Z",
      endsAt: "2099-02-01T00:00:00Z",
      status: "DISABLED",
    });
    assert.equal(season.status, 200);
    await page.goto(origin + "/admin/quests");
    await page
      .getByRole("button", { name: new RegExp("UI 삭제 시즌 " + width) })
      .click();
    await page.getByRole("button", { name: "시즌 삭제", exact: true }).click();
    await page.getByText("시즌을 삭제했습니다.", { exact: true }).waitFor();
    assert.ok(
      !(await api("/admin/quests")).body.seasons.some(
        (i) => i.id === season.body.season.id,
      ),
    );
    const id = "ui-character-" + width;
    assert.equal(
      (
        await api("/admin/tower/characters/" + id, "PUT", {
          data: { id, displayName: "UI 삭제 등장인물", sprites: {} },
        })
      ).status,
      200,
    );
    await page.goto(origin + "/admin/tower");
    await page
      .getByRole("navigation", { name: "타워 작업 공간" })
      .getByRole("button", { name: "등장인물", exact: true })
      .click();
    await page.getByRole("combobox", { name: "저장된 설정" }).selectOption(id);
    await page
      .getByRole("button", { name: "선택 항목 삭제", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "항목을 삭제했습니다" })
      .waitFor();
    assert.ok(
      !(await api("/admin/tower")).body.characters.some((i) => i.id === id),
    );
    await page.screenshot({
      path: `${out}/tower-item-deleted-${width}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    const v2id = "ui-v2-" + width;
    const v2 = await api("/admin/tower/seasons/" + v2id, "PUT", {
      active: false,
      data: {
        id: v2id,
        name: "UI 삭제 타워 초안",
        description: "",
        protagonistChampionId: "",
        bosses: {},
        synergyWeights: { deckTag: 2, supportTag: 3, championTag: 2 },
        v2: {
          schemaVersion: 2,
          enabled: false,
          visible: false,
          sortOrder: 0,
          rarityWeights: { NORMAL: 70, EPIC: 25, LEGENDARY: 5 },
          floors: [
            {
              id: "floor-ui-" + width,
              number: 1,
              type: "NORMAL",
              enemies: [],
              relicReward: false,
            },
          ],
          bosses: [],
        },
      },
    });
    assert.equal(v2.status, 200, JSON.stringify(v2));
    await page.goto(origin + "/admin/tower");
    await page
      .getByRole("combobox", { name: "V2 타워 선택" })
      .selectOption(v2id);
    await page
      .getByRole("button", { name: "타워 초안 삭제", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "타워 초안을 삭제했습니다" })
      .waitFor();
    assert.ok(
      !(await api("/admin/tower")).body.seasons.some(
        (season) => season.id === v2id,
      ),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    results.push({
      viewport: [width, height],
      notice: true,
      skin: true,
      cancel: true,
      product: true,
      questSeason: true,
      towerCharacter: true,
      towerV2Draft: true,
      errors,
    });
    console.log("PASS administrator deletion UI", width, height);
    await ctx.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
