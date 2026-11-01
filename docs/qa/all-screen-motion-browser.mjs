/** Real routes with isolated account/shop/reward responses; never production purchases. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/all-screen-motion";
await mkdir(out, { recursive: true });
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height, reduced] of [
    [390, 844, false],
    [1440, 900, false],
    [740, 360, true],
  ]) {
    const p = await b.newPage({
        viewport: { width, height },
        reducedMotion: reduced ? "reduce" : "no-preference",
        recordVideo: {
          dir: out + "/video",
          size: { width: Math.min(width, 1440), height },
        },
      }),
      errors = [],
      writes = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.resolve();
      HTMLMediaElement.prototype.pause = () => {};
    });
    const art =
        "/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
      card = {
        id: "m-card",
        name: "모션 검증 선수",
        cardType: "WRESTLER",
        rarity: "NORMAL",
        text: "효과 없음",
        cost: 1,
        attack: 2,
        health: 3,
        status: "PUBLISHED",
        quantity: 1,
        imageUrl: art,
      },
      hero = { id: "m-hero", name: "모션 검증 챔피언", imageUrl: art };
    const skin = {
      id: "m-skin",
      type: "CHAMPION_SKIN",
      targetId: hero.id,
      name: "모션 검증 스킨",
      description: "테스트 전용",
      imageAssets: { art },
      isActive: true,
      sortOrder: 0,
    };
    let loadout = { version: 1, skins: {}, emotes: [], cardBack: null };
    const pack = {
      id: "m-pack",
      name: "모션 검증 팩",
      description: "테스트용",
      cardsPerPack: 1,
      normalRate: 100,
      epicRate: 0,
      legendaryRate: 0,
      championRate: 0,
      skinChance: 0,
      emoteRate: 0,
      imageUrl: null,
      quantity: 1,
    };
    const quest = {
      id: "m-quest",
      title: "모션 검증 퀘스트",
      description: "이미 달성한 테스트 조건",
      assignmentDate: "2026-11-01",
      slot: 0,
      objectiveType: "PLAY_MATCH",
      targetValue: 1,
      progress: 1,
      status: "COMPLETED",
      rewardType: "CURRENCY",
      rewardAmount: 100,
      rewardTargetId: null,
    };
    const attendance = {
      today: "2026-11-01",
      nextDayIndex: 1,
      definitions: [
        {
          dayIndex: 1,
          rewardType: "CURRENCY",
          rewardAmount: 100,
          rewardTargetId: null,
          enabled: true,
          state: "AVAILABLE",
        },
      ],
      claims: [],
    };
    let balance = 1000,
      releasePurchase = null,
      failNextPurchase = true;
    await p.route("**/api/**", async (r) => {
      const req = r.request(),
        path = new URL(req.url()).pathname;
      let json = {};
      if (req.method() !== "GET") writes.push(path);
      if (path.endsWith("/auth/me"))
        json = {
          authenticated: true,
          user: {
            id: "motion-user",
            nickname: "모션 검증",
            role: "USER",
            currencyBalance: balance,
            prismBalance: 0,
            championPrismBalance: 0,
          },
        };
      else if (path.endsWith("/server-status"))
        json = { enabled: false, allowed: true };
      else if (path.endsWith("/main-content"))
        json = {
          notices: [],
          background: { id: "qa", assetUrl: art },
          bgm: null,
        };
      else if (path.endsWith("/availability")) json = { enabled: true };
      else if (path.endsWith("/online-matches/ws-ticket"))
        return r.fulfill({
          status: 503,
          json: { message: "isolated fixture" },
        });
      else if (path === "/api/cosmetics")
        json = {
          owned: [{ item: skin }],
          loadout,
          cards: [card],
          champions: [hero],
        };
      else if (path === "/api/cosmetics/equipment") {
        loadout = { ...loadout, skins: { ["champion:" + hero.id]: skin } };
        json = { loadout };
      } else if (path === "/api/shop")
        json = {
          currencyBalance: balance,
          currencyDisplayName: "크레딧",
          isTestAccount: false,
          listings: [
            {
              id: "m-listing",
              name: "모션 상품",
              description: "테스트용",
              price: 100,
              packQuantity: 1,
              ownedQuantity: 1,
              pack,
            },
          ],
        };
      else if (path === "/api/shop/m-listing/purchase") {
        if (failNextPurchase) {
          failNextPurchase = false;
          return r.fulfill({
            status: 503,
            json: { message: "검증용 일시 오류" },
          });
        }
        await new Promise((resolve) => (releasePurchase = resolve));
        balance = 900;
        json = {
          currencyBalance: balance,
          packQuantity: 1,
          ownedQuantity: 2,
          pack,
        };
      } else if (path === "/api/daily-quests")
        json = { assignments: [quest], seasons: [], completionBonus: null };
      else if (path === "/api/daily-quests/m-quest/claim") {
        quest.status = "CLAIMED";
        balance += 100;
        json = {
          assignment: quest,
          reward: { amount: 100, balanceAfter: balance },
          alreadyClaimed: false,
        };
      } else if (path === "/api/attendance") json = attendance;
      else if (path === "/api/attendance/claim") {
        attendance.definitions[0].state = "CLAIMED";
        balance += 100;
        json = {
          attendance,
          reward: { amount: 100, balanceAfter: balance },
          alreadyClaimed: false,
        };
      } else if (path === "/api/packs") json = { packs: [pack] };
      else if (path === "/api/packs/m-pack/open") {
        pack.quantity = 0;
        json = {
          rewards: [
            {
              rewardType: "NORMAL_CARD",
              cardDefinitionId: card.id,
              card,
              alreadyOwned: true,
            },
          ],
        };
      } else if (path === "/api/collection")
        json = {
          cards: [card],
          craftableCards: [card],
          champions: [],
          prismBalance: 1000,
          championPrismBalance: 0,
          prismSettings: [],
          championPrismSetting: { configured: false },
        };
      else if (path.endsWith("/cards")) json = { cards: [card] };
      else if (path.endsWith("/champions")) json = { champions: [hero] };
      else if (path.endsWith("/decks")) json = { decks: [] };
      else if (path.endsWith("/card-frames")) json = { frames: [] };
      else if (path.endsWith("/active")) json = { match: null };
      await r.fulfill({ json });
    });
    await p.goto("http://127.0.0.1:5186/cosmetics");
    await p.getByRole("button", { name: "장착", exact: true }).waitFor();
    await p.waitForFunction(
      () => document.querySelector("h1")?.dataset.uiMotionPlayed,
    );
    await p.getByRole("button", { name: "장착", exact: true }).click();
    await p.getByText("장착 중", { exact: true }).waitFor();
    await p.waitForFunction(
      () => document.querySelector(".cosmetics-item")?.dataset.uiMotionPlayed,
    );
    await p.screenshot({ path: `${out}/skin-${width}.png`, fullPage: true });
    await p
      .getByRole("navigation", { name: "게임 화면 이동" })
      .getByRole("link", { name: "상점", exact: true })
      .click();
    await p.getByRole("button", { name: /1묶음 구매/ }).click();
    const confirmation = p.getByRole("dialog", { name: "구매 확인" });
    await confirmation.waitFor();
    assert.equal(writes.filter((x) => x.includes("/purchase")).length, 0);
    await confirmation
      .getByRole("button", { name: "취소", exact: true })
      .click();
    await confirmation.waitFor({ state: "detached" });
    assert.match(
      await p.evaluate(() => document.activeElement?.textContent),
      /1묶음 구매/,
    );
    assert.equal(writes.filter((x) => x.includes("/purchase")).length, 0);
    await p.getByRole("button", { name: /1묶음 구매/ }).click();
    await confirmation
      .getByRole("button", { name: "구매 확정", exact: true })
      .click();
    await confirmation
      .getByRole("alert")
      .filter({ hasText: "검증용 일시 오류" })
      .waitFor();
    assert.equal(await p.locator(".collection-action").count(), 0);
    await confirmation
      .getByRole("button", { name: "구매 확정", exact: true })
      .click();
    await confirmation
      .getByRole("button", { name: "구매 확인 중…", exact: true })
      .waitFor();
    assert.equal(
      await confirmation
        .getByRole("button", { name: "구매 확인 중…" })
        .isDisabled(),
      true,
    );
    releasePurchase();
    await p.locator(".collection-action").waitFor();
    assert.equal(
      await confirmation.count(),
      0,
      "receipt must not overlap closing confirmation",
    );
    await p.screenshot({
      path: `${out}/purchase-${width}.png`,
      fullPage: true,
    });
    await p
      .locator(".collection-action")
      .getByRole("button", { name: "계속", exact: true })
      .click();
    assert.equal(writes.filter((x) => x.includes("/purchase")).length, 2);
    await p.goto("http://127.0.0.1:5186/daily-quests");
    await p.getByRole("button", { name: "보상 받기", exact: true }).click();
    await p.locator("[data-ui-balance]").filter({ hasText: "1,000" }).waitFor();
    await p.locator(".collection-action").waitFor({ state: "detached" });
    if (height > 500)
      await p.waitForFunction(
        () =>
          document.querySelector("[data-ui-balance]")?.dataset.uiMotionPlayed,
      );
    await p.locator("[data-ui-balance]").scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${out}/quest-${width}.png`, fullPage: true });
    await p.goto("http://127.0.0.1:5186/attendance");
    await p
      .getByRole("button", { name: "오늘 출석하고 보상 받기", exact: true })
      .click();
    await p.locator("[data-ui-balance]").filter({ hasText: "1,100" }).waitFor();
    await p.locator(".collection-action").waitFor({ state: "detached" });
    await p.goto("http://127.0.0.1:5186/packs");
    await p.getByTestId("button-open-pack-m-pack").click();
    await p.getByTestId("button-unseal-pack").click();
    await p.getByTestId("button-reveal-reward-0").click();
    await p.screenshot({ path: `${out}/pack-${width}.png`, fullPage: true });
    await p.getByTestId("button-close-pack-opening").click();
    await p.goto("http://127.0.0.1:5186/player-notebook");
    await p.getByRole("heading", { name: "내 전적 · 수집 목표" }).waitFor();
    await p.waitForFunction(
      () => document.querySelector("h1")?.dataset.uiMotionPlayed,
    );
    assert.equal(
      await p.evaluate(() => document.documentElement.dataset.uiReduced),
      String(reduced),
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      reduced,
      routeAndNavMotion: true,
      equipMotion: true,
      purchaseCancelNoWrite: true,
      purchasePendingNoDuplicate: true,
      purchaseFailureThenRetry: true,
      cancelFocusReturned: true,
      noDialogReceiptOverlap: true,
      actualReceiptBalance: true,
      questAndAttendance: true,
      packReveal: true,
      notebookEntry: true,
      errors,
    });
    await p.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
