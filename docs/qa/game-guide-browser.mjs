/** Real help route and existing actual test-match UI; all API responses isolated. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
const out = "qa-results/game-guide";
await mkdir(out, { recursive: true });
const b = await chromium.launch(),
  results = [];
const pinned = JSON.parse(
    await readFile("artifacts/ko-game/public/tutorial-catalog.json", "utf8"),
  ),
  token = pinned.cards.find(
    (c) => c.rarity === "CHAMPION" && c.isChampionToken,
  );
try {
  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const p = await b.newPage({
        viewport: { width, height },
        isMobile: width <= 390,
        hasTouch: width <= 390,
        reducedMotion: "reduce",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await auditSetup(p);
    await p.route("**/api/auth/me", (r) =>
      r.fulfill({ json: { authenticated: false, user: null } }),
    );
    await p.goto("http://127.0.0.1:5186/guide");
    await p
      .getByRole("heading", { name: "게임 도움말", exact: true })
      .waitFor();
    await p
      .getByRole("searchbox", { name: "궁금한 규칙 찾기" })
      .fill("침묵면역");
    await p
      .getByText("침묵 면역은 파괴·소멸·기절·피해까지 막는 보호가 아닙니다.", {
        exact: false,
      })
      .waitFor();
    assert.equal(await p.locator(".ko-guide-entries details").count(), 1);
    assert.ok(
      await p.locator(".ko-guide-entries details").evaluate((n) => n.open),
    );
    await p.screenshot({ path: `${out}/immunity-search-${width}.png` });
    await p.getByRole("button", { name: "시작 · 덱", exact: true }).click();
    await p
      .getByRole("heading", { name: "맞는 안내를 찾지 못했어요.", exact: true })
      .waitFor();
    await p
      .getByRole("button", { name: "전체 안내 보기", exact: true })
      .click();
    await p.getByRole("button", { name: "키워드", exact: true }).click();
    await p.getByText("러쉬", { exact: true }).first().click();
    await p
      .getByText("등장한 턴에도 선수 또는 상대 챔피언을 공격할 수 있습니다.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await p.screenshot({ path: `${out}/keywords-${width}.png` });
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      publicGuide: true,
      search: true,
      categories: true,
      emptyStateRecovery: true,
      noOverflow: true,
    });
    await p.close();
  }
  // Use the real existing admin card-test flow to deploy a published champion token.
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const p = await b.newPage({
        viewport: { width, height },
        isMobile: width === 390,
        hasTouch: width === 390,
        reducedMotion: "reduce",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await auditSetup(p);
    await p.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: {
          authenticated: true,
          user: {
            id: "guide-admin",
            nickname: "가이드 검증",
            role: "ADMIN",
            currencyBalance: 0,
            prismBalance: 0,
            championPrismBalance: 0,
          },
        },
      }),
    );
    await p.route("**/api/admin/cards/*/test", (r) =>
      r.fulfill({ json: { card: token, relatedCards: pinned.cards } }),
    );
    await p.goto(
      "http://127.0.0.1:5186/?testCardId=" + token.id + "&source=admin",
    );
    await p.locator(".ko-game-shell").waitFor();
    const opening = p.getByRole("button", { name: "그대로 시작", exact: true });
    if (await opening.isVisible()) await opening.click();
    const field = p.locator(".ko-player-board-row .ko-board-slot").first();
    await field.getByText("침묵 면역", { exact: true }).waitFor();
    await p.screenshot({ path: `${out}/battle-badge-${width}.png` });
    // The explicit information control opens the existing inspector.
    const info = p.getByRole("button", {
      name: token.name + " 상세정보",
      exact: true,
    });
    await info.click();
    await p.getByTestId("silence-immunity-notice").waitFor();
    await p
      .getByText("챔피언 등급 토큰 선수의 고유 규칙입니다.", { exact: false })
      .waitFor();
    await p.getByTestId("silence-immunity-notice").scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${out}/battle-inspector-${width}.png` });
    await p.getByRole("button", { name: "상세정보 닫기", exact: true }).click();
    await p.getByRole("button", { name: "설정 열기", exact: true }).click();
    await p
      .getByRole("button", { name: "게임 도움말 · 규칙 찾기", exact: true })
      .click();
    const guide = p.getByRole("dialog");
    await guide
      .getByText(
        "온라인 대전은 도움말을 읽는 동안에도 턴 시간이 계속 흘러요.",
        { exact: true },
      )
      .waitFor();
    await guide
      .getByRole("searchbox", { name: "궁금한 규칙 찾기" })
      .fill("액티브");
    await guide
      .getByText("액티브는 매 턴 한 번인가요?", { exact: true })
      .waitFor();
    await p.screenshot({ path: `${out}/battle-guide-${width}.png` });
    await guide
      .getByRole("button", { name: "도움말 닫기", exact: true })
      .click();
    await p.getByRole("button", { name: "설정 닫기", exact: true }).click();
    assert.ok(await field.isVisible());
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      actualExistingMatch: true,
      tokenBadge: true,
      inspectorRule: true,
      inBattleGuide: true,
      returnsToMatch: true,
    });
    await p.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
