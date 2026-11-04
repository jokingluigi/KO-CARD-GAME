/** Real shared battle controls and engine; isolated local battle, not a network match. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const records = JSON.parse(
  await readFile("docs/qa/fixtures/20261104-entry-lethal-damage.json", "utf8"),
);
const out = "qa-results/entry-lethal-damage";
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  results = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    const ctx = await browser.newContext({
        viewport,
        recordVideo: { dir: out + "/raw", size: viewport },
      }),
      page = await ctx.newPage();
    await page.route("**/api/**", (r) =>
      r.fulfill({ json: { cards: [], frames: [] } }),
    );
    await page.addInitScript(() => {
      localStorage.setItem("ko-match-coach-v1", "done");
      HTMLMediaElement.prototype.play = () => Promise.resolve();
      HTMLMediaElement.prototype.pause = () => {};
    });
    await page.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await page.locator(".ko-game-shell").waitFor();
    const before = await page.evaluate(async (records) => {
      const { boardFixture } = await import("/qa/black-gold-fixture.ts");
      const { cardRecordToDefinition } =
        await import("/src/game/cards/published-cards.ts");
      const { generateCardInstance } =
        await import("/src/game/cards/generation.ts");
      const { executeAction } =
        await import("/src/game/actions/engine-actions.ts");
      const defs = records.map(cardRecordToDefinition),
        collector = defs.find((d) => d.name === "고통 수집가"),
        hel = defs.find((d) => d.name === "헬뻑");
      const victim = {
        id: "qa-entry-victim",
        name: "진입 피해 검증 (임시)",
        cardType: "WRESTLER",
        rarity: "NORMAL",
        cost: 1,
        attack: 1,
        health: 1,
        rulesText: "헬뻑의 진입 피해로 리타이어하는 검증용 선수",
        keywords: [],
        abilities: [],
      };
      defs.push(victim);
      let s = boardFixture();
      s.events = [];
      s.turn = 3;
      s.status = "IN_PROGRESS";
      s.activePlayerId = "player-1";
      s.openingMulligan = false;
      s.cardPool = defs;
      s.targetingState = null;
      for (const p of s.players) {
        p.currentGold = 99;
        p.hand = [];
        p.board = [null, null, null, null];
        p.graveyard = [];
        p.champion.quest = null;
      }
      for (const [slot, d, id] of [
        [0, collector, "collector"],
        [1, hel, "hell"],
      ]) {
        s.players[0].hand.push(generateCardInstance(d, { instanceId: id }));
        const r = executeAction(s, {
          type: "PLAY_WRESTLER",
          playerId: "player-1",
          cardInstanceId: id,
          boardSlot: slot,
        });
        if (!r.success) throw Error(r.message);
        s = r.state;
      }
      s.players[0].hand = [
        generateCardInstance(victim, { instanceId: "victim" }),
      ];
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", {
          detail: { state: s, definitions: defs },
        }),
      );
      return s.players[0].board[0].currentAttack;
    }, records);
    await page.screenshot({ path: out + "/before-" + viewport.width + ".png" });
    await page
      .locator('.ko-player-hand [data-card-definition="qa-entry-victim"]')
      .click({ position: { x: 25, y: 35 } });
    await page
      .getByRole("button", { name: "3구역에 카드 배치", exact: true })
      .click();
    await page.waitForFunction((before) => {
      const s = JSON.parse(
        document.querySelector('[data-testid="state-json"]').textContent,
      );
      return (
        s.players[0].graveyard.some((c) => c.instanceId === "victim") &&
        s.players[0].board[0].currentAttack === before + 1
      );
    }, before);
    const after = JSON.parse(
      await page.getByTestId("state-json").textContent(),
    );
    assert.equal(
      after.players[0].graveyard.filter((c) => c.instanceId === "victim")
        .length,
      1,
    );
    assert.equal(after.players[0].hand.length, 0);
    await page.screenshot({ path: out + "/after-" + viewport.width + ".png" });
    results.push({
      viewport,
      attackBefore: before,
      attackAfter: after.players[0].board[0].currentAttack,
      victimRetiredExactlyOnce: true,
      realControlInput: true,
      networkMatch: false,
    });
    const video = page.video();
    await ctx.close();
    if (viewport.width === 390)
      await copyFile(await video.path(), out + "/mobile.webm");
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
