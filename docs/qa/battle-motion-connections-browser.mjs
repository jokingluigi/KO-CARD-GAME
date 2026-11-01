/** Common real battle component and engine; isolated fixture, not a live PvP match. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/battle-motion-connections";
await mkdir(out, { recursive: true });
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const p = await b.newPage({
        viewport: { width, height },
        recordVideo: { dir: out + "/video", size: { width, height } },
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", (r) =>
      r.fulfill({ json: { cards: [], frames: [] } }),
    );
    await p.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.resolve();
      localStorage.setItem("ko-match-coach-v1", "done");
    });
    await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await p.locator(".ko-game-shell").waitFor();
    await p
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    await p.evaluate(async () => {
      const { boardFixture, definitions } =
        await import("/qa/black-gold-fixture.ts");
      const s = boardFixture();
      s.gameId = "effect-motion-" + crypto.randomUUID();
      s.events = [];
      for (const pl of s.players)
        for (const c of pl.board)
          if (c) {
            c.keywords = [];
            c.abilities = [];
            c.currentHealth = 20;
            c.maxHealth = 20;
            c.armor = 0;
          }
      const source = s.players[0].board[0],
        definition = {
          ...definitions.find((d) => d.id === source.definitionId),
          abilities: [
            {
              trigger: "ACTIVE",
              effects: [
                {
                  type: "STRUCTURED",
                  action: "DAMAGE",
                  target: {
                    zone: "BOARD",
                    owner: "OPPONENT",
                    selection: "ALL",
                  },
                  values: { amount: 2 },
                },
              ],
            },
          ],
        };
      s.cardPool = [
        ...definitions.filter((d) => d.id !== definition.id),
        definition,
      ];
      window.motionConnectionState = s;
      window.motionConnectionDefs = s.cardPool;
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", {
          detail: { state: s, definitions: s.cardPool },
        }),
      );
    });
    await p.waitForTimeout(120);
    await p.evaluate(async () => {
      const { applyEffect } = await import("/src/game/index.ts");
      const s = window.motionConnectionState;
      const next = applyEffect(s, "player-1", s.players[0].board[0], {
        type: "STRUCTURED",
        action: "DAMAGE",
        target: { zone: "BOARD", owner: "OPPONENT", selection: "ALL" },
        values: { amount: 2 },
      });
      window.motionConnectionState = next;
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", {
          detail: { state: next, definitions: window.motionConnectionDefs },
        }),
      );
    });
    await p.locator("[data-effect-wave]").waitFor();
    assert.equal(await p.locator("[data-effect-wave] path").count(), 2);
    assert.deepEqual(
      await p.evaluate(() =>
        window.motionConnectionState.players[1].board
          .filter(Boolean)
          .map((c) => c.currentHealth),
      ),
      [18, 18],
    );
    const bounds = await p
      .locator("[data-effect-wave] path")
      .evaluateAll((ns) => ns.map((n) => n.getAttribute("d")));
    assert.ok(bounds.every((d) => d && !d.includes("NaN")));
    await p.screenshot({ path: `${out}/effect-links-${width}.png` });
    await p.locator("[data-effect-wave]").waitFor({ state: "detached" });
    await p.waitForTimeout(500);
    await p.evaluate(async () => {
      const { applyEffect } = await import("/src/game/index.ts");
      const s = window.motionConnectionState,
        next = applyEffect(s, "player-1", s.players[0].board[0], {
          type: "STRUCTURED",
          action: "DESTROY",
          target: { zone: "BOARD", owner: "OPPONENT", selection: "ALL" },
        });
      window.motionConnectionState = next;
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", {
          detail: { state: next, definitions: window.motionConnectionDefs },
        }),
      );
    });
    const slot = p.locator(".ko-opponent-board-row .ko-board-slot").first();
    await p.waitForFunction(
      () =>
        document
          .querySelector(".ko-opponent-board-row .ko-board-slot")
          ?.getAnimations().length > 0,
    );
    assert.equal(await slot.locator("[data-card-instance-id]").count(), 0);
    assert.equal(
      await slot.evaluate((n) => n.getAnimations()[0].effect.getTiming().delay),
      280,
    );
    await p.waitForTimeout(360);
    await p.screenshot({ path: `${out}/vacancy-${width}.png` });
    await p.waitForTimeout(350);
    assert.equal(await slot.evaluate((n) => n.getAnimations().length), 0);
    await p.setViewportSize({ width: height, height: width });
    await p.waitForTimeout(150);
    assert.equal(await p.locator("[data-effect-wave]").count(), 0);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      actualEngineMultiTargetDamage: true,
      actualTargetCount: 2,
      sourceToTargetLinks: true,
      confirmedDestroyVacancy: true,
      delayMs: 280,
      expiry: true,
      resizeCleanup: true,
      errors,
    });
    await p.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
