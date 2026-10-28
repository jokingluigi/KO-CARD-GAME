import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/wrestler-champion-attack";
await mkdir(out, { recursive: true });
const results = [];
const browser = await chromium.launch();
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      ...(width === 390
        ? { recordVideo: { dir: out + "/video", size: { width, height: 844 } } }
        : {}),
    });
    const p = await context.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", async (r) => {
      const m = r
        .request()
        .url()
        .match(/command-(default|attack|low)\.png/);
      return r.fulfill(
        m
          ? {
              body: await readFile(
                "qa-results/final-ten-sprites/fixtures/" + m[1] + ".png",
              ),
              contentType: "image/png",
            }
          : { json: { cards: [], frames: [] } },
      );
    });
    await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await p.locator(".ko-game-shell").waitFor();
    await p
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    await p.evaluate(async () => {
      const { boardFixture } = await import("/qa/black-gold-fixture.ts");
      const { generateCardInstance, executeAction } =
        await import("/src/game/index.ts");
      const def = {
        id: "command-qa-unit",
        name: "QA 선수",
        cardType: "WRESTLER",
        cost: 1,
        attack: 2,
        health: 4,
        rarity: "NORMAL",
        rulesText: "",
        abilities: [],
        keywords: [],
      };
      window.__commandLoad = (target = "WRESTLER", opponent = false) => {
        const s = boardFixture();
        s.gameId = "command-" + crypto.randomUUID();
        s.status = "IN_PROGRESS";
        s.turn = 4;
        s.activePlayerId = opponent ? "player-2" : "player-1";
        s.events = [];
        s.cardPool = [def];
        const cosmetics = {};
        const placement = { scale: 1, x: 50, y: 40, crop: false, flip: false };
        for (const [i, pl] of s.players.entries()) {
          pl.board = [null, null, null, null];
          pl.hand = [];
          pl.health = i ? 20 : 4;
          pl.champion.quest = null;
          pl.champion.questCompleted = false;
          const frames = Object.fromEntries(
            ["default", "attack", "low"].map((key) => [
              key,
              {
                url:
                  "/api/storage/objects/uploads/cosmetics/command-" +
                  key +
                  ".png",
                self: { ...placement },
                opponent: { ...placement },
              },
            ]),
          );
          const config = { version: 1, frames, reactions: {} };
          cosmetics[pl.id] = {
            cardBack: null,
            emotes: [null, null, null, null],
            skins: {
              ["champion:" + pl.champion.id]: {
                id: "command-skin-" + i,
                type: "CHAMPION_SKIN",
                targetId: pl.champion.id,
                name: "QA selected skin",
                description: "",
                isActive: true,
                sortOrder: 0,
                imageAssets: { __battle: JSON.stringify(config) },
              },
            },
          };
        }
        const attacking = opponent ? 1 : 0;
        s.players[attacking].board[0] = {
          ...generateCardInstance(def, { instanceId: "command-attacker" }),
          boardSlot: 0,
          enteredThisTurn: false,
        };
        if (target === "WRESTLER")
          s.players[1 - attacking].board[0] = {
            ...generateCardInstance(def, { instanceId: "command-defender" }),
            boardSlot: 0,
            enteredThisTurn: false,
          };
        window.__commandState = s;
        window.__commandCosmetics = cosmetics;
        window.__commandPublish = () =>
          window.dispatchEvent(
            new CustomEvent("ko-qa-load-state", {
              detail: {
                state: structuredClone(window.__commandState),
                cosmetics,
                definitions: [def],
              },
            }),
          );
        window.__commandPublish();
      };
      window.__commandEnemy = () => {
        const r = executeAction(window.__commandState, {
          type: "ATTACK",
          playerId: "player-2",
          attackerInstanceId: "command-attacker",
          target: { type: "PLAYER", playerId: "player-1" },
        });
        if (!r.success) throw Error(r.message);
        window.__commandState = r.state;
        window.__commandPublish();
      };
    });
    const own = p.locator(".ko-player-champion .ko-battle-actor"),
      enemy = p.locator(".ko-opponent-champion .ko-battle-actor");
    for (const kind of ["WRESTLER", "PLAYER"]) {
      await p.evaluate((kind) => window.__commandLoad(kind), kind);
      await p.waitForFunction(() =>
        document
          .querySelector(".ko-player-champion .ko-battle-actor img")
          ?.src.includes("command-low"),
      );
      const card = p.locator(".ko-player-board-row .ko-board-slot").first();
      await card.click();
      assert.equal(
        await own.getAttribute("data-reaction"),
        "IDLE",
        "selection alone must not react",
      );
      await card.click();
      assert.equal(
        await own.getAttribute("data-reaction"),
        "IDLE",
        "cancellation must not react",
      );
      await card.click();
      await (
        kind === "PLAYER"
          ? p.locator(".ko-opponent-champion")
          : p.locator(".ko-opponent-board-row .ko-board-slot").first()
      ).click();
      await own.locator(":scope[data-reaction=ATTACK]").waitFor();
      assert.equal(
        await own.getAttribute("data-sprite-skin"),
        "command-skin-0",
      );
      assert.equal(
        await own.locator(".ko-battle-actor__body img").getAttribute("src"),
        "/api/storage/objects/uploads/cosmetics/command-attack.png",
      );
      assert.equal(
        await p.locator("[data-sprite-link=WRESTLER_ATTACK]").count(),
        0,
        "no duplicate champion projectile",
      );
      await p.screenshot({
        path: `${out}/attack-${kind.toLowerCase()}-${width}.png`,
      });
      await p.waitForTimeout(1000);
      assert.equal(await own.getAttribute("data-reaction"), "IDLE");
      assert.ok(
        (
          await own.locator(".ko-battle-actor__body img").getAttribute("src")
        ).includes("command-low"),
        "restore current low-health expression",
      );
    }
    await p.evaluate(() => window.__commandLoad("PLAYER", true));
    await p.waitForTimeout(100);
    await p.evaluate(() => window.__commandEnemy());
    await enemy.locator(":scope[data-reaction=ATTACK]").waitFor();
    assert.equal(
      await enemy.getAttribute("data-sprite-skin"),
      "command-skin-1",
    );
    assert.ok(
      (
        await enemy.locator(".ko-battle-actor__body img").getAttribute("src")
      ).includes("command-attack"),
    );
    assert.equal(
      await enemy
        .locator(".ko-battle-actor__body")
        .evaluate((n) => getComputedStyle(n).transform),
      "matrix(-1, 0, 0, 1, 0, 0)",
    );
    await p.waitForTimeout(1100);
    assert.equal(await enemy.getAttribute("data-reaction"), "IDLE");
    assert.deepEqual(errors, []);
    results.push({
      width,
      confirmedCardAttack: true,
      confirmedChampionAttack: true,
      selectAndCancelIgnored: true,
      lowHealthRestored: true,
      opponentSkinAndMirror: true,
      noDuplicateProjectile: true,
      pageErrors: errors,
    });
    await context.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
