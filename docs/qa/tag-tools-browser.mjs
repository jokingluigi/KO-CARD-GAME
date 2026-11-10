/** Actual admin UI and real HTTP routes, all writes confined to disposable PGlite. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
const out = "docs/qa/20261110-catalog-tags";
await mkdir(out, { recursive: true });
const f = await startTutorialFixture(),
  browser = await chromium.launch({ headless: true }),
  results = [];
try {
  await f.db
    .insert(f.schema.cardsTable)
    .values(
      Array.from({ length: 12 }, (_, i) => ({
        id: "tag-ui-" + i,
        name: `편의 선수 ${String(i).padStart(2, "0")}`,
        text: "검증용",
        cardType: "WRESTLER",
        rarity: i % 2 ? "NORMAL" : "EPIC",
        cost: i % 7,
        attack: 2,
        health: 3,
        tags: i % 3 === 0 ? ["기존", "다른"] : ["다른"],
        status: i % 2 ? "PUBLISHED" : "DRAFT",
      })),
    );
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
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (!path.startsWith("/api/admin/tags") && path !== "/api/card-tags")
        return route.fulfill({ json: {} });
      const r = await fetch(f.origin + path, {
        method: req.method(),
        headers: { Cookie: f.cookie, "Content-Type": "application/json" },
        ...(req.postData() ? { body: req.postData() } : {}),
      });
      await route.fulfill({
        status: r.status,
        body: await r.text(),
        contentType: "application/json",
      });
    });
    await page.goto(
      "http://127.0.0.1:5186/qa/champion-features.html?admin=tags",
    );
    await page.getByTestId("admin-tag-manager").waitFor();
    await page.getByRole("button", { name: /^기존 \d+장$/ }).click();
    await page.getByLabel("태그 이름 변경").fill("새 태그 " + width);
    await page.getByRole("button", { name: "이름 저장", exact: true }).click();
    await page
      .getByRole("heading", { name: "새 태그 " + width, exact: true })
      .waitFor();
    await page.reload();
    await page
      .getByRole("heading", { name: "새 태그 " + width, exact: true })
      .waitFor();
    await page.getByLabel("태그 연결 필터").selectOption("AVAILABLE");
    await page.getByLabel("선수 공개 상태").selectOption("DRAFT");
    await page.getByLabel("선수 카드 검색").fill("편의 선수");
    await page.getByRole("button", { name: /검색 결과 모두 선택/ }).click();
    const selected = await page
      .getByRole("checkbox", { checked: true })
      .count();
    assert.ok(selected > 0);
    await page.getByLabel("선수 카드 검색").fill("11");
    assert.equal(
      await page.getByRole("checkbox", { checked: true }).count(),
      0,
    );
    await page
      .getByRole("button", { name: "선택 카드 연결", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "연결했습니다" })
      .waitFor();
    await page
      .getByRole("button", { name: "검색·필터 초기화", exact: true })
      .click();
    await page.getByLabel("태그 연결 필터").selectOption("ATTACHED");
    const connected = await page.getByRole("checkbox").count();
    assert.ok(connected >= selected);
    await page.getByRole("button", { name: /검색 결과 모두 선택/ }).click();
    await page
      .getByRole("button", { name: "선택 카드에서 해제", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "해제했습니다" })
      .waitFor();
    await page.getByLabel("태그 연결 필터").selectOption("ALL");
    await page
      .getByRole("button", { name: "편의 선수 01 태그 연결", exact: true })
      .click();
    await page
      .getByRole("button", { name: "편의 선수 01 태그 해제", exact: true })
      .waitFor();
    await page.screenshot({
      path: `${out}/tag-tools-${width}x${height}.png`,
      fullPage: true,
    });
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
      realAdminHTTP: true,
      rename: true,
      saveReload: true,
      combinedFilters: true,
      selectionSurvivesSearch: true,
      bulkAttach: true,
      bulkDetach: true,
      individualToggle: true,
      errors,
    });
    // Restore fixture membership for the next viewport without touching production.
    await fetch(
      f.origin + "/api/admin/tags/" + encodeURIComponent("기존") + "/cards",
      {
        method: "PATCH",
        headers: { Cookie: f.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          cardIds: Array.from({ length: 12 }, (_, i) => "tag-ui-" + i),
          attached: false,
        }),
      },
    );
    await fetch(
      f.origin + "/api/admin/tags/" + encodeURIComponent("기존") + "/cards",
      {
        method: "PATCH",
        headers: { Cookie: f.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          cardIds: ["tag-ui-0", "tag-ui-3", "tag-ui-6", "tag-ui-9"],
          attached: true,
        }),
      },
    );
    await fetch(f.origin + "/api/admin/tags/" + encodeURIComponent("기존"), {
      method: "PATCH",
      headers: { Cookie: f.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "기존" }),
    });
    await context.close();
  }
} finally {
  await browser.close();
  await f.close();
}
await writeFile(out + "/tag-browser.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
