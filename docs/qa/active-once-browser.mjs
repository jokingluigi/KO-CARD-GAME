import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/active-once";
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [740, 360],
    [1440, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (r) =>
      r.fulfill({ json: { cards: [], frames: [] } }),
    );
    await page.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await page.locator(".ko-game-shell").waitFor();
    await page
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    await page.evaluate(async () => {
      const { boardFixture, definitions } =
        await import("/qa/black-gold-fixture.ts");
      const { generateCardInstance } = await import("/src/game/index.ts");
      const d = definitions.find((c) => c.name === "그레이트 챤");
      if (!d) throw Error("Missing fixture active");
      const s = boardFixture();
      s.gameId = crypto.randomUUID();
      s.events = [];
      s.players[0].hand = [];
      s.players[0].board = [
        {
          ...generateCardInstance(d, { instanceId: "once-active-ui" }),
          boardSlot: 0,
          enteredThisTurn: false,
        },
        null,
        null,
        null,
      ];
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", {
          detail: { state: s, definitions },
        }),
      );
    });
    const button = page.locator(".ko-card-active-button");
    await button.waitFor();
    await page
      .getByTestId("preview-busy")
      .filter({ hasText: "false" })
      .waitFor();
    assert.equal(await button.isEnabled(), true);
    await button.click();
    await page.waitForFunction(
      () =>
        JSON.parse(
          document.querySelector("[data-testid=state-json]").textContent,
        ).players[0].board[0].activeUsed === true,
    );
    assert.equal(await button.textContent(), "사용 완료");
    assert.equal(await button.isDisabled(), true);
    await page.evaluate(async () => {
      const { executeAction } = await import("/src/game/index.ts");
      let s = JSON.parse(
        document.querySelector("[data-testid=state-json]").textContent,
      );
      for (let i = 0; i < 2; i++) {
        const r = executeAction(s, {
          type: "END_TURN",
          playerId: s.activePlayerId,
        });
        if (!r.success) throw Error(r.message);
        s = r.state;
      }
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", {
          detail: { state: JSON.parse(JSON.stringify(s)) },
        }),
      );
    });
    await page.waitForTimeout(150);
    assert.equal(await button.isDisabled(), true);
    assert.match(await button.getAttribute("title"), /총 1회/);
    const s = await page
      .getByTestId("state-json")
      .textContent()
      .then(JSON.parse);
    assert.equal(s.players[0].board[0].activeUsed, true);
    assert.equal(s.players[0].board[0].activeUsedThisTurn, false);
    await page.screenshot({ path: `${out}/used-next-turn-${width}.png` });
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      actualActiveUse: true,
      usedLabel: true,
      disabledAcrossTurnsAndReload: true,
      errors,
    });
    await page.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
