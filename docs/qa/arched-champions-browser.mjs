import assert from "node:assert/strict";
import { chromium } from "./black-gold-playwright.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const out = "qa-results/arched-champions";
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
      if (route.request().url().includes("/arch-qa.png"))
        return route.fulfill({
          body: await readFile(
            "qa-results/final-ten-sprites/fixtures/default.png",
          ),
          contentType: "image/png",
        });
      return route.fulfill({ json: { cards: [], frames: [] } });
    });
    await page.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await page.locator(".ko-game-shell").waitFor();
    await page
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    await page.evaluate(async () => {
      const { boardFixture, definitions } =
        await import("/qa/black-gold-fixture.ts");
      window.__arch = boardFixture();
      window.__arch.gameId = "arch-" + crypto.randomUUID();
      window.__arch.events = [];
      const p = { scale: 1, x: 50, y: 35, crop: false, flip: false };
      for (const player of window.__arch.players)
        player.champion.presentationLines = {
          ...player.champion.presentationLines,
          BATTLE_SPRITE: {
            version: 1,
            frames: {
              default: {
                url: "/api/storage/objects/uploads/cosmetics/arch-qa.png",
                self: p,
                opponent: p,
              },
            },
            reactions: {},
          },
        };
      window.__publishArch = () =>
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: { state: structuredClone(window.__arch), definitions },
          }),
        );
      window.__publishArch();
    });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".ko-battle-actor img")].length === 2 &&
        [...document.querySelectorAll(".ko-battle-actor img")].every(
          (i) => i.complete && i.naturalWidth > 0 && i.src.includes("arch-qa"),
        ),
    );
    const layout = await page.evaluate(() => {
      const box = (s) =>
        document.querySelector(s).getBoundingClientRect().toJSON();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        self: box(".ko-player-champion"),
        enemy: box(".ko-opponent-champion"),
        vital: box(".ko-player-champion .ko-portrait-health"),
        field: box(".ko-player-board-row"),
        hand: box(".ko-player-hand"),
        card: box(".ko-player-board-row .ko-board-slot"),
        handCard: box(".ko-hand-card"),
        decorations: [
          ...document.querySelectorAll(
            ".ko-portrait-arch,.ko-portrait-rim,.ko-portrait-name,.ko-portrait-health,.ko-portrait-plinth",
          ),
        ].map((n) => getComputedStyle(n).pointerEvents),
      };
    });
    assert.equal(layout.overflow, false);
    assert.ok(layout.decorations.every((v) => v === "none"));
    assert.ok(
      Math.abs(
        layout.self.left +
          layout.self.width / 2 -
          (layout.vital.left + layout.vital.width / 2),
      ) < 1,
    );
    assert.ok(layout.vital.bottom <= layout.self.bottom + 1);
    assert.ok(
      layout.self.right <= layout.field.left ||
        layout.self.top >= layout.field.bottom,
    );
    assert.ok(
      layout.enemy.left >= layout.field.right ||
        layout.enemy.bottom <= layout.field.top,
    );
    assert.ok(layout.hand.top >= layout.field.bottom);
    assert.equal(await page.locator(".ko-portrait-health").count(), 2);
    assert.ok(
      !(await page.locator(".ko-player-stats").innerText()).includes("체력"),
    );
    if ([360, 390, 844, 1440].includes(width))
      await page.screenshot({
        path: `${out}/populated-${width}.png`,
        fullPage: true,
      });
    if (width === 390 || width === 1440) {
      await page.evaluate(async () => {
        window.__arch = {
          ...window.__arch,
          players: window.__arch.players.map((p, i) => ({
            ...p,
            ...(i === 0 ? { health: 6 } : {}),
            champion: {
              ...p.champion,
              quest: null,
              ability: {
                id: "arch-ability",
                name: "지휘",
                description: "골드 +1",
                cost: 0,
                effects: [{ type: "GAIN_GOLD", amount: 1 }],
              },
            },
          })),
        };
        window.__publishArch();
      });
      await page.waitForTimeout(100);
      await page.evaluate(async () => {
        const { applyEffect, generateCardInstance } =
          await import("/src/game/index.ts");
        const source = generateCardInstance(
          window.__arch.cardPool.find((d) => d.cardType === "WRESTLER"),
          { instanceId: "arch-source" },
        );
        window.__arch = applyEffect(window.__arch, "player-1", source, {
          type: "STRUCTURED",
          action: "DAMAGE",
          target: {
            zone: "PLAYER",
            owner: "SELF",
            selection: "SELF",
            count: 1,
          },
          values: { amount: 1 },
        });
        window.__publishArch();
      });
      await page.waitForFunction(
        () =>
          document.querySelector(".ko-player-champion .ko-portrait-health")
            .dataset.low === "true",
      );
      assert.match(
        await page
          .locator(".ko-player-champion .ko-portrait-health")
          .getAttribute("aria-label"),
        /체력 5 /,
      );
      await page.waitForTimeout(700);
      await page.evaluate(async () => {
        const { executeAction } = await import("/src/game/index.ts");
        const result = executeAction(window.__arch, {
          type: "USE_CHAMPION_ABILITY",
          playerId: "player-1",
        });
        if (!result.success) throw Error(result.message);
        window.__arch = result.state;
        window.__publishArch();
      });
      await page.waitForFunction(
        () =>
          document.querySelector(".ko-player-champion .ko-battle-actor").dataset
            .reaction === "ATTACK",
      );
      await page.waitForTimeout(1000);
      await page.evaluate(async () => {
        const { applyEffect, generateCardInstance } =
          await import("/src/game/index.ts");
        const source = generateCardInstance(
          window.__arch.cardPool.find((d) => d.cardType === "WRESTLER"),
          { instanceId: "arch-finisher" },
        );
        window.__arch = applyEffect(window.__arch, "player-1", source, {
          type: "DAMAGE_OPPONENT_CHAMPION",
          amount: 100,
        });
        window.__publishArch();
      });
      const shards = page.getByTestId("champion-hud-shatter");
      await shards.waitFor({ state: "attached" });
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="champion-hud-shatter"]').dataset
            .phase === "burst",
      );
      const ko = await page.evaluate(() => {
        const surface = document.querySelector(
            ".ko-opponent-champion .ko-battle-actor",
          ),
          burst = document.querySelector(
            '[data-testid="champion-hud-shatter"]',
          ),
          target = document.querySelector(".ko-opponent-champion");
        return {
          surface: surface.getBoundingClientRect().toJSON(),
          burst: burst.getBoundingClientRect().toJSON(),
          target: target.getBoundingClientRect().toJSON(),
          apertureMask: getComputedStyle(
            target.querySelector(".ko-portrait-window"),
          ).maskImage,
          shardMask: getComputedStyle(burst.querySelector(".ko-hud-shard"))
            .maskImage,
          healthVisible: getComputedStyle(
            target.querySelector(".ko-portrait-health"),
          ).visibility,
          mirrored: new DOMMatrix(getComputedStyle(burst).transform).a < 0,
        };
      });
      assert.ok(Math.abs(ko.surface.width - ko.burst.width) < 1);
      assert.ok(Math.abs(ko.surface.height - ko.burst.height) < 1);
      assert.ok(ko.burst.height < ko.target.height);
      assert.equal(ko.healthVisible, "visible");
      assert.equal(ko.mirrored, true);
      assert.ok(ko.apertureMask.includes("data:image/svg+xml"));
      assert.equal(ko.apertureMask, ko.shardMask);
      if (width === 390)
        await page.screenshot({ path: out + "/ko-mobile.png", fullPage: true });
      results.push({ width, height, ...layout, ko });
    } else results.push({ width, height, ...layout });
    if (width === 390) {
      await page
        .locator("[data-preview-tools]")
        .evaluate((n) => (n.style.display = ""));
      await page
        .getByRole("button", { name: "기존 / 블랙·골드", exact: true })
        .click();
      assert.equal(await page.locator(".ko-portrait-arch").count(), 0);
      assert.match(
        await page.locator(".ko-player-stats").innerText(),
        /챔피언 체력/,
      );
    }
    assert.deepEqual(errors, []);
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(out + "/actions-390.webm");
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(
    "PASS 7 viewport frames/health grouping; real damage/ability/KO at mobile and desktop; mirrored shatter aperture and visible chrome",
  );
} finally {
  await browser.close();
}
