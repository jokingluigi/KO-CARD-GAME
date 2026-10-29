import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import("./black-gold-playwright.mjs");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.KO_QA_CHROMIUM_EXECUTABLE,
});
fs.mkdirSync("qa-results/field-size-input", { recursive: true });
const results = [];
try {
  for (const [width, height, touch] of [
    [360, 640, true],
    [360, 740, true],
    [375, 812, true],
    [390, 844, true],
    [412, 915, true],
    [844, 390, true],
    [1440, 900, false],
  ].filter(
    ([w]) =>
      !process.env.KO_FIELD_WIDTH || w === Number(process.env.KO_FIELD_WIDTH),
  )) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
      reducedMotion: "reduce",
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (route) => {
      assert.equal(route.request().method(), "GET");
      return route.fulfill({ json: { cards: [], champions: [], frames: [] } });
    });
    await page.route("https://fonts.googleapis.com/**", (route) =>
      route.abort(),
    );
    await page.goto(
      (process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5186") +
        "/qa/black-gold-board.html",
    );
    await page.getByTestId("state-json").waitFor({ state: "attached" });
    await page
      .locator("[data-preview-tools]")
      .evaluate((e) => (e.style.display = "none"));
    await page.screenshot({
      path: `qa-results/field-size-input/layout-${width}-${height}.png`,
    });
    const initialHand = await page
      .locator(".ko-hand-card")
      .first()
      .boundingBox();
    const cdp = touch ? await context.newCDPSession(page) : null;
    const load = async (mode = "normal") => {
      await page.evaluate(async (mode) => {
        const { createInitialGameState, generateCardInstance } =
          await import("/src/game/index.ts");
        const d = {
          id: "drag-player",
          name: "드래그 공격 선수",
          cost: 1,
          attack: 3,
          health: 10,
          cardType: "WRESTLER",
          rulesText: "기습, 수비: 검증 선수",
          keywords: [],
          abilities: [],
          isToken: false,
          isChampionToken: false,
        };
        const s = createInitialGameState(undefined, [d]);
        s.gameId = "field-input-" + crypto.randomUUID();
        s.status = "IN_PROGRESS";
        s.turn = 3;
        s.activePlayerId = "player-1";
        s.events = [];
        s.cardPool = [d];
        for (const [i, p] of s.players.entries()) {
          p.currentGold = 6;
          p.health = 20;
          p.hand = [];
          p.board = [null, null, null, null];
          p.deck = [generateCardInstance(d, { instanceId: "deck-" + i })];
          p.champion.quest = undefined;
          p.champion.health = 20;
          p.board[0] = {
            ...generateCardInstance(d, {
              instanceId: i ? "enemy" : "attacker",
            }),
            boardSlot: 0,
            enteredThisTurn: false,
            entryDefenseActive: false,
          };
        }
        if (mode === "taunt") {
          s.players[1].board[0].keywords = ["TAUNT"];
          s.players[1].board[1] = {
            ...generateCardInstance(d, { instanceId: "other-enemy" }),
            boardSlot: 1,
            enteredThisTurn: false,
          };
        }
        if (mode === "defense") {
          s.players[1].board[0].keywords = ["DEFENSE"];
          s.players[1].board[0].entryDefenseActive = true;
        }
        if (mode === "token") s.players[1].board[0].isChampionToken = true;
        if (mode === "cooldown") s.players[0].board[0].enteredThisTurn = true;
        if (mode === "opponent") s.activePlayerId = "player-2";
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: { state: s, definitions: [d] },
          }),
        );
      }, mode);
      await page.waitForTimeout(180);
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="preview-busy"]')
            ?.textContent === "false",
      );
    };
    const state = async () =>
      JSON.parse(await page.getByTestId("state-json").textContent());
    const own = () =>
      page.locator(".ko-player-board-row .ko-board-slot").first();
    const enemy = () =>
      page.locator(".ko-opponent-board-row .ko-board-slot").first();
    let sawAttackGhost = false;
    const drag = async (target, cancel = false) => {
      const from = await own().boundingBox();
      const to = await target.boundingBox();
      assert.ok(from && to);
      const start = {
          x:
            from.x +
            (process.env.KO_DRAG_CORNER ? from.width - 12 : from.width * 0.5),
          y: from.y + (process.env.KO_DRAG_CORNER ? 12 : from.height * 0.82),
        },
        end = { x: to.x + to.width * 0.5, y: to.y + to.height * 0.78 };
      if (touch) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [start],
        });
        for (let i = 1; i <= 8; i++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              {
                x: start.x + ((end.x - start.x) * i) / 8,
                y: start.y + ((end.y - start.y) * i) / 8,
              },
            ],
          });
          await page.waitForTimeout(20);
        }
        sawAttackGhost ||=
          (await page.locator(".ko-attack-drag-ghost").count()) > 0;
        await cdp.send("Input.dispatchTouchEvent", {
          type: cancel ? "touchCancel" : "touchEnd",
          touchPoints: [],
        });
      } else {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        sawAttackGhost ||=
          (await page.locator(".ko-attack-drag-ghost").count()) > 0;
        if (cancel) await page.keyboard.press("Escape");
        await page.mouse.up();
      }
      await page.waitForTimeout(250);
      assert.equal(
        await page.locator(".ko-attack-drag-ghost").count(),
        0,
        "drag ghost cleans up after commit/cancel",
      );
    };
    await load();
    const geometry = await page
      .evaluate(() => {
        const box = (s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return { width: r.width, height: r.height, x: r.x, y: r.y };
        };
        return {
          field: box(".ko-player-board-row .ko-board-slot"),
          hand: box(".ko-hand-card"),
          overflow:
            document.querySelector(".ko-game-shell").scrollHeight > innerHeight,
        };
      })
      .catch(async () =>
        page.evaluate(() => {
          const r = document
            .querySelector(".ko-player-board-row .ko-board-slot")
            .getBoundingClientRect();
          return {
            field: { width: r.width, height: r.height },
            overflow:
              document.querySelector(".ko-game-shell").scrollHeight >
              innerHeight,
          };
        }),
      );
    assert.equal(geometry.overflow, false);
    // Tapping effect text must select/attack, not open a keyword modal.
    const a = await own().boundingBox();
    if (touch)
      await own().tap({ position: { x: a.width * 0.35, y: a.height * 0.78 } });
    else
      await own().click({
        position: { x: a.width * 0.35, y: a.height * 0.78 },
      });
    assert.equal(await page.locator("[data-card-rules-dialog]").count(), 0);
    assert.equal(
      await page
        .locator('.ko-player-board-row [data-card-highlight="selected"]')
        .count(),
      1,
    );
    const selectedBounds = await enemy().boundingBox();
    assert.ok(
      Math.abs(selectedBounds.width - geometry.field.width) < 1,
      "selection must not shrink field",
    );
    await load();
    await drag(enemy());
    assert.equal((await state()).players[1].board[0].currentHealth, 7);
    assert.equal((await state()).players[0].board[0].attacksUsedThisTurn, 1);
    assert.equal(
      (await state()).events.filter((e) => e.type === "ATTACK_DECLARED").length,
      1,
    );
    await load();
    await drag(page.locator(".ko-opponent-champion"));
    assert.equal((await state()).players[1].health, 17);
    for (const mode of ["defense", "cooldown", "opponent"]) {
      await load(mode);
      const before = await state();
      await drag(enemy());
      assert.deepEqual(await state(), before, mode + " rejects illegal drag");
    }
    for (const mode of ["taunt", "token"]) {
      await load(mode);
      const before = await state();
      await drag(page.locator(".ko-opponent-champion"));
      assert.deepEqual(await state(), before, mode + " protects champion");
    }
    await load();
    const beforeCancel = await state();
    await drag(enemy(), true);
    assert.deepEqual(await state(), beforeCancel, "cancel sends no attack");
    await load();
    const beforeOutside = await state();
    await drag(page.locator(".ko-player-zones"));
    assert.deepEqual(
      await state(),
      beforeOutside,
      "outside drop sends no attack",
    );
    // Ordinary taps remain the same attack-selection path; wait for React's
    // selected-state commit before sending the target touch.
    await load();
    const tap = async (node) =>
      touch
        ? node.tap({ position: { x: 18, y: 45 } })
        : node.click({ position: { x: 18, y: 45 } });
    await tap(own());
    await page
      .locator('.ko-player-board-row [data-card-highlight="selected"]')
      .waitFor();
    await tap(enemy());
    await page.waitForFunction(
      () =>
        JSON.parse(
          document.querySelector('[data-testid="state-json"]').textContent,
        ).players[1].board[0].currentHealth === 7,
    );
    assert.equal(
      (await state()).events.filter((e) => e.type === "ATTACK_DECLARED").length,
      1,
    );
    assert.equal(sawAttackGhost, true, "attack follows pointer visually");
    await load();
    await page
      .locator(".ko-player-board-row [data-touch-inspect-trigger]")
      .first()
      .click();
    await page.locator('[aria-label="상세정보"]').waitFor();
    await page
      .locator('[aria-label="상세정보 닫기"]')
      .evaluate((e) => e.click());
    assert.equal(await page.evaluate(() => visualViewport.scale), 1);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `qa-results/field-size-input/after-${width}-${height}.png`,
    });
    results.push({
      width,
      height,
      touch,
      ...geometry,
      hand: initialHand,
      status: "PASS",
    });
    console.log("PASS " + width + "x" + height);
    await context.close();
  }
  fs.mkdirSync("qa-results/field-size-input", { recursive: true });
  fs.writeFileSync(
    "qa-results/field-size-input/results.json",
    JSON.stringify(
      { results, physicalDevice: "NOT_RUN", operationalWrites: false },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
