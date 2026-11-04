import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/longer-surprise";
await mkdir(out, { recursive: true });
const config = {
  version: 1,
  frames: Object.fromEntries(
    ["default", "surprised"].map((k) => [
      k,
      {
        url: "/api/storage/objects/uploads/cosmetics/surprise-" + k + ".png",
        self: { scale: 1, x: 50, y: 50, crop: false, flip: false },
        opponent: { scale: 1, x: 50, y: 50, crop: false, flip: true },
      },
    ]),
  ),
  reactions: {},
  timing: { ALLY_RETIRED: 900 },
};
const browser = await chromium.launch(),
  results = [];
try {
  for (const [width, height, reduced] of [
    [390, 844, false],
    [1440, 900, false],
    [390, 844, true],
  ]) {
    const p = await browser.newPage({
      viewport: { width, height },
      reducedMotion: reduced ? "reduce" : "no-preference",
    });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", async (r) => {
      const key = r
        .request()
        .url()
        .match(/surprise-(default|surprised)\.png/);
      return r.fulfill(
        key
          ? {
              body: await readFile(
                "qa-results/final-ten-sprites/fixtures/" + key[1] + ".png",
              ),
              contentType: "image/png",
            }
          : { json: { cards: [], frames: [] } },
      );
    });
    await p.addInitScript(() => {
      localStorage.setItem("ko-match-coach-v1", "done");
      HTMLMediaElement.prototype.play = () => Promise.resolve();
      HTMLMediaElement.prototype.pause = () => {};
    });
    await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await p.locator(".ko-game-shell").waitFor();
    await p.evaluate(async (config) => {
      const { boardFixture } = await import("/qa/black-gold-fixture.ts");
      const { generateCardInstance, executeAction } =
        await import("/src/game/index.ts");
      const { applyEffect } =
        await import("/src/game/effects/effect-engine.ts");
      window.surpriseLoad = (low) => {
        const state = boardFixture();
        state.gameId = crypto.randomUUID();
        state.events = [];
        state.status = "IN_PROGRESS";
        state.activePlayerId = "player-2";
        state.turn = 4;
        const d = {
          id: "qa-legend",
          name: "레전더리 반응 검증",
          cardType: "WRESTLER",
          rarity: "LEGENDARY",
          cost: 1,
          attack: 1,
          health: 2,
          rulesText: "",
          abilities: [],
          keywords: [],
        };
        state.cardPool = [d];
        const cosmetics = {};
        for (const pl of state.players) {
          pl.hand = [];
          pl.board = [null, null, null, null];
          pl.currentGold = 10;
          pl.health = 20;
          pl.champion.quest = null;
          cosmetics[pl.id] = {
            cardBack: null,
            emotes: [],
            skins: {
              ["champion:" + pl.champion.id]: {
                id: "test-" + pl.id,
                type: "CHAMPION_SKIN",
                targetId: pl.champion.id,
                name: "QA temporary sprite",
                isActive: true,
                sortOrder: 0,
                imageAssets: { __battle: JSON.stringify(config) },
              },
            },
          };
        }
        state.players[0].health = low ? 4 : 20;
        state.players[1].hand = [
          generateCardInstance(d, { instanceId: "legend" }),
        ];
        window.surpriseState = state;
        window.surpriseShow = () =>
          window.dispatchEvent(
            new CustomEvent("ko-qa-load-state", {
              detail: {
                state: window.surpriseState,
                definitions: [d],
                cosmetics,
              },
            }),
          );
        window.surprisePlay = () => {
          const r = executeAction(window.surpriseState, {
            type: "PLAY_WRESTLER",
            playerId: "player-2",
            cardInstanceId: "legend",
            boardSlot: 0,
          });
          if (!r.success) throw Error(r.message);
          window.surpriseState = r.state;
          window.surpriseAt = performance.now();
          window.surpriseShow();
        };
        window.surpriseHit = () => {
          window.surpriseState = applyEffect(
            window.surpriseState,
            "player-2",
            window.surpriseState.players[1].board[0],
            {
              type: "STRUCTURED",
              action: "DAMAGE",
              target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF" },
              values: { amount: 6 },
            },
          );
          window.surpriseShow();
        };
        window.surpriseShow();
      };
      window.surpriseLoad(true);
    }, config);
    const actor = p.locator(".ko-player-champion .ko-battle-actor");
    await actor.waitFor();
    await p.evaluate(() => window.surprisePlay());
    await p.waitForFunction(
      () =>
        document.querySelector(".ko-player-champion .ko-battle-actor")?.dataset
          .reaction === "ALLY_RETIRED",
    );
    await p.waitForTimeout(1300);
    assert.equal(await actor.getAttribute("data-reaction"), "ALLY_RETIRED");
    await p.screenshot({
      path: out + "/held-" + width + (reduced ? "-reduced" : "") + ".png",
    });
    await p.waitForFunction(
      () =>
        document.querySelector(".ko-player-champion .ko-battle-actor")?.dataset
          .reaction === "IDLE",
    );
    const measured = await p.evaluate(
      () => performance.now() - window.surpriseAt,
    );
    assert.ok(measured >= 1950 && measured < 2800);
    assert.equal(await actor.getAttribute("data-sprite-state"), "LOW");
    await p.evaluate(() => window.surpriseLoad(false));
    await p.waitForTimeout(60);
    await p.evaluate(() => window.surprisePlay());
    await p.waitForFunction(
      () =>
        document.querySelector(".ko-player-champion .ko-battle-actor")?.dataset
          .reaction === "ALLY_RETIRED",
    );
    await p.evaluate(() => window.surpriseHit());
    await p.waitForFunction(
      () =>
        document.querySelector(".ko-player-champion .ko-battle-actor")?.dataset
          .reaction === "HEAVY_HIT",
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      reduced,
      legacyConfiguredMs: 900,
      measuredSurpriseMs: measured,
      lowHealthReturn: true,
      heavyHitInterrupts: true,
      errors,
    });
    await p.context().close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
