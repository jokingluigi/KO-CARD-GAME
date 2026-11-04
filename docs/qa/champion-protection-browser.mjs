/** Shared in-game HUD + actual engine effects; isolated local state, no production writes. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/champion-protection";
await mkdir(out, { recursive: true });
const snapshot = JSON.parse(
  await readFile(
    process.env.KO_FINISHER_ART_DATA ??
      "artifacts/ko-game/qa/art-direction-data.json",
    "utf8",
  ),
);
const art = process.env.KO_FINISHER_ART_DATA
  ? snapshot
  : {
      cards: snapshot.cards.cards.filter((c) => c.name === "MPG").slice(0, 1),
      champions: snapshot.champions.champions.filter((c) =>
        ["챔피언 퍼플레인", "챔피언 피 스타 세븐"].includes(c.name),
      ),
    };
const files = new Map();
for (const r of [...art.cards, ...art.champions]) {
  const url = "/qa/protection-art/" + r.id + ".png";
  files.set(
    url,
    execFileSync(
      "curl",
      [
        "--fail",
        "--silent",
        "--show-error",
        "--max-time",
        "30",
        new URL(r.imageUrl, "https://ko-card-game-vr69.onrender.com").href,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    ),
  );
  r.testImageUrl = url;
}
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height, reduced] of [
    [390, 844, false],
    [844, 390, false],
    [1440, 900, false],
    [390, 844, true],
  ]) {
    const p = await b.newPage({
        viewport: { width, height },
        reducedMotion: reduced ? "reduce" : "no-preference",
        isMobile: width === 390,
        hasTouch: width === 390,
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", (r) =>
      r.fulfill({ json: { cards: [], frames: [] } }),
    );
    await p.route("**/qa/protection-art/*", (r) =>
      r.fulfill({
        body: files.get(new URL(r.request().url()).pathname),
        contentType: "image/png",
      }),
    );
    await p.addInitScript(() => {
      localStorage.setItem("ko-match-coach-v1", "done");
      HTMLMediaElement.prototype.play = () => Promise.resolve();
      HTMLMediaElement.prototype.pause = () => {};
    });
    await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await p.locator(".ko-game-shell").waitFor();
    await p.evaluate(async (art) => {
      const { boardFixture, definitions } =
        await import("/qa/black-gold-fixture.ts");
      const { generateCardInstance } =
        await import("/src/game/cards/generation.ts");
      const { applyEffect } =
        await import("/src/game/effects/effect-engine.ts");
      const { destroyCard } = await import("/src/game/engine/destroy-card.ts");
      const token = {
        ...definitions.find(
          (d) => d.cardType === "WRESTLER" && d.rarity === "CHAMPION",
        ),
        id: "qa-ward-token",
        name: "보호 토큰 (검증용)",
        cost: 0,
        health: 5,
        isToken: true,
        isChampionToken: true,
        abilities: [],
        keywords: [],
        effectConfig: {},
        rulesText: "",
      };
      const defs = [...definitions, token],
        s = boardFixture();
      s.events = [];
      s.cardPool = defs;
      s.targetingState = null;
      s.openingMulligan = false;
      for (const d of defs) {
        const a = art.cards.find((c) => c.id === d.id);
        if (a) d.imageUrl = a.testImageUrl;
      }
      for (const pl of s.players) {
        pl.champion.quest = null;
        const a = art.champions.find((c) => c.id === pl.champion.id);
        if (a) pl.champion.imageUrl = a.testImageUrl;
        pl.board = [null, null, null, null];
      }
      window.wardState = s;
      window.wardDefs = defs;
      window.wardShow = () =>
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: { state: window.wardState, definitions: defs },
          }),
        );
      window.wardSummon = (id) => {
        const pl = window.wardState.players.find((p) => p.id === id);
        const src = pl.hand[0] ?? generateCardInstance(defs[0]);
        window.wardState = applyEffect(window.wardState, id, src, {
          type: "STRUCTURED",
          action: "SUMMON",
          values: { definitionRef: { id: token.id }, count: 1 },
        });
        window.wardShow();
      };
      window.wardRemove = (id, index = 0) => {
        const pl = window.wardState.players.find((p) => p.id === id),
          card = pl.board.filter(Boolean)[index];
        const removed = destroyCard(window.wardState, id, card.instanceId);
        if (!removed.success) throw Error(removed.message);
        window.wardState = removed.state;
        window.wardShow();
      };
      window.wardShow();
    }, art);
    const wards = p.getByTestId("champion-protection");
    assert.equal(await wards.count(), 0);
    if (!reduced) await p.screenshot({ path: `${out}/before-${width}.png` });
    await p.evaluate(() => {
      window.wardSummon("player-1");
      window.wardSummon("player-2");
    });
    await wards.first().waitFor();
    assert.equal(await wards.count(), 2);
    for (const ward of await wards.all()) {
      await ward.getByText("무적", { exact: true }).waitFor();
      assert.equal(
        await ward.evaluate((n) => getComputedStyle(n).pointerEvents),
        "none",
      );
      if (reduced)
        assert.equal(
          await ward.evaluate((n) => getComputedStyle(n).animationName),
          "none",
        );
      const r = await ward.boundingBox();
      assert.ok(
        r.width > 60 &&
          r.height > 40 &&
          r.x >= 0 &&
          r.y >= 0 &&
          r.x + r.width <= width &&
          r.y + r.height <= height,
      );
    }
    await p.locator(".ko-cinematic").waitFor({ state: "hidden" });
    await p.screenshot({
      path: `${out}/protected-${width}${reduced ? "-reduced" : ""}.png`,
    });
    // The decoration must not capture a real hand-selection tap.
    await p
      .locator(".ko-player-hand [data-card-definition]")
      .first()
      .click({ position: { x: 25, y: 35 } });
    assert.equal(
      await p.locator(".ko-game-stage").getAttribute("data-hand-selection"),
      "true",
    );
    await p.evaluate(() => window.wardSummon("player-1"));
    await p.evaluate(() => window.wardRemove("player-1"));
    assert.equal(await wards.count(), 2); // One allied token still protects the body.
    await p.evaluate(() => window.wardRemove("player-1"));
    await p.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="champion-protection"]')
          .length === 1,
    );
    assert.equal(
      await p
        .locator(".ko-player-champion")
        .getAttribute("data-champion-protected"),
      "false",
    );
    assert.equal(
      await p
        .locator(".ko-opponent-champion")
        .getAttribute("data-champion-protected"),
      "true",
    );
    await p.evaluate(() => window.wardRemove("player-2"));
    await p.waitForFunction(
      () => !document.querySelector('[data-testid="champion-protection"]'),
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      reduced,
      bothSides: true,
      engineSummonAndDestroy: true,
      lastTokenRemoval: true,
      handTap: true,
      overlayWithinViewport: true,
      errors,
    });
    await p.context().close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
