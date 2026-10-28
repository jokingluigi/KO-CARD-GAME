import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    requests = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path.includes("/source-valid-")) {
      await new Promise((r) => setTimeout(r, 40));
      return route.fulfill({
        body: await readFile(
          "qa-results/final-ten-sprites/fixtures/default.png",
        ),
        contentType: "image/png",
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: "deliberate unavailable original/reaction art" },
    });
  });
  await page.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
  await page.locator(".ko-game-shell").waitFor();
  for (let index = 0; index < 8; index++) {
    await page.evaluate(async (index) => {
      const { boardFixture, definitions } =
        await import("/qa/black-gold-fixture.ts");
      const s = boardFixture();
      s.gameId = "image-source-" + index;
      s.events = [];
      const p = { scale: 1, x: 50, y: 35, flip: false, crop: false };
      for (const [n, player] of s.players.entries()) {
        player.champion.quest = null;
        player.champion.imageUrl =
          "/api/storage/objects/uploads/cosmetics/original-spy-" +
          index +
          "-" +
          n +
          ".png";
        const frame = {
          url:
            "/api/storage/objects/uploads/cosmetics/source-valid-" +
            index +
            "-" +
            n +
            ".png",
          self: p,
          opponent: p,
        };
        player.champion.presentationLines = {
          BATTLE_SPRITE: {
            version: 1,
            frames: {
              default: frame,
              attack: { ...frame, self: { ...p, scale: 1.5 } },
              hurt: {
                ...frame,
                url: "/api/storage/objects/uploads/cosmetics/source-missing-hurt.png",
              },
            },
            reactions: { HIT: "hurt" },
          },
        };
      }
      window.__imageSource = s;
      window.__imageDefinitions = definitions;
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", {
          detail: { state: s, definitions },
        }),
      );
    }, index);
    await page.waitForFunction(
      (index) =>
        [...document.querySelectorAll(".ko-battle-actor img")].length === 2 &&
        [...document.querySelectorAll(".ko-battle-actor img")].every(
          (i) =>
            i.complete &&
            i.naturalWidth > 0 &&
            i.src.includes("source-valid-" + index + "-"),
        ),
      index,
    );
    await page.evaluate(async () => {
      const { applyEffect, generateCardInstance } =
        await import("/src/game/index.ts");
      const source = generateCardInstance(
        window.__imageSource.cardPool.find((d) => d.cardType === "WRESTLER"),
        { instanceId: "image-source-damage" },
      );
      window.__imageSource = applyEffect(
        window.__imageSource,
        "player-1",
        source,
        {
          type: "STRUCTURED",
          action: "DAMAGE",
          target: {
            zone: "PLAYER",
            owner: "SELF",
            selection: "SELF",
            count: 1,
          },
          values: { amount: 1 },
        },
      );
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", {
          detail: {
            state: window.__imageSource,
            definitions: window.__imageDefinitions,
          },
        }),
      );
    });
    await page.waitForTimeout(100);
    assert.equal(
      await page
        .locator(".ko-player-champion .ko-battle-actor")
        .getAttribute("data-reaction"),
      "HIT",
    );
    assert.ok(
      (
        await page
          .locator(".ko-player-champion .ko-battle-actor img")
          .getAttribute("src")
      ).includes("source-valid-" + index + "-0"),
    );
    assert.equal(requests.filter(path=>path.includes(`/original-spy-${index}-`)).length,0,
      'initial actor decode must not request original art before its valid registered sprite (case ${index})');
    if (index === 7) {
      await page.waitForTimeout(650);
      await page.evaluate(async () => {
        const { executeAction } = await import("/src/game/index.ts");
        window.__imageSource.players[0].champion.ability = {
          id: "same-image-ability",
          name: "QA",
          description: "골드 +1",
          cost: 0,
          effects: [{ type: "GAIN_GOLD", amount: 1 }],
        };
        window.__imageSource.players[0].championAbilityUsedThisTurn = false;
        const result = executeAction(window.__imageSource, {
          type: "USE_CHAMPION_ABILITY",
          playerId: "player-1",
        });
        if (!result.success) throw Error(result.message);
        window.__imageSource = result.state;
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: {
              state: result.state,
              definitions: window.__imageDefinitions,
            },
          }),
        );
      });
      await page.waitForFunction(
        () =>
          new DOMMatrix(
            getComputedStyle(
              document.querySelector(
                ".ko-player-champion .ko-battle-actor img",
              ),
            ).transform,
          ).a === 1.5,
      );
    }
  }
  // The real ability's separate speech/cut-in may legitimately request its
  // original illustration; it is outside the actor's initial-source invariant.
  assert.deepEqual(errors, []);
  console.log(
    "PASS 8 fresh games, both sprites decode, failed reaction uses same-set default, initial original never requested ahead of valid sprite; same-image reaction keeps its own framing",
  );
} finally {
  await browser.close();
}
