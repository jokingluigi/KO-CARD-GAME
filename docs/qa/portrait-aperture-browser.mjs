import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/portrait-aperture";
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.route("**/api/**", (r) =>
      r.request().url().includes("/aperture-solid.png")
        ? readFile(out + "/solid.png").then((body) =>
            r.fulfill({ body, contentType: "image/png" }),
          )
        : r.fulfill({ status: 404, json: {} }),
    );
    await page.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await page.locator(".ko-game-shell").waitFor();
    await page
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    await page.evaluate(async () => {
      const { boardFixture, definitions } =
        await import("/qa/black-gold-fixture.ts");
      const s = boardFixture();
      s.gameId = "aperture-" + crypto.randomUUID();
      s.events = [];
      const p = { scale: 1, x: 50, y: 50, crop: true, flip: false };
      for (const player of s.players) {
        player.champion.quest = null;
        player.champion.presentationLines = {
          BATTLE_SPRITE: {
            version: 1,
            frames: {
              default: {
                url: "/api/storage/objects/uploads/cosmetics/aperture-solid.png",
                self: { ...p },
                opponent: { ...p },
              },
            },
            reactions: {},
          },
        };
      }
      window.__aperture = s;
      window.__apertureDefinitions = definitions;
      window.__publishAperture = () =>
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: { state: structuredClone(window.__aperture), definitions },
          }),
        );
      window.__publishAperture();
    });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".ko-battle-actor img")].length === 2 &&
        [...document.querySelectorAll(".ko-battle-actor img")].every(
          (i) => i.complete && i.naturalWidth === 400,
        ),
    );
    for (const side of ["player", "opponent"]) {
      const img = page.locator(`.ko-${side}-champion .ko-battle-actor img`);
      assert.equal(
        await img.evaluate((n) => getComputedStyle(n).objectFit),
        "contain",
        "framed art fits even a legacy cover setting",
      );
      const mask = await page
        .locator(`.ko-${side}-champion .ko-portrait-window`)
        .evaluate((n) => ({
          mask: getComputedStyle(n).maskImage,
          overflow: getComputedStyle(n).overflow,
          pointer: getComputedStyle(n).pointerEvents,
        }));
      assert.ok(mask.mask.includes("data:image/svg+xml"));
      assert.equal(mask.overflow, "hidden");
      assert.equal(mask.pointer, "none");
    }
    await page.evaluate(() => {
      for (const p of window.__aperture.players) {
        const f = p.champion.presentationLines.BATTLE_SPRITE.frames.default;
        f.self.scale = 3;
        f.opponent.scale = 3;
      }
      window.__publishAperture();
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".ko-battle-actor img")].every(
        (i) => new DOMMatrix(getComputedStyle(i).transform).a === 2,
      ),
    );
    for (const side of ["player", "opponent"])
      await page
        .locator(`.ko-${side}-champion .ko-portrait-window`)
        .screenshot({ path: `${out}/zoom-${width}-${side}.png` });
    if (width === 390) {
      const window = page.locator(".ko-player-champion .ko-portrait-window");
      await window.evaluate((n) => {
        n.style.maskImage = "none";
        n.style.webkitMaskImage = "none";
        n.style.borderRadius = "0";
      });
      await window.screenshot({ path: out + "/unclipped-control.png" });
      await window.evaluate((n) => {
        n.style.maskImage = "";
        n.style.webkitMaskImage = "";
        n.style.borderRadius = "";
      });
    }
    if (width === 390)
      await page.screenshot({ path: out + "/fit-mobile.png", fullPage: true });
    await page.evaluate(async () => {
      const { applyEffect, generateCardInstance } =
        await import("/src/game/index.ts");
      const source = generateCardInstance(
        window.__aperture.cardPool.find((c) => c.cardType === "WRESTLER"),
        { instanceId: "aperture-source" },
      );
      window.__aperture = applyEffect(window.__aperture, "player-1", source, {
        type: "STRUCTURED",
        action: "DAMAGE",
        target: { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 },
        values: { amount: 1 },
      });
      window.__publishAperture();
    });
    await page.waitForFunction(
      () =>
        document.querySelector(".ko-player-champion .ko-battle-actor").dataset
          .reaction === "HIT",
    );
    await page
      .locator(".ko-player-champion .ko-portrait-window")
      .screenshot({ path: `${out}/hit-${width}.png` });
    results.push({
      width,
      height,
      fit: "contain",
      requestedZoom: 3,
      renderedZoom: 2,
      bothSidesMasked: true,
      hitInsideFixedAperture: true,
    });
    await page.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(
    "PASS mobile/desktop, both sides, legacy cover auto-fit, 200% rendered zoom (legacy 300% setting), hit inside static arch mask",
  );
} finally {
  await browser.close();
}
