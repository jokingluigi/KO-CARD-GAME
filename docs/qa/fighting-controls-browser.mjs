import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT);
const browser = await chromium.launch({
  channel: process.env.KO_QA_CHROME_CHANNEL ?? "chrome",
  headless: true,
});
const results = [];
fs.mkdirSync("qa-results/fighting", { recursive: true });
try {
  for (const [width, height] of [
    [360, 740],
    [375, 812],
    [390, 844],
    [412, 915],
    [1440, 900],
  ]) {
    const mobile = width < 500,
      ctx = await browser.newContext({
        viewport: { width, height },
        isMobile: mobile,
        hasTouch: mobile,
      }),
      page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (r) =>
      r.fulfill({ json: { cards: [], frames: [] } }),
    );
    await page.goto(
      (process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5174") +
        "/qa/champion-features.html",
    );
    await page.getByTestId("state-json").waitFor({ state: "attached" });
    await page
      .getByTestId("state-json")
      .evaluate((e) => (e.parentElement.style.display = "none"));
    const setup = async () => {
      await page.evaluate(async () => {
        const { createInitialGameState, generateCardInstance } =
          await import("/src/game/index.ts");
        const d = {
          id: "drag-card",
          name: "Drag Fighter",
          cardType: "WRESTLER",
          cost: 1,
          attack: 3,
          health: 8,
          rulesText: "",
          keywords: [],
          abilities: [],
          rarity: "NORMAL",
        };
        const s = createInitialGameState(undefined, [d]);
        s.status = "IN_PROGRESS";
        s.turn = 3;
        s.activePlayerId = s.players[0].id;
        s.events = [];
        for (const p of s.players) {
          p.currentGold = 6;
          p.board = [null, null, null, null];
          p.hand = [];
          p.champion.quest = null;
        }
        s.players[0].hand = Array.from({ length: 5 }, (_, i) =>
          generateCardInstance(d, { instanceId: "drag-" + i }),
        );
        s.players[0].board[0] = {
          ...generateCardInstance(d, { instanceId: "blocker" }),
          boardSlot: 0,
          enteredThisTurn: false,
        };
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: { state: s, definitions: [d] },
          }),
        );
      });
      await page.waitForTimeout(150);
    };
    const state = async () =>
      JSON.parse(await page.getByTestId("state-json").textContent());
    const cdp = mobile ? await ctx.newCDPSession(page) : null;
    const drag = async (end, cancel = false) => {
      const card = page.locator(".ko-player-hand .ko-hand-card").first();
      await card.scrollIntoViewIfNeeded();
      if (end.boundingBox) {
        const r = await end.boundingBox();
        end = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      const r = await card.boundingBox();
      const start = { x: r.x + r.width * 0.5, y: r.y + r.height * 0.42 };
      if (cdp)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ ...start, id: 1 }],
        });
      else {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
      }
      for (let i = 1; i <= 14; i++) {
        const p = {
          x: start.x + ((end.x - start.x) * i) / 14,
          y: start.y + ((end.y - start.y) * i) / 14,
        };
        if (cdp)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ ...p, id: 1 }],
          });
        else await page.mouse.move(p.x, p.y);
        await page.waitForTimeout(20);
      }
      assert.equal(
        await page.locator(".ko-card-drag-ghost").count(),
        1,
        "drag follows real pointer",
      );
      assert.ok(
        Number(
          await page
            .locator(".ko-card-drag-ghost")
            .evaluate((n) => getComputedStyle(n).opacity),
        ) > 0.8,
        "dragged card is visible",
      );
      if (cancel) await page.keyboard.press("Escape");
      if (cdp)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      else await page.mouse.up();
      await page.waitForTimeout(450);
      assert.equal(await page.locator(".ko-card-drag-ghost").count(), 0);
    };
    await setup();
    const slot = page.locator(".ko-player-board-row .ko-board-slot").nth(2);
    await drag(slot);
    assert.equal(
      (await state()).players[0].board[2]?.definitionId,
      "drag-card",
    );
    assert.equal((await state()).players[0].currentGold, 5);
    assert.equal((await state()).players[0].hand.length, 4);
    await setup();
    const before = await state();
    await drag({ x: width / 2, y: 60 });
    assert.deepEqual(
      await state(),
      before,
      "invalid drop leaves all gameplay unchanged",
    );
    await setup();
    await drag(slot, true);
    assert.deepEqual(
      await state(),
      before,
      "cancel leaves all gameplay unchanged",
    );
    assert.equal(
      await page.locator(".ko-hand-card--selected").count(),
      0,
      "cancel clears selected card",
    );
    await page.getByRole("button", { name: "설정 열기" }).click();
    await page.getByLabel("타격 연출 강도").selectOption("EXTREME");
    await page.getByLabel("그래픽 품질").selectOption("LOW");
    await page.getByLabel("모션 감소", { exact: true }).check();
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("ko-combat-presentation-v1")),
      ),
      { quality: "LOW", intensity: "EXTREME", reducedMotion: true },
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.screenshot({
      path: "qa-results/fighting/controls-" + width + ".png",
    });
    assert.deepEqual(errors, []);
    results.push({
      width,
      drag: true,
      invalid: true,
      cancel: true,
      settings: true,
    });
    await ctx.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
