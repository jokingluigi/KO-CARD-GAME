import assert from "node:assert/strict";
import { chromium } from "./black-gold-playwright.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const out = "qa-results/final-ten-sprites";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of [
    [360, 740],
    [375, 812],
    [390, 844],
    [412, 915],
    [844, 390],
    [1024, 768],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      ...(width === 390
        ? { recordVideo: { dir: out + "/video", size: { width, height } } }
        : {}),
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      try {
        if (path.includes("/cosmetics/ten-")) {
          const key = path.split("/ten-").pop().replace(".png", "");
          return await route.fulfill({
            body: await readFile(out + "/fixtures/" + key + ".png"),
            contentType: "image/png",
          });
        }
        const source = path;
        await route.fulfill({
          body: await readFile(
            "/tmp/ko-board-image-cache/" +
              createHash("sha256").update(source).digest("hex"),
          ),
          contentType: "image/png",
        });
      } catch {
        await route.fulfill({ json: { cards: [], frames: [] } });
      }
    });
    await page.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await page.locator(".ko-game-shell").waitFor();
    await page
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    await page.evaluate(async () => {
      const { boardFixture, definitions } =
        await import("/qa/black-gold-fixture.ts");
      const { generateCardInstance } = await import("/src/game/index.ts");
      const { SPRITE_EXPRESSIONS } =
        await import("/@fs/workspace/KO-CARD-GAME/lib/cosmetics/src/index.ts");
      const s = boardFixture();
      s.gameId = "ten-" + crypto.randomUUID();
      s.events = [];
      s.cardPool = definitions;
      const p = { scale: 1, x: 50, y: 35, crop: false, flip: false };
      const frames = Object.fromEntries(
        Object.keys(SPRITE_EXPRESSIONS).map((k) => [
          k,
          {
            url: "/api/storage/objects/uploads/cosmetics/ten-" + k + ".png",
            self: p,
            opponent: p,
          },
        ]),
      );
      window.__tenConfig = {
        version: 1,
        frames,
        reactions: {},
        awakening: "REPLACE",
        awakened: {
          version: 1,
          frames: {
            default: {
              ...frames.default,
              url: "/api/storage/objects/uploads/cosmetics/ten-awake.png",
            },
          },
          reactions: {},
        },
      };
      window.__tenCosmetics = {};
      for (const [index, pl] of s.players.entries()) {
        pl.health = 20;
        pl.maxHealth = 20;
        pl.board = [null, null, null, null];
        pl.hand = [];
        pl.champion.quest = null;
        pl.champion.questCompleted = false;
        pl.currentGold = 10;
        window.__tenCosmetics[pl.id] = {
          version: 1,
          skins: {
            ["champion:" + pl.champion.id]: {
              id: "ten-selected-" + index,
              type: "CHAMPION_SKIN",
              targetId: pl.champion.id,
              name: "임시 기존 일러스트",
              description: "QA only",
              isActive: true,
              sortOrder: 0,
              imageAssets: {
                art: pl.champion.imageUrl,
                __battle: JSON.stringify(window.__tenConfig),
              },
            },
          },
          emotes: [],
          cardBack: null,
        };
      }
      const d = definitions.find((d) => d.name === "리버덩크");
      s.players[0].board[0] = {
        ...generateCardInstance(d, { instanceId: "ten-attacker" }),
        boardSlot: 0,
        enteredThisTurn: false,
        attacksUsedThisTurn: 0,
        currentAttack: 1,
      };
      s.players[0].hand = ["리버덩크", "보드바", "퀘스쳔"].map((n, i) =>
        generateCardInstance(
          definitions.find((d) => d.name === n),
          { instanceId: "ten-hand-" + i },
        ),
      );
      window.__ten = structuredClone(s);
      window.__publishTen = () =>
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: {
              state: structuredClone(window.__ten),
              definitions,
              cosmetics: window.__tenCosmetics,
            },
          }),
        );
      window.__publishTen();
    });
    const own = page.locator(".ko-player-champion .ko-battle-actor");
    await own.locator("img").waitFor();
    await page.waitForFunction(() => {
      const img = document.querySelector(
        ".ko-player-champion .ko-battle-actor img",
      );
      return (
        img?.complete &&
        img.naturalWidth > 0 &&
        img.src.includes("/ten-default.png")
      );
    });
    assert.equal(await own.getAttribute("data-sprite-skin"), "ten-selected-0");
    assert.equal(
      await page
        .locator(".ko-opponent-champion .ko-battle-actor")
        .getAttribute("data-sprite-skin"),
      "ten-selected-1",
    );
    await page.waitForFunction(() => {
      const img = document.querySelector(
        ".ko-opponent-champion .ko-battle-actor img",
      );
      return (
        img?.complete &&
        img.naturalWidth > 0 &&
        img.src.includes("/ten-default.png")
      );
    },null,{timeout:5000}).catch(async error=>{
      console.log("IMAGE_DEBUG",width,await page.locator(".ko-opponent-champion .ko-battle-actor").evaluate(n=>n.outerHTML));
      console.log("DECODE_DEBUG",await page.evaluate(async()=>{const i=new Image();i.src="/api/storage/objects/uploads/cosmetics/ten-default.png";try{await i.decode();return {ok:true,w:i.naturalWidth};}catch(e){return {ok:false,message:String(e)};}}));
      throw error;
    });
    const geometry = await page.evaluate(() => {
      const b = (s) =>
        document.querySelector(s).getBoundingClientRect().toJSON();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        self: b(".ko-player-champion"),
        enemy: b(".ko-opponent-champion"),
        field: b(".ko-player-board-row"),
        hand: b(".ko-player-hand"),
        pointer: getComputedStyle(document.querySelector(".ko-battle-actor"))
          .pointerEvents,
      };
    });
    assert.equal(geometry.overflow, false);
    assert.equal(geometry.pointer, "none");
    if(width<1000 && width<height)assert.ok(Math.abs(geometry.self.left-geometry.enemy.left)<1,'phone commanders share the centre column');
    else assert.ok(geometry.self.left < geometry.enemy.left);
    assert.ok(geometry.hand.top >= geometry.field.bottom);
    if (width === 390 || width === 1440) {
      await page.screenshot({
        path: `${out}/battle-${width}.png`,
        fullPage: true,
      });
      async function effect(action, amount) {
        await page.evaluate(
          async ({ action, amount }) => {
            const { applyEffect, generateCardInstance } =
              await import("/src/game/index.ts");
            const source = generateCardInstance(
              window.__ten.cardPool.find((d) => d.name === "리버덩크"),
              { instanceId: "ten-source" },
            );
            window.__ten = applyEffect(window.__ten, "player-1", source, {
              type: "STRUCTURED",
              action,
              target: {
                zone: "PLAYER",
                owner: "SELF",
                selection: "SELF",
                count: 1,
              },
              values: { amount },
            });
            window.__publishTen();
          },
          { action, amount },
        );
      }
      for (const amount of [0, 1, 4, 5]) {
        await effect("DAMAGE", amount);
        if (amount === 0)
          assert.equal(await own.getAttribute("data-reaction"), "IDLE");
        else {
          const e = amount >= 5 ? "HEAVY_HIT" : "HIT";
          await page.waitForFunction(
            (e) =>
              document.querySelector(".ko-player-champion .ko-battle-actor")
                .dataset.reaction === e,
            e,
          );
          if (width === 390)
            await own.screenshot({ path: out + "/actor-" + e + ".png" });
          await page.waitForTimeout(amount >= 5 ? 1000 : 700);
        }
      }
      await page.evaluate(() => {
        window.__ten = {
          ...window.__ten,
          players: window.__ten.players.map((p, i) =>
            i === 0 ? { ...p, health: 6 } : p,
          ),
        };
        window.__publishTen();
      });
      await effect("DAMAGE", 1);
      await page.waitForTimeout(700);
      assert.equal(await own.getAttribute("data-sprite-state"), "LOW");
      await page.evaluate(() => {
        window.__ten = {
          ...window.__ten,
          players: window.__ten.players.map((p, i) =>
            i === 0 ? { ...p, health: 2 } : p,
          ),
        };
        window.__publishTen();
      });
      await effect("HEAL", 2);
      await page.waitForFunction(
        () =>
          document.querySelector(".ko-player-champion .ko-battle-actor").dataset
            .reaction === "HEAL",
      );
      await page.waitForTimeout(800);
      assert.equal(await own.getAttribute("data-sprite-state"), "LOW");
      assert.ok(
        (await own.locator("img").getAttribute("src")).includes("ten-low.png"),
      );
      await effect("HEAL", 3);
      await page.waitForTimeout(800);
      assert.equal(await own.getAttribute("data-sprite-state"), "IDLE");
      assert.ok(
        (await own.locator("img").getAttribute("src")).includes(
          "ten-default.png",
        ),
      );
      // A real pointer attack still reaches the relocated champion target.
      await page
        .locator(".ko-player-board-row .ko-board-slot.group")
        .first()
        .click({ position: { x: 25, y: 60 } });
      await page
        .getByRole("button", { name: "상대 챔피언 대상", exact: true })
        .click({ position: { x: 60, y: 60 } });
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector('[data-testid="state-json"]').textContent,
          ).players[1].health === 19,
      );
      await page.locator('.ko-opponent-champion [data-reaction="HIT"]').waitFor();
      assert.notEqual(await own.getAttribute("data-reaction"), "ATTACK");
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="preview-busy"]').textContent ===
          "false",
      );
      await page.waitForTimeout(1000);
      await page
        .locator(".ko-hand-card")
        .first()
        .click({ position: { x: 25, y: 60 } });
      await page
        .getByRole("button", { name: "2구역에 카드 배치", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector('[data-testid="state-json"]').textContent,
          ).players[0].board[1]?.instanceId === "ten-hand-0",
      );
      // Load the real accepted state back into the fixture driver, then use a real champion ability.
      await page.evaluate(async () => {
        window.__ten = JSON.parse(
          document.querySelector('[data-testid="state-json"]').textContent,
        );
        window.__ten.players[0].champion.ability = {
          id: "ten-ability",
          name: "테스트 고유능력",
          description: "골드 +1",
          cost: 0,
          effects: [{ type: "GAIN_GOLD", amount: 1 }],
        };
        window.__ten.players[0].championAbilityUsedThisTurn = false;
        window.__publishTen();
      });
      await page.waitForTimeout(700);
      await page.evaluate(async () => {
        const { executeAction } = await import("/src/game/index.ts");
        const r = executeAction(window.__ten, {
          type: "USE_CHAMPION_ABILITY",
          playerId: "player-1",
        });
        if (!r.success) throw Error(r.message);
        window.__ten = r.state;
        window.__publishTen();
      });
      await page.waitForFunction(
        () =>
          document.querySelector(".ko-player-champion .ko-battle-actor").dataset
            .reaction === "ATTACK",
      );
      await page.waitForTimeout(900);
      await page.evaluate(() => {
        window.__ten = {
          ...window.__ten,
          players: window.__ten.players.map((p, i) =>
            i === 0
              ? { ...p, champion: { ...p.champion, questCompleted: true } }
              : p,
          ),
          events: [
            ...window.__ten.events,
            { type: "CHAMPION_QUEST_COMPLETED", playerId: "player-1" },
          ],
        };
        window.__publishTen();
      });
      await page.waitForFunction(
        () =>
          document.querySelector(".ko-player-champion .ko-battle-actor").dataset
            .spriteSet === "awakened",
      );
      await effect("DAMAGE", 1);
      await page.waitForTimeout(1600);
      assert.ok(
        (await own.locator("img").getAttribute("src")).includes(
          "ten-awake.png",
        ),
      );
      await page.screenshot({
        path: `${out}/awake-${width}.png`,
        fullPage: true,
      });
      await page.evaluate(async () => {
        const { executeAction } = await import("/src/game/index.ts");
        const r = executeAction(window.__ten, {
          type: "SURRENDER",
          playerId: "player-2",
        });
        if (!r.success) throw Error(r.message);
        window.__ten = r.state;
        window.__publishTen();
      });
      await page.waitForFunction(
        () =>
          document.querySelector(".ko-player-champion .ko-battle-actor").dataset
            .reaction === "VICTORY",
      );
      await page.waitForTimeout(1600);
      assert.equal(await own.getAttribute("data-reaction"), "VICTORY");
      await page.evaluate(() => {
        window.__ten = {
          ...window.__ten,
          gameId: "new-" + crypto.randomUUID(),
          events: [],
          status: "IN_PROGRESS",
          winnerId: null,
          loserId: null,
          players: window.__ten.players.map((p) => ({
            ...p,
            health: 10,
            champion: { ...p.champion, questCompleted: false },
          })),
        };
        window.__publishTen();
      });
      await page.waitForFunction(
        () =>
          document.querySelector(".ko-player-champion .ko-battle-actor").dataset
            .spriteSet === "normal",
      );
      assert.equal(await own.getAttribute("data-reaction"), "IDLE");
    }
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      noOverflow: true,
      skinBound: true,
      pointerSafe: true,
      actualEngineFlows: width === 390 || width === 1440,
    });
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(out + "/reactions-390.webm");
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
