import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/strong-champion-impact";
await mkdir(out, { recursive: true });
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const c = await b.newContext({
      viewport: { width, height },
      ...(width === 390
        ? { recordVideo: { dir: out + "/video", size: { width, height } } }
        : {}),
    });
    await c.addInitScript(() =>
      localStorage.setItem("ko-match-screen-shake", "FULL"),
    );
    const p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", async (r) => {
      const m = r
        .request()
        .url()
        .match(/strong-(default|hurt|heavy_hurt|low)\.png/);
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
      const { generateCardInstance, applyEffect } =
        await import("/src/game/index.ts");
      const d = {
        id: "strong-test",
        name: "QA damage source",
        cardType: "WRESTLER",
        cost: 1,
        attack: 1,
        health: 1,
        rarity: "NORMAL",
        rulesText: "",
        keywords: [],
        abilities: [],
      };
      const placement = { scale: 1, x: 50, y: 40, crop: false, flip: false };
      window.__strongLoad = (health = 30) => {
        const s = boardFixture();
        s.gameId = "strong-" + crypto.randomUUID();
        s.events = [];
        s.status = "IN_PROGRESS";
        s.activePlayerId = "player-1";
        s.cardPool = [d];
        const cosmetics = {};
        for (const pl of s.players) {
          pl.health = health;
          pl.maxHealth = 30;
          pl.board = [null, null, null, null];
          pl.hand = [];
          pl.champion.maxHealth = 30;
          pl.champion.quest = null;
          pl.champion.questCompleted = false;
          cosmetics[pl.id] = {
            cardBack: null,
            emotes: [null, null, null, null],
            skins: {
              ["champion:" + pl.champion.id]: {
                id: "strong-skin-" + pl.id,
                type: "CHAMPION_SKIN",
                targetId: pl.champion.id,
                name: "QA strong skin",
                isActive: true,
                sortOrder: 0,
                imageAssets: {
                  __battle: JSON.stringify({
                    version: 1,
                    frames: Object.fromEntries(
                      ["default", "hurt", "heavy_hurt", "low"].map((key) => [
                        key,
                        {
                          url:
                            "/api/storage/objects/uploads/cosmetics/strong-" +
                            key +
                            ".png",
                          self: placement,
                          opponent: { ...placement, flip: true },
                        },
                      ]),
                    ),
                    reactions: {},
                  }),
                },
              },
            },
          };
        }
        window.__strongState = s;
        window.__strongCosmetics = cosmetics;
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: { state: s, definitions: [d], cosmetics },
          }),
        );
      };
      window.__strongHit = (amount) => {
        const s = window.__strongState;
        const n = applyEffect(
          s,
          "player-2",
          generateCardInstance(d, { instanceId: "strong-source" }),
          { type: "DAMAGE_OPPONENT_CHAMPION", amount },
        );
        window.__strongState = n;
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: {
              state: n,
              definitions: [d],
              cosmetics: window.__strongCosmetics,
            },
          }),
        );
      };
      window.__strongSample = (frames, hit) =>
        new Promise((resolve) => {
          let count = 0;
          const values = [];
          const loop = () => {
            const pose = document.querySelector(
                ".ko-player-champion .ko-sprite-pose",
              ),
              breath = document.querySelector(
                ".ko-player-champion .ko-sprite-breath",
              ),
              stage = document.querySelector(".ko-game-stage"),
              ps = getComputedStyle(pose),
              bs = getComputedStyle(breath),
              ss = getComputedStyle(stage),
              m = new DOMMatrix(
                ps.transform === "none" ? undefined : ps.transform,
              ),
              bm = new DOMMatrix(
                bs.transform === "none" ? undefined : bs.transform,
              );
            const t =
              ss.translate === "none"
                ? [0, 0]
                : ss.translate.split(" ").map(parseFloat);
            values.push({
              body: Math.hypot(m.m41, m.m42),
              breath: bm.m42,
              camera: Math.hypot(t[0], t[1] || 0),
            });
            if (++count < frames) requestAnimationFrame(loop);
            else
              resolve({
                body: Math.max(...values.map((x) => x.body)),
                camera: Math.max(...values.map((x) => x.camera)),
                breathRange:
                  Math.max(...values.map((x) => x.breath)) -
                  Math.min(...values.map((x) => x.breath)),
                frames: count,
              });
          };
          requestAnimationFrame(loop);
          if (hit !== undefined) window.__strongHit(hit);
        });
    });
    async function load(h = 30) {
      await p.evaluate((h) => window.__strongLoad(h), h);
      await p.waitForTimeout(100);
    }
    await load();
    const breath = await p.evaluate(() => window.__strongSample(300));
    assert.ok(breath.breathRange > 3, "idle breathing visible");
    await load(5);
    const low = await p.evaluate(() => window.__strongSample(330));
    assert.ok(low.breathRange > 2, "low breathing visible");
    assert.ok(low.breathRange < breath.breathRange);
    const damage = [];
    for (const amount of [0, 1, 2, 4, 5, 8, 12]) {
      await load();
      const sample = await p.evaluate(
        (n) => window.__strongSample(48, n),
        amount,
      );
      const hp = JSON.parse(await p.getByTestId("state-json").textContent())
        .players[0].health;
      assert.equal(hp, 30 - amount);
      if (amount === 0) {
        assert.equal(sample.body, 0);
        assert.equal(sample.camera, 0);
      } else {
        assert.ok(sample.body > 5);
        assert.ok(sample.camera > 10);
      }
      damage.push({ amount, ...sample });
      if (amount === 8)
        await p.screenshot({ path: `${out}/after-hit-${width}.png` });
    }
    const hit5 = damage.find((x) => x.amount === 5),
      hit1 = damage.find((x) => x.amount === 1),
      hit12 = damage.find((x) => x.amount === 12);
    assert.ok(hit5.body > hit1.body * 1.7);
    assert.ok(hit5.camera > hit1.camera * 2);
    assert.ok(hit12.camera > hit5.camera);
    await load();
    await p.evaluate(() => {
      localStorage.setItem("ko-match-screen-shake", "OFF");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "ko-match-screen-shake",
          newValue: "OFF",
        }),
      );
    });
    const off = await p.evaluate(() => window.__strongSample(48, 8));
    assert.equal(off.camera, 0);
    assert.ok(off.body > 10);
    await p.emulateMedia({ reducedMotion: "reduce" });
    await load();
    const reduced = await p.evaluate(() => window.__strongSample(48, 8));
    assert.equal(reduced.camera, 0);
    assert.equal(reduced.body, 0);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      breath,
      low,
      damage,
      off,
      reduced,
      physicalDevice: false,
    });
    console.log("PASS " + width, JSON.stringify(results.at(-1)));
    await c.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
} finally {
  await b.close();
}
