/** Actual React routes and controls; authenticated HTTP data isolated by Playwright. No live writes. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
const out = "qa-results/product-experience";
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width <= 390,
      hasTouch: width <= 390,
      reducedMotion: "reduce",
    });
    const p = await context.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await auditSetup(p);
    let journal = { wishes: [], matches: [], removedWishes: [] };
    await p.route("**/api/player-journal/sync", (r) =>
      r.fulfill({ json: { document: journal } }),
    );
    for (const route of [
      "/",
      "/online",
      "/decks",
      "/collection",
      "/shop",
      "/packs",
      "/daily-quests",
      "/attendance",
      "/cosmetics",
      "/draft",
      "/settings",
      "/player-notebook",
    ]) {
      await p.goto("http://127.0.0.1:5186" + route);
      if (route === "/")
        await p.getByText("출전 검증 덱", { exact: true }).waitFor();
      if (route === "/decks") {
        await p.getByTestId("grid-card-collection").waitFor();
        assert.equal(
          await p
            .getByTestId("grid-card-collection")
            .locator(":scope > *")
            .count(),
          18,
        );
        assert.equal(
          await p.locator(".ko-catalog-filter-disclosure").getAttribute("open"),
          null,
        );
        await p
          .getByRole("navigation", { name: "카드 목록 페이지" })
          .getByRole("button", { name: "다음", exact: true })
          .click();
        await p.getByRole("status").filter({ hasText: "2 /" }).waitFor();
        if (width <= 1100) {
          await p
            .getByRole("button", { name: "현재 덱 · 25/25", exact: true })
            .click();
          await p.getByTestId("button-save-deck").waitFor({ state: "visible" });
          assert.equal(
            await p.getByTestId("grid-card-collection").isVisible(),
            false,
          );
          await p
            .getByRole("button", { name: "카드 찾기", exact: true })
            .click();
        }
        await p.locator(".ko-catalog-filter-disclosure summary").click();
        await p.getByLabel("등급", { exact: true }).selectOption("LEGENDARY");
        await p.waitForTimeout(100);
        assert.ok(
          (await p
            .getByTestId("grid-card-collection")
            .locator(":scope > *")
            .count()) <= 18,
        );
        if (width <= 390) {
          await p
            .getByRole("button", { name: "현재 덱 · 25/25", exact: true })
            .tap();
          await p.locator(".ko-decks__compact-remove").first().tap();
          await p
            .getByRole("button", { name: "현재 덱 · 24/25", exact: true })
            .waitFor();
          await p.getByRole("button", { name: "카드 찾기", exact: true }).tap();
          await p
            .locator('.ko-decks__card-action[aria-disabled="false"]')
            .first()
            .tap();
          await p
            .getByRole("button", { name: "현재 덱 · 25/25", exact: true })
            .waitFor();
        }
      }
      if (route === "/collection") {
        await p.getByRole("button", { name: /초과 카드 일괄 분해/ }).waitFor();
        assert.equal(
          await p.locator(".ko-catalog-filter-disclosure").getAttribute("open"),
          null,
        );
      }
      if (route === "/online")
        await p
          .getByRole("heading", { name: "대전 모드", exact: true })
          .waitFor();
      if (route === "/packs")
        await p
          .getByRole("heading", { name: "KO 카드팩", exact: true })
          .waitFor();
      if (route === "/daily-quests")
        await p
          .getByText("링 위의 첫 승리", { exact: false })
          .first()
          .waitFor();
      if (route === "/attendance")
        await p
          .getByRole("button", { name: "오늘 출석하고 보상 받기", exact: true })
          .waitFor();
      if (route === "/cosmetics")
        await p
          .getByRole("heading", { name: /꾸미기/ })
          .first()
          .waitFor();
      if (route === "/draft")
        await p
          .getByRole("button", { name: "AI 드래프트 시작", exact: true })
          .waitFor();
      if (route === "/shop")
        await p
          .getByRole("heading", { name: "KO 카드팩", exact: true })
          .waitFor();
      if (route === "/settings") {
        await p
          .getByRole("button", { name: "움직임 최소화", exact: true })
          .click();
        assert.equal(
          await p
            .getByRole("checkbox", { name: "모션 감소", exact: true })
            .first()
            .isChecked(),
          true,
        );
        await p.getByRole("button", { name: "강한 타격", exact: true }).click();
        await p.getByRole("button", { name: "계정", exact: true }).click();
        await p.getByLabel("현재 비밀번호", { exact: true }).waitFor();
      }
      if (route === "/player-notebook")
        await p.getByText(/계정 동기화 완료/).waitFor();
      await p.waitForTimeout(150);
      await p.screenshot({
        path: `${out}/${route === "/" ? "home" : route.slice(1)}-${width}.png`,
        fullPage: false,
      });
      const geometry = await p.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        scrollHeight: document.documentElement.scrollHeight,
      }));
      assert.equal(geometry.overflow, false, route + " overflow " + width);
      results.push({ width, height, route, ...geometry });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  // A guest starts the real practice engine, without a real or synthetic authenticated session.
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      recordVideo: { dir: out, size: { width: 390, height: 844 } },
    }),
    p = await context.newPage();
  await auditSetup(p);
  const writes = [];
  await p.route("**/api/**", async (r, next) => {
    const url = new URL(r.request().url());
    if (r.request().method() !== "GET") {
      writes.push(url.pathname);
      return r.fulfill({ status: 503, json: { message: "QA blocks writes" } });
    }
    if (url.pathname.endsWith("/auth/me"))
      return r.fulfill({ json: { authenticated: false, user: null } });
    if (url.pathname.endsWith("/cards"))
      return r.fulfill({ json: { cards: [] } });
    if (url.pathname.endsWith("/champions"))
      return r.fulfill({ json: { champions: [] } });
    return r.fallback();
  });
  await p.goto("http://127.0.0.1:5186/");
  await p.getByRole("link", { name: /로그인 없이 직접 배워보기/ }).click();
  await p.getByTestId("lesson-basics").waitFor();
  assert.equal(await p.getByTestId("lesson-basics").isEnabled(), true);
  await p.getByText(/검증된 연습용 카드 구성/).waitFor();
  await p.screenshot({ path: out + "/guest-practice-menu.png" });
  await p.getByTestId("lesson-basics").click();
  await p.getByRole("button", { name: "직접 해보기", exact: true }).click();
  await p.getByRole("button", { name: "그대로 시작", exact: true }).click();
  await p.locator('[data-goal="summon"]').waitFor();
  await p.locator(".ko-hand-card").first().click();
  await p.locator(".ko-player-board-row .ko-board-slot").first().click();
  await p.locator('[data-goal="turn"]').waitFor();
  await p.screenshot({ path: out + "/guest-real-summon.png" });
  assert.deepEqual(writes, []);
  results.push({ guestPractice: true, realSummon: true, writes });
  const video = p.video();
  await context.close();
  if (video) await video.saveAs(out + "/guest-practice.webm");
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
