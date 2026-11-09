import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const origin = process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5186";
const baseline = process.env.KO_SPELL_BASELINE === "1";
const out = "qa-results/stable-spell-use";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of baseline
    ? [[390, 844]]
    : [
        [360, 740],
        [390, 844],
        [844, 390],
        [1440, 900],
      ]) {
    const touch = width !== 1440;
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (route) =>
      route.fulfill({ json: { cards: [], champions: [], frames: [] } }),
    );
    await page.goto(origin + "/qa/champion-features.html");
    await page.getByTestId("board-check").waitFor();
    await page
      .getByTestId("board-check")
      .evaluate((e) => (e.parentElement.style.display = "none"));
    const cdp = touch ? await context.newCDPSession(page) : null;
    async function load(mode = "normal", many = false) {
      await page.evaluate(
        async ({ mode, many }) => {
          const { createInitialGameState, generateCardInstance } =
            await import("/src/game/index.ts");
          const unit = {
            id: "use-qa-unit",
            name: "검증 선수",
            cardType: "WRESTLER",
            cost: 1,
            attack: 1,
            health: 8,
            keywords: [],
            rulesText: "",
            abilities: [],
          };
          const spell = {
            ...unit,
            id: "use-qa-spell",
            name: "사용 버튼 검증 주문",
            cardType: "TECHNIQUE",
            attack: 0,
            health: 0,
            rulesText: "상대 챔피언에게 2 피해",
            abilities: [
              {
                trigger: "ACTIVE",
                effects: [
                  mode === "target"
                    ? {
                        type: "STRUCTURED",
                        action: "DAMAGE",
                        target: {
                          zone: "BOARD",
                          owner: "ENEMY",
                          selection: "PLAYER_CHOICE",
                          count: 1,
                        },
                        values: { amount: 2 },
                      }
                    : { type: "DAMAGE_OPPONENT_CHAMPION", amount: 2 },
                ],
              },
            ],
          };
          const state = createInitialGameState(undefined, [spell, unit]);
          state.gameId = "spell-use:" + crypto.randomUUID();
          state.status = "IN_PROGRESS";
          state.turn = 3;
          state.activePlayerId = mode === "opponent" ? "player-2" : "player-1";
          state.events = [];
          state.cardPool = [spell, unit];
          for (const p of state.players) {
            p.hand = [];
            p.deck = [];
            p.board = [null, null, null, null];
            p.currentGold = mode === "poor" ? 0 : 6;
            p.health = 20;
            p.champion.health = 20;
            p.champion.quest = null;
          }
          state.players[0].hand = many
            ? Array.from({ length: 7 }, (_, i) =>
                generateCardInstance(i === 1 ? spell : unit, {
                  instanceId: "use-" + i,
                }),
              )
            : [generateCardInstance(spell, { instanceId: "use-spell" })];
          state.players[1].board[0] = {
            ...generateCardInstance(unit, { instanceId: "enemy-target" }),
            boardSlot: 0,
            enteredThisTurn: false,
            entryDefenseActive: false,
          };
          window.dispatchEvent(
            new CustomEvent("ko-qa-load-state", {
              detail: { state, definitions: [spell, unit] },
            }),
          );
        },
        { mode, many },
      );
      await page.waitForTimeout(100);
    }
    const state = async () =>
      JSON.parse(await page.getByTestId("state-json").textContent());
    const hand = () =>
      page
        .locator('.ko-player-hand [data-card-definition="use-qa-spell"]')
        .first();
    const use = () => page.getByRole("button", { name: "사용", exact: true });
    async function select() {
      await hand().focus();
      await page.keyboard.press("Enter");
      await use().waitFor();
    }
    async function pressWithSlop(dx = 3, dy = 15) {
      const box = await use().boundingBox();
      const p = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
      if (cdp) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [p],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: p.x + dx, y: p.y + dy }],
        });
      } else {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.move(p.x + dx, p.y + dy, { steps: 3 });
      }
      const ghosts = await page.locator(".ko-card-drag-ghost").count();
      if (baseline) await page.screenshot({ path: out + "/before-touch.png" });
      if (cdp)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      else await page.mouse.up();
      await page.waitForTimeout(120);
      return ghosts;
    }
    await load();
    await select();
    const ghosts = await pressWithSlop();
    if (baseline) {
      results.push({
        width,
        height,
        ghostsWhilePressingUse: ghosts,
        handAfterPress: (await state()).players[0].hand.length,
        healthAfterPress: (await state()).players[1].health,
      });
      await context.close();
      continue;
    }
    assert.equal(ghosts, 0, "Use must never start a card drag");
    assert.equal((await state()).players[1].health, 18);
    assert.equal((await state()).players[0].hand.length, 0);
    assert.equal((await state()).players[0].currentGold, 5);
    await load("normal", true);
    await select();
    const anchored = await use().evaluate((button) =>
      Boolean(button.closest(".ko-hand-cards")),
    );
    const anchorX = () =>
      use().evaluate(
        (button) =>
          button.closest(".ko-hand-cards > *")?.getBoundingClientRect().x ?? 0,
      );
    const first = await use().boundingBox(),
      beforeAnchor = await anchorX();
    await page
      .locator(".ko-player-hand")
      .evaluate((e, amount) => (e.scrollLeft = amount), anchored ? 20 : 150);
    await page.waitForTimeout(250);
    const next = await use().boundingBox(),
      afterAnchor = await anchorX();
    assert.ok(
      Math.abs(first.x - beforeAnchor - (next.x - afterAnchor)) < 1 &&
        Math.abs(first.y - next.y) < 1,
      "Use retains its layout anchor while hand scrolls",
    );
    assert.ok(next.width >= 44 && next.height >= 44);
    await page.screenshot({ path: `${out}/selected-${width}.png` });
    await use().click();
    assert.equal((await state()).players[1].health, 18);
    await load("target");
    await select();
    await use().click();
    await page.waitForFunction(
      () =>
        JSON.parse(
          document.querySelector("[data-testid=state-json]").textContent,
        ).targetingState?.active,
    );
    assert.equal((await state()).players[0].currentGold, 6);
    await page
      .locator('[data-card-instance-id="enemy-target"] [data-card-definition]')
      .click({ position: { x: 25, y: 65 } });
    assert.equal((await state()).players[1].board[0].currentHealth, 6);
    assert.equal((await state()).players[0].currentGold, 5);
    await load();
    await select();
    await use().focus();
    await page.keyboard.press("Enter");
    assert.equal((await state()).players[1].health, 18);
    assert.equal((await state()).players[0].currentGold, 5);
    if (cdp) {
      for (const cancel of [true, false]) {
        await load();
        await select();
        const r = await use().boundingBox();
        const a = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [a],
        });
        if (!cancel)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: a.x, y: a.y - 70 }],
          });
        await cdp.send("Input.dispatchTouchEvent", {
          type: cancel ? "touchCancel" : "touchEnd",
          touchPoints: [],
        });
        await page.waitForTimeout(100);
        assert.equal((await state()).players[1].health, 20);
        assert.equal((await state()).players[0].currentGold, 6);
        assert.equal(await page.locator(".ko-card-drag-ghost").count(), 0);
      }
    }
    for (const mode of ["poor", "opponent"]) {
      await load(mode);
      await hand().click({ position: { x: 25, y: 65 } });
      assert.equal(await use().count(), 0);
      assert.equal((await state()).players[0].hand.length, 1);
    }
    assert.deepEqual(errors, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    results.push({
      width,
      height,
      touch,
      buttonSlopCastsOnce: true,
      buttonDoesNotDrag: true,
      stableRelativeToLayoutAnchor: true,
      targetSelection: true,
      disabledTurnAndCost: true,
      errors,
    });
    await context.close();
  }
  await writeFile(
    out + (baseline ? "/baseline.json" : "/results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
