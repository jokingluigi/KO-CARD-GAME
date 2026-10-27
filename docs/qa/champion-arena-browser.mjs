import assert from "node:assert/strict";
import { chromium } from "./black-gold-playwright.mjs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const b = await chromium.launch({ headless: true });
const out = "qa-results/arena-composition";
await mkdir(out, { recursive: true });
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
    const p = await b.newPage({
      viewport: { width, height },
      ...(width === 390
        ? { recordVideo: { dir: out + "/video", size: { width, height } } }
        : {}),
    });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", async (r) => {
      try {
        await r.fulfill({
          body: await readFile(
            "/tmp/ko-board-image-cache/" +
              createHash("sha256")
                .update(new URL(r.request().url()).pathname)
                .digest("hex"),
          ),
          contentType: "image/png",
        });
      } catch {
        await r.fulfill({ json: { cards: [], frames: [] } });
      }
    });
    await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await p.locator(".ko-game-shell").waitFor();
    await p
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    await p.evaluate(async () => {
      const { boardFixture, definitions } =
        await import("/qa/black-gold-fixture.ts");
      const { generateCardInstance } = await import("/src/game/index.ts");
      const state = boardFixture();
      state.players[0].hand = ["리버덩크", "보드바", "퀘스쳔", "RM우디르"].map(
        (name, i) =>
          generateCardInstance(
            definitions.find((d) => d.name === name),
            { instanceId: "arena-hand-" + i },
          ),
      );
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", { detail: { state, definitions } }),
      );
    });
    await p.waitForTimeout(1000);
    const layout = await p.evaluate(() => {
      const box = (s) =>
        document.querySelector(s).getBoundingClientRect().toJSON();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        self: box(".ko-player-champion"),
        opponent: box(".ko-opponent-champion"),
        field: box(".ko-player-board-row"),
        hand: box(".ko-player-hand"),
        stats: box(".ko-player-stats"),
      };
    });
    assert.equal(layout.overflow, false);
    assert.deepEqual(errors, []);
    assert.ok(
      layout.self.right <= layout.field.left ||
        layout.self.top >= layout.field.bottom,
      "own actor overlaps field",
    );
    assert.ok(
      layout.opponent.left >= layout.field.right ||
        layout.opponent.bottom <= layout.field.top,
      "enemy actor overlaps field",
    );
    assert.ok(layout.hand.top >= layout.field.bottom, "hand overlaps field");
    results.push({ width, height, ...layout, errors });
    await p.screenshot({ path: out + "/" + width + ".png", fullPage: true });
    if (width === 390 || width === 1440) {
      await p.evaluate(async () => {
        const { boardFixture, definitions } =
          await import("/qa/black-gold-fixture.ts");
        const { generateCardInstance } = await import("/src/game/index.ts");
        const state = boardFixture();
        state.events = [];
        state.players[1].board = [null, null, null, null];
        state.players[0].board = state.players[0].board.map((c, i) =>
          i === 0 ? c : null,
        );
        state.players[0].hand = [
          generateCardInstance(
            definitions.find((d) => d.name === "리버덩크"),
            { instanceId: "arena-summon" },
          ),
        ];
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: { state, definitions },
          }),
        );
      });
      const before = JSON.parse(
        await p.getByTestId("state-json").textContent(),
      );
      const attacker = p
        .locator(".ko-player-board-row .ko-board-slot.group")
        .first();
      await attacker.click({ position: { x: 25, y: 60 } });
      await p
        .getByRole("button", { name: "상대 챔피언 대상", exact: true })
        .click({ position: { x: 60, y: 60 } });
      await p.waitForFunction(
        (h) =>
          JSON.parse(
            document.querySelector('[data-testid="state-json"]').textContent,
          ).players[1].health < h,
        before.players[1].health,
      );
      await p.waitForFunction(
        () =>
          document.querySelector('[data-testid="preview-busy"]').textContent ===
          "false",
      );
      await p.waitForTimeout(1000);
      await p
        .locator(".ko-hand-card")
        .first()
        .click({ position: { x: 25, y: 60 } });
      await p
        .getByRole("button", { name: "2구역에 카드 배치", exact: true })
        .click();
      await p.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector('[data-testid="state-json"]').textContent,
          ).players[0].board[1]?.instanceId === "arena-summon",
      );
      results.at(-1).pointerAttackAndSummon = true;
    }
    const video = p.video();
    await p.close();
    if (video) await video.saveAs(out + "/pointer-390.webm");
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(
    JSON.stringify(
      results.map(
        ({ width, height, overflow, errors, pointerAttackAndSummon }) => ({
          width,
          height,
          overflow,
          errors,
          pointerAttackAndSummon,
        }),
      ),
    ),
  );
} finally {
  await b.close();
}
