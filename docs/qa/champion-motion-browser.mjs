import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/champion-motion";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      ...(width === 390
        ? { recordVideo: { dir: out + "/video", size: { width, height } } }
        : {}),
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("ko-match-screen-shake", "OFF");
      localStorage.setItem("ko-match-coach-v1", "done");
    });
    const page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (r) => {
      const url = r.request().url();
      if (url.includes("/motion-")) {
        const key = url.split("/motion-")[1].split(".png")[0];
        return r.fulfill({
          body: await readFile(
            "qa-results/final-ten-sprites/fixtures/" + key + ".png",
          ),
          contentType: "image/png",
        });
      }
      return r.fulfill({ json: { cards: [], frames: [] } });
    });
    await page.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await page.locator(".ko-game-shell").waitFor();
    await page
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    await page.evaluate(async () => {
      const { boardFixture } = await import("/qa/black-gold-fixture.ts");
      const { generateCardInstance } = await import("/src/game/index.ts");
      const { SPRITE_EXPRESSIONS } =
        await import("/@fs/workspace/KO-CARD-GAME/lib/cosmetics/src/index.ts");
      const unit = {
        id: "motion-unit",
        name: "QA Unit",
        cardType: "WRESTLER",
        rarity: "NORMAL",
        cost: 1,
        attack: 2,
        health: 3,
        rulesText: "",
        abilities: [],
        keywords: [],
      };
      const legend = {
        ...unit,
        id: "motion-legend",
        name: "QA Legendary",
        rarity: "LEGENDARY",
      };
      const spell = {
        ...unit,
        id: "motion-spell",
        name: "QA Spell",
        cardType: "TECHNIQUE",
        abilities: [
          {
            trigger: "ACTIVE",
            effects: [{ type: "DAMAGE_OPPONENT_CHAMPION", amount: 2 }],
          },
        ],
      };
      const p = { scale: 1, x: 50, y: 35, crop: false, flip: false };
      const frames = Object.fromEntries(
        Object.keys(SPRITE_EXPRESSIONS).map((k) => [
          k,
          {
            url: "/api/storage/objects/uploads/cosmetics/motion-" + k + ".png",
            self: { ...p },
            opponent: { ...p },
          },
        ]),
      );
      const config = {
        version: 1,
        frames,
        reactions: {},
        effects: {
          accent: "#c9a467",
          origin: { self: { x: 75, y: 58 }, opponent: { x: 25, y: 58 } },
        },
        emotes: { THANKS: "relief", WELL_PLAYED: "victory" },
        awakening: "REPLACE",
        awakened: {
          version: 1,
          frames: {
            default: {
              ...frames.default,
              url: "/api/storage/objects/uploads/cosmetics/motion-awake.png",
            },
          },
          reactions: {},
          effects: { accent: "#8d79b0" },
        },
      };
      window.__motionDefs = [unit, legend, spell];
      window.__motionConfig = config;
      window.__loadMotion = (quest = false) => {
        const s = boardFixture();
        s.gameId = "motion-" + crypto.randomUUID();
        s.events = [];
        s.cardPool = window.__motionDefs;
        for (const pl of s.players) {
          pl.health = 20;
          pl.maxHealth = 20;
          pl.board = [null, null, null, null];
          pl.hand = [];
          pl.currentGold = 10;
          pl.champion.quest = null;
          pl.champion.questCompleted = false;
          pl.champion.presentationLines = {
            BATTLE_SPRITE: structuredClone(config),
          };
        }
        s.players[0].hand = [
          generateCardInstance(spell, { instanceId: "motion-cast" }),
        ];
        s.players[0].champion.ability = {
          id: "motion-ability",
          name: "QA ability",
          description: "",
          cost: 0,
          effects: [{ type: "DAMAGE_OPPONENT_CHAMPION", amount: 1 }],
        };
        if (quest)
          s.players[0].champion.quest = {
            id: "motion-quest",
            name: "QA quest",
            description: "",
            trackedEvent: "CARD_PLAYED",
            requiredProgress: 1,
            reward: { type: "GAIN_GOLD", amount: 1 },
          };
        window.__motionState = s;
        window.__publishMotion();
      };
      window.__publishMotion = () =>
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: {
              state: structuredClone(window.__motionState),
              definitions: window.__motionDefs,
            },
          }),
        );
      window.__loadMotion();
    });
    const own = page.locator(".ko-player-champion .ko-sprite-visual"),
      enemy = page.locator(".ko-opponent-champion .ko-sprite-visual");
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll(
          ".ko-battle-actor .ko-battle-actor__body img",
        ),
      ].every((i) => i.complete && i.naturalWidth),
    );
    assert.equal(await own.getAttribute("data-motion"), null);
    await page.evaluate(() => {
      window.__motionFrameTimes = [];
      let last = performance.now();
      window.__motionSampler = true;
      const tick = (now) => {
        if (!window.__motionSampler) return;
        if (window.__motionFrameTimes.length < 600)
          window.__motionFrameTimes.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    async function action(action) {
      await page.evaluate(async (action) => {
        const { executeAction } = await import("/src/game/index.ts");
        const r = executeAction(window.__motionState, action);
        if (!r.success) throw Error(r.message);
        window.__motionState = r.state;
        window.__publishMotion();
      }, action);
    }
    async function damage(amount, selfDamage = false) {
      await page.evaluate(
        async ({ amount, selfDamage }) => {
          const { applyEffect, generateCardInstance } =
            await import("/src/game/index.ts");
          const source = generateCardInstance(window.__motionDefs[0], {
            instanceId: "damage-source",
          });
          window.__motionState = applyEffect(
            window.__motionState,
            selfDamage ? "player-1" : "player-2",
            source,
            selfDamage
              ? {
                  type: "STRUCTURED",
                  action: "DAMAGE",
                  target: { zone: "PLAYER", owner: "SELF", selection: "ALL" },
                  values: { amount },
                }
              : { type: "DAMAGE_OPPONENT_CHAMPION", amount },
          );
          window.__publishMotion();
        },
        { amount, selfDamage },
      );
    }
    async function motion(kind, node = own) {
      await node
        .locator(`:scope[data-motion="${kind}"]`)
        .waitFor({ timeout: 3000 });
    }
    async function waitQuiet() {
      await page.waitForTimeout(1050);
    }
    await action({ type: "END_TURN", playerId: "player-1" });
    await motion("TURN", enemy);
    await page.waitForTimeout(350);
    await action({ type: "END_TURN", playerId: "player-2" });
    await page.waitForTimeout(350);
    await action({
      type: "PLAY_TECHNIQUE",
      playerId: "player-1",
      cardInstanceId: "motion-cast",
    });
    await motion("SPELL");
    assert.equal(await page.locator("[data-sprite-link=SPELL]").count(), 1);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${out}/spell-${width}.png` });
    await waitQuiet();
    await action({ type: "USE_CHAMPION_ABILITY", playerId: "player-1" });
    await motion("ABILITY");
    await waitQuiet();
    const stable = await page.locator(".ko-player-champion").boundingBox();
    await damage(4);
    await motion("HIT");
    await page.waitForTimeout(45);
    const fixed = await page.locator(".ko-player-champion").boundingBox();
    for (const key of ["x", "y", "width", "height"])
      assert.ok(
        Math.abs(fixed[key] - stable[key]) < 0.8,
        "target/HUD must not inherit sprite recoil: " +
          JSON.stringify({ fixed, stable }),
      );
    assert.notEqual(
      await own
        .locator(".ko-sprite-pose")
        .evaluate((n) => getComputedStyle(n).transform),
      "none",
    );
    await page.screenshot({ path: `${out}/hit-${width}.png` });
    await waitQuiet();
    await damage(5, true);
    await motion("HEAVY_HIT");
    assert.equal(await own.getAttribute("data-self-damage"), "true");
    assert.equal(await page.locator("[data-external-vfx=IMPACT]").count(), 0);
    await waitQuiet();
    await damage(5);
    await motion("HEAVY_HIT");
    await action({ type: "EMOTE", playerId: "player-1", emote: "THREATEN" });
    assert.equal(await own.getAttribute("data-motion"), "HEAVY_HIT");
    await waitQuiet();
    await page.evaluate(async () => {
      const { healNewCardAware } =
        await import("/src/game/engine/new-card-rules.ts");
      window.__motionState.players[0].health = 2;
      window.__motionState = healNewCardAware(
        window.__motionState,
        "player-1",
        2,
      );
      window.__publishMotion();
    });
    await motion("HEAL");
    assert.equal(await own.locator(".ko-sprite-sheen").count(), 1);
    await waitQuiet();
    assert.equal(await own.getAttribute("data-state"), "LOW");
    await action({ type: "EMOTE", playerId: "player-1", emote: "WELL_PLAYED" });
    await motion("EMOTE");
    assert.equal(
      await page
        .locator(".ko-player-champion .ko-battle-actor")
        .getAttribute("data-reaction"),
      "EMOTE",
    );
    assert.ok(
      (
        await page
          .locator(".ko-player-champion .ko-battle-actor__body img")
          .getAttribute("src")
      ).includes("victory"),
    );
    await waitQuiet();
    assert.equal(await own.getAttribute("data-state"), "LOW");
    await page.evaluate(() => {
      window.__motionState.players[0].health = 20;
      window.__publishMotion();
    });
    await page.evaluate(async () => {
      const { healNewCardAware } =
        await import("/src/game/engine/new-card-rules.ts");
      window.__motionState = healNewCardAware(
        window.__motionState,
        "player-1",
        2,
      );
      window.__publishMotion();
    });
    assert.equal(await own.getAttribute("data-motion"), null);
    await page.evaluate(async () => {
      const { applyEffect, generateCardInstance } =
        await import("/src/game/index.ts");
      window.__motionState = applyEffect(
        window.__motionState,
        "player-1",
        generateCardInstance(window.__motionDefs[0], {
          instanceId: "summoner",
        }),
        {
          type: "STRUCTURED",
          action: "SUMMON",
          target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 2 },
          values: { definition: window.__motionDefs[1], count: 2 },
        },
      );
      window.__publishMotion();
    });
    await motion("LEGENDARY_SUMMON");
    await waitQuiet();
    await page.evaluate(async () => {
      const { applyEffect, generateCardInstance } =
        await import("/src/game/index.ts");
      window.__motionState = applyEffect(
        window.__motionState,
        "player-1",
        generateCardInstance(window.__motionDefs[0], {
          instanceId: "destroyer",
        }),
        {
          type: "STRUCTURED",
          action: "DESTROY",
          target: { zone: "BOARD", owner: "SELF", selection: "ALL" },
        },
      );
      window.__publishMotion();
    });
    await motion("SURPRISED");
    await waitQuiet();
    await page.evaluate(() => window.__loadMotion(true));
    await page.waitForTimeout(150);
    await action({
      type: "PLAY_TECHNIQUE",
      playerId: "player-1",
      cardInstanceId: "motion-cast",
    });
    await motion("AWAKEN");
    assert.equal(
      await page
        .locator(".ko-player-champion .ko-battle-actor")
        .getAttribute("data-sprite-set"),
      "normal",
    );
    await page.waitForTimeout(300);
    assert.equal(
      await page
        .locator(".ko-player-champion .ko-battle-actor")
        .getAttribute("data-sprite-set"),
      "awakened",
    );
    await page.waitForTimeout(1300);
    await page.evaluate(async () => {
      const { saveCombatPreferences } =
        await import("/src/components/combat-preferences.ts");
      saveCombatPreferences({
        quality: "LOW",
        intensity: "STANDARD",
        reducedMotion: true,
      });
    });
    await damage(5);
    await motion("HEAVY_HIT");
    assert.equal(await own.getAttribute("data-reduced"), "true");
    assert.equal(
      await own
        .locator(".ko-sprite-pose")
        .evaluate((n) => getComputedStyle(n).transform),
      "none",
    );
    await waitQuiet();
    await action({ type: "SURRENDER", playerId: "player-2" });
    assert.equal(await own.getAttribute("data-state"), "VICTORY");
    assert.equal(await enemy.getAttribute("data-state"), "DEFEAT");
    await page.waitForTimeout(800);
    assert.equal(
      await own
        .locator(".ko-sprite-breath")
        .evaluate((n) => getComputedStyle(n).animationName),
      "none",
    );
    await page.evaluate(() => {
      window.__motionState.gameId = "restore-finished";
      window.__publishMotion();
    });
    assert.equal(await own.getAttribute("data-motion"), null);
    await page.evaluate(() => window.__loadMotion());
    await page.waitForTimeout(150);
    await page.evaluate(async () => {
      const { executeAction } = await import("/src/game/index.ts");
      for (let i = 0; i < 24; i++) {
        const r = executeAction(window.__motionState, {
          type: "EMOTE",
          playerId: "player-1",
          emote: "THANKS",
        });
        if (!r.success) throw Error(r.message);
        window.__motionState = r.state;
      }
      window.__publishMotion();
    });
    await motion("EMOTE");
    assert.ok(
      (await own
        .locator(".ko-sprite-pose")
        .evaluate((n) => n.getAnimations().length)) <= 1,
      "one body animation, no accumulated backlog",
    );
    await page.evaluate(async () => {
      const { saveCombatPreferences } =
        await import("/src/components/combat-preferences.ts");
      saveCombatPreferences({
        quality: "LOW",
        intensity: "STANDARD",
        reducedMotion: false,
      });
    });
    await page.waitForTimeout(40);
    assert.equal(
      await own.getAttribute("data-motion"),
      null,
      "preference change cancels rather than replaying an old cue",
    );
    await page.waitForTimeout(1100);
    assert.equal(
      await own
        .locator(".ko-sprite-pose")
        .evaluate((n) => n.getAnimations().length),
      0,
    );
    assert.equal(await page.locator(".ko-sprite-link").count(), 0);
    const frames = await page.evaluate(() => {
      window.__motionSampler = false;
      return window.__motionFrameTimes;
    });
    const sorted = frames.slice().sort((a, b) => a - b),
      p95 = sorted[Math.floor(sorted.length * 0.95)];
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      frameSamples: frames.length,
      headlessRafP95Ms: Math.round(p95 * 100) / 100,
      burstAndPreferenceCleanup: true,
      turn: true,
      spell: true,
      ability: true,
      damageBoundary: true,
      selfDamage: true,
      emotePriorityAndReturn: true,
      legendarySummonAndExit: true,
      maskedAwakeSwap: true,
      reducedMotion: true,
      resultAndReconnect: true,
      stableHud: true,
    });
    await ctx.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
