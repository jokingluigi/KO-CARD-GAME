/** Shared real battle component + accepted engine actions, isolated QA fixtures only. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "docs/qa/20261110-finisher-choices";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width !== 1440,
      isMobile: width !== 1440,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (r) =>
      r.fulfill({ json: { cards: [], champions: [], frames: [] } }),
    );
    await page.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await page.locator(".ko-game-shell").waitFor();
    await page.evaluate(async () => {
      const { createInitialGameState } =
        await import("/src/game/engine/create-initial-game-state.ts");
      const { generateCardInstance } =
        await import("/src/game/cards/generation.ts");
      const { executeAction } =
        await import("/src/game/actions/engine-actions.ts");
      const unit = {
        id: "qa-select-source",
        name: "검증 선수",
        cardType: "WRESTLER",
        rarity: "NORMAL",
        cost: 1,
        attack: 1,
        health: 3,
        keywords: [],
        abilities: [],
        rulesText: "",
      };
      const token = {
        ...unit,
        id: "qa-finish-a",
        name: "검증용 피니셔 A",
        cardType: "TECHNIQUE",
        rarity: "CHAMPION",
        isChampionToken: true,
        isToken: true,
        rulesText: "피니셔 선택 및 지급 검증용 임시 카드입니다.",
      };
      const other = { ...token, id: "qa-finish-b", name: "검증용 피니셔 B" };
      const s = createInitialGameState();
      Object.assign(s, {
        status: "IN_PROGRESS",
        turn: 3,
        activePlayerId: "player-1",
        events: [],
        cardPool: [unit, token, other],
      });
      for (const p of s.players)
        Object.assign(p, {
          deck: [],
          hand: [],
          board: [null, null, null, null],
          currentGold: 6,
        });
      s.players[1].champion.quest = null;
      s.players[0].champion.quest = {
        id: "qa",
        name: "피니셔 준비",
        description: "검증",
        requiredProgress: 1,
        trackedEvent: "CARD_PLAYED",
        reward: { type: "GAIN_GOLD", amount: 0 },
        finisherChoices: [
          {
            id: "a",
            name: "첫 번째 선택지",
            description: "선수 카드를 사용하세요.",
            condition: {
              type: "EVENT",
              event: "CARD_PLAYED",
              owner: "SELF",
              required: 1,
            },
            cardDefinitionId: token.id,
          },
          {
            id: "b",
            name: "두 번째 선택지",
            description: "선수가 필드에 등장해야 합니다.",
            condition: {
              type: "EVENT",
              event: "ENTER_FIELD",
              owner: "SELF",
              required: 1,
            },
            cardDefinitionId: other.id,
          },
        ],
      };
      s.players[0].hand = [
        generateCardInstance(unit, { instanceId: "source" }),
      ];
      const r = executeAction(s, {
        type: "PLAY_WRESTLER",
        playerId: "player-1",
        cardInstanceId: "source",
        boardSlot: 0,
      });
      if (!r.success) throw Error(r.message);
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", {
          detail: { state: r.state, definitions: [unit, token, other] },
        }),
      );
    });
    const dialog = page.getByRole("dialog");
    await dialog.getByText("피니셔를 선택하세요", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "선택한 피니셔 확정" })
      .isDisabled()
      .then((disabled) => assert.ok(disabled));
    const choice = dialog
      .getByRole("button")
      .filter({ hasText: "두 번째 선택지" });
    if (width === 1440) await choice.click();
    else await choice.tap();
    assert.equal(await choice.getAttribute("aria-pressed"), "true");
    const bounds = await page
      .getByRole("button", { name: "선택한 피니셔 확정" })
      .boundingBox();
    assert.ok(bounds.height >= 44);
    await page.screenshot({
      path: `${out}/selection-${width}x${height}.png`,
      fullPage: false,
    });
    if (width === 1440)
      await page.getByRole("button", { name: "선택한 피니셔 확정" }).click();
    else await page.getByRole("button", { name: "선택한 피니셔 확정" }).tap();
    await page.waitForFunction(
      () =>
        JSON.parse(
          document.querySelector('[data-testid="state-json"]').textContent,
        ).players[0].champion.selectedFinisherId === "b",
    );
    const final = await page
      .getByTestId("state-json")
      .textContent()
      .then(JSON.parse);
    assert.equal(final.players[0].hand[0].definitionId, "qa-finish-b");
    assert.equal(final.targetingState, undefined);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      sharedBattleUI: true,
      realEngineCardPlay: true,
      confirmation: true,
      touch: width !== 1440,
      selectedFinisherId: "b",
      pageErrors: errors,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  out + "/browser-results.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
