import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
import {
  championRecordToDefinition,
  createInitialGameState,
  generateCardInstance,
} from "../../lib/game-engine/src/index.ts";
export async function natomatoScenarios({
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
  const record = JSON.parse(
    await readFile("docs/qa/20261113-natomato/champion-record.json", "utf8"),
  )[0];
  const definition = championRecordToDefinition(record);
  const body = {
    ...baseCard,
    id: "nato-browser-body",
    name: "회피 검증 선수",
    attack: 1,
    health: 30,
    cost: 1,
    keywords: [],
    abilities: [],
    rulesText: "",
    isToken: false,
    isChampionToken: false,
  };
  const finisher = {
    ...body,
    id: record.questCondition.finisher.cardDefinitionId,
    name: "피니셔 지급 검증",
    cardType: "TECHNIQUE",
    rarity: "CHAMPION",
    isToken: true,
    isChampionToken: true,
  };
  let state = structuredClone(runtime.state);
  const original = createInitialGameState(
    [definition.id, definition.id],
    [body, finisher],
    [definition],
  );
  state.cardPool = [
    ...new Map(
      [...state.cardPool, body, finisher].map((c) => [c.id, c]),
    ).values(),
  ];
  state.events = [];
  state.turn = 5;
  state.activePlayerId = "PLAYER_ONE";
  state.targetingState = undefined;
  state.championQuestEventCursorByPlayer = {};
  state.championQuestProcessedEventIdentitiesByPlayer = {};
  for (const [i, p] of state.players.entries()) {
    p.champion = original.players[i].champion;
    p.champion.imageUrl = undefined;
    p.health = 20;
    p.maxHealth = 30;
    p.currentGold = 1;
    p.championAbilityUsedThisTurn = false;
    p.hand = [];
    p.deck = Array.from({ length: 30 }, (_, j) =>
      generateCardInstance(body, { instanceId: `nato-deck-${i}-${j}` }),
    );
    p.graveyard = [];
    p.board = [0, 1, 2, 3].map((j) => ({
      ...generateCardInstance(body, { instanceId: `nato-${i}-${j}` }),
      boardSlot: j,
      enteredThisTurn: false,
      currentAttack: i ? 1 : 0,
    }));
  }
  const restore = async () => {
    await f.db
      .update(f.schema.onlineMatchesTable)
      .set({
        status: "ACTIVE",
        serializedGameState: state,
        serializedSnapshot: {
          ...runtime.snapshot,
          cardDefinitions: state.cardPool,
          championDefinitions: [definition],
          publicPlayers: runtime.snapshot.publicPlayers.map((p) => ({
            ...p,
            championName: definition.name,
            portraitUrl: null,
          })),
        },
      })
      .where(eq(f.schema.onlineMatchesTable.id, runtime.matchId));
    service.cleanupMatchRuntime(runtime.matchId);
    runtime = await service.getRuntime(runtime.matchId);
    assert.ok(runtime);
    setRuntime(runtime);
    await own.reload();
    await opponent.reload();
    await own.locator(".ko-champion-ability").waitFor();
    await opponent.locator(".ko-champion-ability").waitFor();
    await own.waitForFunction(
      () =>
        document
          .querySelector(".ko-champion-ability")
          ?.getAttribute("aria-disabled") === "false",
    );
  };
  await restore();
  await own.locator(".ko-champion-ability").click();
  await own.waitForFunction(
    () =>
      document
        .querySelector(".ko-game-stage")
        ?.getAttribute("data-effect-targeting") === "true",
  );
  await own.screenshot({ path: `${out}/target-${width}.png` });
  await own
    .locator('.ko-player-board-row [data-card-instance-id="nato-0-1"]')
    .click({ position: { x: 25, y: 60 } });
  await own.waitForFunction(
    () =>
      document
        .querySelector(".ko-game-stage")
        ?.getAttribute("data-effect-targeting") === "false",
  );
  assert.deepEqual(
    runtime.state.players[0].board.map((c) => c.dodgeCharges),
    [0, 1, 0, 0],
  );
  assert.equal(runtime.state.players[0].health, 18);
  assert.equal(runtime.state.players[0].currentGold, 0);
  const version = runtime.version;
  await own.waitForTimeout(800);
  await own.screenshot({ path: `${out}/one-target-${width}.png` });
  await opponent.screenshot({ path: `${out}/opponent-${width}.png` });
  // Restore through durable server state, preserving the used flag and one grant.
  state = structuredClone(runtime.state);
  await f.db
    .update(f.schema.onlineMatchesTable)
    .set({ serializedGameState: state })
    .where(eq(f.schema.onlineMatchesTable.id, runtime.matchId));
  service.cleanupMatchRuntime(runtime.matchId);
  runtime = await service.getRuntime(runtime.matchId);
  setRuntime(runtime);
  assert.deepEqual(
    runtime.state.players[0].board.map((c) => c.dodgeCharges),
    [0, 1, 0, 0],
  );
  assert.ok(runtime.state.players[0].championAbilityUsedThisTurn);
  // Eight real server actions, not synthetic quest increments. Native double dodge is a test fixture.
  state = structuredClone(runtime.state);
  state.activePlayerId = "PLAYER_TWO";
  state.targetingState = undefined;
  for (const c of state.players[0].board)
    Object.assign(c, {
      keywords: ["DODGE"],
      dodgeAvailable: true,
      dodgeCharges: 2,
    });
  await f.db
    .update(f.schema.onlineMatchesTable)
    .set({ serializedGameState: state })
    .where(eq(f.schema.onlineMatchesTable.id, runtime.matchId));
  service.cleanupMatchRuntime(runtime.matchId);
  runtime = await service.getRuntime(runtime.matchId);
  setRuntime(runtime);
  const commit = async (user, action) => {
    const requestId = crypto.randomUUID(),
      prior = runtime.version;
    const { playerId, ...payload } = action;
    const result = await service.applyMatchAction(
      runtime.matchId,
      user,
      requestId,
      prior,
      payload,
    );
    assert.ok(result.ok, result.message ?? result.code);
    service.broadcastExecution(result);
    return { requestId, prior };
  };
  let last;
  for (let i = 0; i < 8; i++) {
    last = await commit("finisher-opponent", {
      type: "ATTACK",
      attackerInstanceId: "nato-1-0",
      target: {
        type: "WRESTLER",
        playerId: "PLAYER_ONE",
        cardInstanceId: `nato-0-${Math.floor(i / 2)}`,
      },
    });
    assert.equal(
      runtime.state.players[0].champion.questConditionCounts.root,
      i + 1,
    );
    assert.equal(runtime.state.players[0].champion.questCompleted, i === 7);
    if (i < 7) {
      await commit("finisher-opponent", {
        type: "END_TURN",
        playerId: "PLAYER_TWO",
      });
      await commit("tutorial-user", {
        type: "END_TURN",
        playerId: "PLAYER_ONE",
      });
    }
  }
  assert.ok(runtime.state.targetingState.handAddition);
  const duplicate = await service.applyMatchAction(
    runtime.matchId,
    "finisher-opponent",
    last.requestId,
    last.prior,
    {
      type: "ATTACK",
      attackerInstanceId: "nato-1-0",
      target: {
        type: "WRESTLER",
        playerId: "PLAYER_ONE",
        cardInstanceId: "nato-0-3",
      },
    },
  );
  assert.ok(duplicate.ok && duplicate.duplicate);
  await commit("tutorial-user", {
    type: "SELECT_EFFECT_TARGET",
    playerId: "PLAYER_ONE",
    targetId: runtime.state.players[0].hand[0].instanceId,
  });
  assert.equal(
    runtime.state.players[0].hand.filter((c) => c.definitionId === finisher.id)
      .length,
    1,
  );
  assert.equal(runtime.state.players[0].champion.questConditionCounts.root, 8);
  const completed = structuredClone(runtime.state);
  await f.db
    .update(f.schema.onlineMatchesTable)
    .set({ serializedGameState: completed })
    .where(eq(f.schema.onlineMatchesTable.id, runtime.matchId));
  service.cleanupMatchRuntime(runtime.matchId);
  runtime = await service.getRuntime(runtime.matchId);
  setRuntime(runtime);
  await own.reload();
  await opponent.reload();
  await own.locator(".ko-game-shell").waitFor();
  await opponent.locator(".ko-game-shell").waitFor();
  await own.waitForTimeout(400);
  await own.screenshot({ path: `${out}/completed-${width}.png` });
  assert.ok(runtime.state.players[0].champion.questCompleted);
  assert.equal(
    runtime.state.players[0].hand.filter((c) => c.definitionId === finisher.id)
      .length,
    1,
  );
  return {
    checks: [
      "real ability UI selects one ally",
      "both online clients mounted",
      "once-only grant and cost survive restore",
      "eight server-confirmed dodges complete preparation",
      "duplicate request idempotent",
      "full-hand discard then one finisher",
      "completed state survives reconnect",
    ],
    abilityVersion: version,
  };
}
