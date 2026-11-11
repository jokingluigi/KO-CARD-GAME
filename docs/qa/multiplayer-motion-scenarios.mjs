/** Real online-page actions -> actual authoritative service/isolated SQL DB. */
import assert from "node:assert/strict";
import { eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
import { generateCardInstance } from "../../artifacts/ko-game/src/game/cards/generation.ts";

export async function motionScenarios({
  f,
  service,
  runtime,
  own,
  opponent,
  out,
  width,
  baseCard,
  setRuntime,
}) {
  const state = structuredClone(runtime.state);
  const unit = {
    ...baseCard,
    id: "motion-unit",
    name: "동작 검증 선수",
    cardType: "WRESTLER",
    rarity: "NORMAL",
    cost: 1,
    attack: 2,
    health: 10,
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [],
    rulesText: "동작 검증용 임시 선수",
  };
  const spell = {
    ...unit,
    id: "motion-spell",
    name: "동시 소환 검증",
    cardType: "TECHNIQUE",
    rulesText: "선수 4장을 소환합니다.",
    abilities: [
      {
        trigger: "ACTIVE",
        effects: [
          {
            type: "STRUCTURED",
            action: "SUMMON",
            values: { definitionRef: { id: unit.id }, count: 4 },
          },
        ],
      },
    ],
  };
  state.cardPool = [...state.cardPool, unit, spell];
  state.events = [];
  state.activePlayerId = "PLAYER_ONE";
  state.status = "IN_PROGRESS";
  state.turn = 5;
  for (const [i, p] of state.players.entries()) {
    p.currentGold = 6;
    p.health = 20;
    p.maxHealth = 20;
    p.champion.quest = null;
    p.champion.questCompleted = false;
    p.champion.championTokenDefinitionId = null;
    p.championAbilityUsedThisTurn = false;
    p.hand = [];
    p.board = [null, null, null, null];
    p.graveyard = [];
    p.deck = Array.from({ length: 8 }, (_, j) =>
      generateCardInstance(unit, { instanceId: `motion-deck-${i}-${j}` }),
    );
  }
  state.players[0].hand = [
    {
      ...generateCardInstance(unit, { instanceId: "motion-generated-hand" }),
      isGenerated: true,
    },
    generateCardInstance(spell, { instanceId: "motion-cast" }),
  ];
  state.players[1].hand = [
    generateCardInstance(spell, { instanceId: "motion-opponent-cast" }),
  ];
  state.players[1].board[0] = {
    ...generateCardInstance(unit, { instanceId: "motion-enemy" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  await f.db
    .update(f.schema.onlineMatchesTable)
    .set({ serializedGameState: state })
    .where(eq(f.schema.onlineMatchesTable.id, runtime.matchId));
  service.cleanupMatchRuntime(runtime.matchId);
  runtime = await service.getRuntime(runtime.matchId);
  setRuntime(runtime);
  await own.reload();
  await opponent.reload();
  await own.locator(".ko-turn-end:not([disabled])").waitFor();
  await own.evaluate(() => {
    window.motionProbe = {
      ownCopyPeak: 0,
      summonPeak: 0,
      frameGaps: [],
      running: true,
      last: performance.now(),
    };
    const sample = (now) => {
      const p = window.motionProbe;
      if (!p.running) return;
      p.frameGaps.push(now - p.last);
      p.last = now;
      p.ownCopyPeak = Math.max(
        p.ownCopyPeak,
        document.querySelectorAll(
          '[data-play-instance="motion-generated-hand"]',
        ).length,
      );
      p.summonPeak = Math.max(
        p.summonPeak,
        document.querySelectorAll(".ko-summon-motion").length,
      );
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await own
    .locator('.ko-player-hand [data-card-definition="motion-unit"]')
    .click({ position: { x: 25, y: 60 } });
  await own
    .getByRole("button", { name: "1구역에 카드 배치", exact: true })
    .click();
  await own.waitForFunction(() =>
    document.querySelector('[data-play-instance="motion-generated-hand"]'),
  );
  await own.waitForFunction(
    () => !document.querySelector(".card-play-animation"),
  );
  assert.equal(
    runtime.state.players[0].board[0].instanceId,
    "motion-generated-hand",
  );
  const oneCopy = await own.evaluate(() => window.motionProbe.ownCopyPeak);
  assert.equal(oneCopy, 1);
  await own.locator(".ko-turn-end:not([disabled])").waitFor();
  await own
    .locator('.ko-player-hand [data-card-definition="motion-spell"]')
    .click({ position: { x: 25, y: 60 } });
  const started = performance.now();
  await own.getByRole("button", { name: "사용", exact: true }).click();
  await own.waitForFunction(
    () => document.querySelectorAll(".ko-summon-motion").length === 3,
  );
  await own.screenshot({ path: `${out}/concurrent-summons-${width}.png` });
  await own.waitForFunction(
    () => !document.querySelector(".card-play-animation"),
  );
  await own.locator(".ko-turn-end:not([disabled])").waitFor();
  const summonBatchMs = performance.now() - started;
  assert.equal(runtime.state.players[0].board.filter(Boolean).length, 4);
  await opponent.waitForFunction(
    () =>
      document.querySelectorAll(
        ".ko-opponent-board-row [data-card-instance-id]",
      ).length === 4,
  );
  async function endTurn(page, seat) {
    await page.locator(".ko-turn-end:not([disabled])").click();
    if (
      runtime.state.activePlayerId === seat &&
      /확정/.test(await page.locator(".ko-turn-end").getAttribute("aria-label"))
    )
      await page.locator(".ko-turn-end").click();
  }
  await endTurn(own, "PLAYER_ONE");
  await opponent.locator(".ko-turn-end:not([disabled])").waitFor();
  assert.equal(runtime.state.activePlayerId, "PLAYER_TWO");
  await opponent
    .locator('.ko-player-hand [data-card-definition="motion-spell"]')
    .click({ position: { x: 25, y: 60 } });
  await opponent.getByRole("button", { name: "사용", exact: true }).click();
  await own.waitForFunction(
    () => document.querySelectorAll(".ko-summon-motion").length === 3,
  );
  const ownConnection = [...runtime.connections].find(
    (c) => c.userId === "tutorial-user",
  );
  assert.ok(ownConnection);
  ownConnection.send({
    ...service.snapshotMessage(runtime, "tutorial-user"),
    type: "RESYNC_REQUIRED",
  });
  await own.waitForFunction(
    () => !document.querySelector(".card-play-animation"),
  );
  assert.equal(
    await own.locator(".ko-opponent-board-row [data-card-instance-id]").count(),
    4,
  );
  await opponent.waitForFunction(
    () => !document.querySelector(".card-play-animation"),
  );
  await opponent.locator(".ko-turn-end:not([disabled])").waitFor();
  await endTurn(opponent, "PLAYER_TWO");
  await own.locator(".ko-turn-end:not([disabled])").waitFor();
  assert.equal(runtime.state.activePlayerId, "PLAYER_ONE");
  await own
    .locator(
      '.ko-player-board-row [data-card-instance-id="motion-generated-hand"]',
    )
    .click({ position: { x: 25, y: 60 } });
  await own
    .locator('.ko-opponent-board-row [data-card-instance-id="motion-enemy"]')
    .click({ position: { x: 25, y: 60 } });
  await own.waitForFunction(() => document.querySelector(".attack-animation"));
  await own.screenshot({ path: `${out}/attack-motion-${width}.png` });
  await own.waitForFunction(() => !document.querySelector(".attack-animation"));
  await own.locator(".ko-turn-end:not([disabled])").waitFor();
  assert.equal(runtime.state.players[1].board[0].currentHealth, 8);
  const timerBefore = await own
    .getByTestId("text-online-turn-timer")
    .innerText();
  await own.waitForTimeout(1200);
  const timerAfter = await own
    .getByTestId("text-online-turn-timer")
    .innerText();
  assert.ok(
    parseInt(timerAfter) < parseInt(timerBefore),
    `${timerBefore} -> ${timerAfter}`,
  );
  const probe = await own.evaluate(() => {
    window.motionProbe.running = false;
    return window.motionProbe;
  });
  const gaps = probe.frameGaps.slice(1).sort((a, b) => a - b);
  return {
    generatedHandSingleCopy: oneCopy === 1,
    concurrentSummonPeak: probe.summonPeak,
    summonBatchMs: Math.round(summonBatchMs),
    turnsBothClients: true,
    actualAttackDamage: 2,
    resyncClearsOldFlights: true,
    clockAdvances: true,
    frameGapP95Ms: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0),
    frameGapsOver50ms: gaps.filter((n) => n > 50).length,
    note: "Local Chromium instrumentation, screenshots and service fixture overhead; not Korean mobile FPS or Internet latency",
  };
}
