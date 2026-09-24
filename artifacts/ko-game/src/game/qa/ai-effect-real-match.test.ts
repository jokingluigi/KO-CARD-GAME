import assert from "node:assert/strict";
import test from "node:test";

import type { EffectScript } from "@workspace/effect-registry";

import { executeAction, getLegalActions } from "../actions/engine-actions";
import type { GameAction } from "../actions/types";
import { generateCardInstance } from "../cards/generation";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import type { CardDefinition, CardInstance } from "../cards/types";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { endTurn } from "../engine/turn-system";
import { playWrestlerFromHand } from "../engine/play-wrestler";
import type { GameState } from "../types/game-state";

const PLAYER_ONE = "player-1";
const boardTarget = { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 } as const;

const scripts: Record<string, EffectScript> = {
  B: {
    version: "SCRIPT_V1",
    trigger: "LEAVE_FIELD",
    steps: [
      {
        type: "SELECT",
        id: "zombies",
        target: {
          zone: "GRAVEYARD",
          owner: "SELF",
          cardType: "WRESTLER",
          filter: { tagsAny: ["ZOMBIE"] },
          selection: "ALL",
          count: 20,
        },
      },
      { type: "AGGREGATE", id: "zombieCount", selectionId: "zombies", operation: "COUNT" },
      {
        type: "EFFECT",
        effect: {
          action: "HEAL",
          target: { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 },
          values: { amountExpression: { kind: "RESULT_VALUE", resultId: "zombieCount" } },
        },
      },
    ],
  },
  C: {
    version: "SCRIPT_V1",
    trigger: "SELF_ATTACK",
    steps: [
      {
        type: "SELECT",
        id: "highest",
        target: {
          zone: "HAND",
          owner: "ENEMY",
          selection: "ALL",
          count: 1,
          sort: { stat: "COST", direction: "DESC" },
          take: 1,
        },
      },
      {
        type: "EFFECT",
        effect: {
          action: "INCREASE_COST",
          target: { resultId: "highest", zone: "HAND", owner: "ENEMY", selection: "ALL", count: 1 },
          values: { amount: 2 },
        },
      },
    ],
  },
  E: {
    version: "SCRIPT_V1",
    trigger: "ENTER_FIELD",
    steps: [
      {
        type: "SELECT",
        id: "revived",
        target: {
          zone: "GRAVEYARD",
          owner: "SELF",
          cardType: "WRESTLER",
          filter: { maxCost: 3 },
          selection: "RANDOM",
          count: 1,
          randomScope: "STANDARD",
        },
      },
      {
        type: "EFFECT",
        effect: {
          action: "REVIVE",
          target: { resultId: "revived", zone: "GRAVEYARD", owner: "SELF", cardType: "WRESTLER" },
        },
      },
    ],
  },
  I: {
    version: "SCRIPT_V1",
    trigger: "ENTER_FIELD",
    steps: [
      {
        type: "SELECT",
        id: "zombies",
        target: {
          zone: "BOARD",
          owner: "SELF",
          cardType: "WRESTLER",
          filter: { tagsAny: ["ZOMBIE"] },
          selection: "ALL",
          count: 20,
        },
      },
      { type: "AGGREGATE", id: "zombieCount", selectionId: "zombies", operation: "COUNT" },
      {
        type: "IF",
        condition: {
          left: { kind: "RESULT_VALUE", resultId: "zombieCount" },
          compare: "GTE",
          right: { kind: "CONSTANT", value: 3 },
        },
        then: [{
          type: "EFFECT",
          effect: {
            action: "BUFF",
            target: boardTarget,
            values: { attack: 3, health: 3 },
          },
        }],
      },
    ],
  },
  J: {
    version: "SCRIPT_V1",
    trigger: "LEAVE_FIELD",
    steps: [
      {
        type: "HISTORY",
        id: "retiredCount",
        query: {
          scope: "CURRENT_TURN",
          eventType: "CARD_RETIRED",
          cardType: "WRESTLER",
          operation: "COUNT",
        },
      },
      {
        type: "EFFECT",
        effect: {
          action: "DAMAGE",
          target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
          values: { amountExpression: { kind: "RESULT_VALUE", resultId: "retiredCount" } },
        },
      },
    ],
  },
  K: {
    version: "SCRIPT_V1",
    trigger: "ENTER_FIELD",
    steps: [
      {
        type: "SELECT",
        id: "hiddenWrestlers",
        target: {
          zone: "HAND",
          owner: "SELF",
          cardType: "WRESTLER",
          selection: "ALL",
          count: 20,
        },
      },
      {
        type: "EFFECT",
        effect: {
          action: "BUFF",
          target: {
            resultId: "hiddenWrestlers",
            zone: "HAND",
            owner: "SELF",
            cardType: "WRESTLER",
            selection: "ALL",
            count: 20,
          },
          values: { attack: 0, health: -5 },
        },
      },
    ],
  },
};

const structuredConfigs: Record<string, Record<string, unknown>> = {
  A: {
    effects: [{
      trigger: "ENTER_FIELD",
      action: "BUFF",
      target: boardTarget,
      values: { attack: 2, health: 2 },
    }],
  },
  D: {
    effects: [
      {
        trigger: "ENTER_FIELD",
        action: "SUMMON",
        target: {
          zone: "BOARD",
          owner: "SELF",
          cardType: "WRESTLER",
          selection: "ADJACENT_EMPTY_SLOTS",
          count: 2,
          randomScope: "STANDARD",
        },
      },
      {
        trigger: "ENTER_FIELD",
        action: "ADD_KEYWORD",
        target: {
          zone: "BOARD",
          owner: "SELF",
          cardType: "WRESTLER",
          selection: "SAME_TARGET",
          count: 2,
        },
        values: { keyword: "TAUNT" },
      },
    ],
  },
  F: {
    effects: [{
      trigger: "LEAVE_FIELD",
      action: "REGISTER_DELAYED",
      values: {
        delayed: {
          kind: "OWNER_NEXT_TURN_START",
          effect: {
            action: "REVIVE",
            target: {
              zone: "GRAVEYARD",
              owner: "SELF",
              cardType: "WRESTLER",
              selection: "RANDOM",
              count: 1,
              randomScope: "STANDARD",
            },
          },
          followUpEffects: [{
            action: "BUFF",
            target: { zone: "BOARD", owner: "SELF", selection: "SAME_TARGET", count: 1 },
            values: { attack: 2, health: 0 },
          }],
        },
      },
    }],
  },
  G: {
    effects: [{
      trigger: "ENTER_FIELD",
      action: "QUEUE_EFFECT",
      values: {
        queuedTrigger: "NEXT_ALLY_WRESTLER_PLAYED",
        queuedEffect: {
          action: "BUFF",
          target: boardTarget,
          values: { attack: 2, health: 2 },
        },
      },
    }],
  },
  H: {
    effects: [{
      trigger: "BEFORE_DAMAGE",
      action: "PREVENT_DAMAGE",
      values: { prevention: { uses: 1 } },
    }],
  },
};

type CaseKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";

const records: Record<CaseKey, PublishedCardRecord> = Object.fromEntries(
  (Object.keys(structuredConfigs).concat(Object.keys(scripts)) as CaseKey[]).map((key) => {
    const effectId = structuredConfigs[key] ? "STRUCTURED_EFFECTS_V1" : "SCRIPT_V1";
    const effectConfig = structuredConfigs[key] ?? { scripts: [scripts[key]!] };
    return [key, {
      id: `ai-real-match-${key.toLowerCase()}`,
      name: `AI real-match ${key}`,
      cardType: "WRESTLER",
      cost: 1,
      attack: 1,
      health: 3,
      text: `AI real-match case ${key}`,
      keywords: [],
      tags: [],
      isToken: false,
      isChampionToken: false,
      effectId,
      effectConfig,
      status: "PUBLISHED",
      version: 1,
      createdAt: "",
      updatedAt: "",
      imageAssetId: null,
      imageUrl: null,
    } satisfies PublishedCardRecord];
  }),
) as Record<CaseKey, PublishedCardRecord>;

const definitions: Record<CaseKey, CardDefinition> = Object.fromEntries(
  Object.entries(records).map(([key, record]) => [key, cardRecordToDefinition(record)]),
) as Record<CaseKey, CardDefinition>;

const summonDefinition: CardDefinition = {
  id: "ai-real-match-summon",
  name: "AI real-match summon",
  cardType: "WRESTLER",
  cost: 1,
  attack: 2,
  health: 2,
  rulesText: "",
  keywords: [],
  isToken: false,
  isChampionToken: false,
  abilities: [],
};

function stateWithPool(): GameState {
  const state = createInitialGameState();
  state.status = "IN_PROGRESS";
  state.activePlayerId = "player-1";
  state.turn = 1;
  state.randomSeed = 20260923;
  state.cardPool = [...Object.values(definitions), summonDefinition];
  state.players = state.players.map((player) => ({
    ...player,
    health: 10,
    maxHealth: 20,
    currentGold: 10,
    hand: [],
    deck: [],
    graveyard: [],
    board: [null, null, null, null],
  }));
  return state;
}

function instance(
  definition: CardDefinition,
  id: string,
  patch: Partial<CardInstance> = {},
): CardInstance {
  return { ...generateCardInstance(definition, { instanceId: id, isGenerated: false }), ...patch };
}

function card(key: CaseKey, id: string, patch: Partial<CardInstance> = {}): CardInstance {
  return instance(definitions[key], id, patch);
}

function assertRoundTrip(key: CaseKey): CardDefinition {
  const persisted = JSON.parse(JSON.stringify(records[key])) as PublishedCardRecord;
  const applied = cardRecordToDefinition(records[key]);
  const reloaded = cardRecordToDefinition(persisted);
  assert.deepEqual(reloaded.effectConfig, applied.effectConfig, `${key}: effect config changed after reload`);
  assert.equal(reloaded.effectId, applied.effectId, `${key}: effect id changed after reload`);
  assert.ok(reloaded.abilities.length > 0, `${key}: runtime ability missing after reload`);
  return reloaded;
}

function action(
  state: GameState,
  candidate: GameAction,
  message: string,
): GameState {
  const result = executeAction(state, candidate);
  assert.equal(result.success, true, message);
  if (!result.success) throw new Error(message);
  return result.state;
}

function event(state: GameState, type: string, cardInstanceId?: string) {
  const found = [...state.events].reverse().find((item) =>
    item.type === type && (!cardInstanceId || item.cardInstanceId === cardInstanceId),
  );
  assert.ok(found, `missing event ${type}`);
  return found;
}

function play(
  state: GameState,
  source: CardInstance,
  slot: 0 | 1 | 2 | 3,
): GameState {
  const current = {
    ...state,
    players: state.players.map((player) => player.id === PLAYER_ONE
      ? { ...player, hand: [source], currentGold: 10 }
      : player),
  };
  const actionCandidate = getLegalActions(current, PLAYER_ONE).find(
    (candidate) => candidate.type === "PLAY_WRESTLER" &&
      candidate.cardInstanceId === source.instanceId &&
      candidate.boardSlot === slot,
  );
  assert.ok(actionCandidate, `no legal play action for ${source.instanceId}`);
  return action(current, actionCandidate!, `play failed for ${source.instanceId}`);
}

test("A-J definitions preserve executable AST through apply/save/reload", () => {
  (Object.keys(records) as CaseKey[]).forEach((key) => {
    const definition = assertRoundTrip(key);
    assert.equal(definition.id, records[key].id);
    assert.equal(definition.abilities[0]?.trigger, key === "C" ? "SELF_ATTACK" : definition.abilities[0]?.trigger);
  });
});

test("A applies a loaded effect through PLAY_WRESTLER → ENTER_FIELD → GameState", () => {
  const source = card("A", "a-source");
  const state = play(stateWithPool(), source, 0);
  const result = state.players[0].board[0];
  assert.equal(result?.currentAttack, 3);
  assert.equal(result?.currentHealth, 5);
  assert.equal(event(state, "CARD_PLAYED", source.instanceId).reason, "PLAY_FROM_HAND");
  assert.equal(event(state, "ENTER_FIELD", source.instanceId).entryCause, "PLAY_FROM_HAND");
});

test("B heals from counted zombie graveyard cards on the real leave-field path", () => {
  const state = stateWithPool();
  const source = { ...card("B", "b-source"), boardSlot: 0 as const, currentHealth: 1, maxHealth: 3 };
  const zombieOne = { ...card("A", "b-zombie-1"), tags: ["ZOMBIE"] };
  const zombieTwo = { ...card("A", "b-zombie-2"), tags: ["ZOMBIE"] };
  const nonZombie = card("A", "b-non-zombie");
  state.players[0].board = [source, null, null, null];
  state.players[0].graveyard = [zombieOne, zombieTwo, nonZombie];
  const attacker = { ...card("A", "b-attacker"), boardSlot: 0 as const, currentAttack: 2, enteredThisTurn: false };
  state.players[1].board = [attacker, null, null, null];
  state.activePlayerId = "player-2";

  const result = action(state, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: attacker.instanceId,
    target: { type: "WRESTLER", playerId: "player-1", cardInstanceId: source.instanceId },
  }, "B attack failed");

  assert.equal(result.players[0].board[0], null);
  assert.equal(result.players[0].health, 12);
  assert.equal(event(result, "CARD_RETIRED", source.instanceId).reason, "RETIRE");
});

test("C uses SELF_ATTACK to change only the highest-cost enemy hand card", () => {
  const state = stateWithPool();
  const source = { ...card("C", "c-source"), boardSlot: 0 as const, enteredThisTurn: false };
  const low = { ...card("A", "c-low"), currentCost: 2 };
  const high = { ...card("A", "c-high"), currentCost: 5 };
  const middle = { ...card("A", "c-middle"), currentCost: 3 };
  state.players[0].board = [source, null, null, null];
  state.players[1].hand = [low, high, middle];
  state.activePlayerId = "player-1";

  const result = action(state, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: source.instanceId,
    target: { type: "PLAYER", playerId: "player-2" },
  }, "C attack failed");

  assert.equal(result.players[1].hand.find((item) => item.instanceId === high.instanceId)?.currentCost, 7);
  assert.equal(result.players[1].hand.find((item) => item.instanceId === low.instanceId)?.currentCost, 2);
  assert.equal(result.players[1].hand.find((item) => item.instanceId === middle.instanceId)?.currentCost, 3);
  assert.equal(result.events.filter((item) => item.type === "DAMAGE_DEALT" && item.cardInstanceId === source.instanceId).length, 1);

  const blocked = { ...state, players: state.players.map((player) => player.id === "player-1"
    ? { ...player, board: [{ ...source, attacksUsedThisTurn: 1 }, null, null, null] as typeof player.board }
    : player) };
  assert.equal(getLegalActions(blocked, "player-1").some((item) =>
    item.type === "ATTACK" && item.attackerInstanceId === source.instanceId,
  ), false);
});

test("D summons adjacent cards and applies SAME_TARGET TAUNT via play action", () => {
  const state = stateWithPool();
  state.cardPool = [summonDefinition, ...Object.values(definitions)];
  const source = { ...card("D", "d-source"), boardSlot: 2 as const };
  state.players[0].board = [null, null, null, null];
  state.players[0].hand = [source];
  state.players[0].currentGold = 10;
  const played = action(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: source.instanceId,
    boardSlot: 2,
  }, "D play failed");
  const summoned = played.players[0].board.filter((item): item is CardInstance =>
    Boolean(item) && item.instanceId !== source.instanceId,
  );
  assert.equal(summoned.length, 2);
  assert.deepEqual(summoned.map((item) => item.boardSlot).sort(), [1, 3]);
  assert.equal(summoned.every((item) => item.keywords.includes("TAUNT")), true);
  assert.equal(played.events.filter((item) => item.type === "CARD_PLAYED" && item.cardInstanceId !== source.instanceId).length, 0);
  assert.equal(played.events.filter((item) => item.type === "ENTER_FIELD" && item.entryCause === "SUMMON").length, 2);

  const repeat = stateWithPool();
  repeat.cardPool = state.cardPool;
  repeat.players[0].hand = [source];
  const repeated = action(repeat, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: source.instanceId,
    boardSlot: 2,
  }, "D repeat play failed");
  assert.deepEqual(
    repeated.players[0].board.map((item) => item ? { slot: item.boardSlot, definitionId: item.definitionId, keywords: item.keywords } : null),
    played.players[0].board.map((item) => item ? { slot: item.boardSlot, definitionId: item.definitionId, keywords: item.keywords } : null),
  );
});

test("E revives one eligible wrestler and no-ops cleanly when none qualify", () => {
  const eligibleA = { ...card("A", "e-eligible-a"), currentCost: 2 };
  const eligibleB = { ...card("A", "e-eligible-b"), currentCost: 3 };
  const expensive = { ...card("A", "e-expensive"), currentCost: 5 };
  const technique = { ...card("A", "e-technique"), cardType: "TECHNIQUE" as const, currentCost: 1 };
  const source = card("E", "e-source");
  const state = stateWithPool();
  state.players[0].graveyard = [eligibleA, eligibleB, expensive, technique];
  const result = play(state, source, 0);
  const revived = result.players[0].board.find((item) => item?.instanceId === eligibleA.instanceId || item?.instanceId === eligibleB.instanceId);
  assert.ok(revived);
  assert.equal(result.players[0].board.filter(Boolean).length, 2);
  assert.equal(result.players[0].graveyard.some((item) => item.instanceId === expensive.instanceId), true);
  assert.equal(result.players[0].graveyard.some((item) => item.instanceId === technique.instanceId), true);
  assert.equal(result.events.filter((item) => item.type === "ENTER_FIELD" && item.entryCause === "REVIVE").length, 1);
  assert.equal(result.targetingState, undefined);

  const empty = stateWithPool();
  const noTarget = play(empty, card("E", "e-no-target"), 0);
  assert.ok(noTarget.players[0].board.some((item) => item?.instanceId === "e-no-target"));
  assert.equal(noTarget.targetingState, undefined);
  assert.equal(noTarget.pendingCardEffects.length, 0);
});

test("F registers on leave, fires only on owner turn, revives, buffs, and consumes once", () => {
  const state = stateWithPool();
  const source = { ...card("F", "f-source"), boardSlot: 0 as const, currentHealth: 1, maxHealth: 3 };
  const reviveTarget = { ...card("A", "f-revive-target"), currentCost: 2 };
  const attacker = { ...card("A", "f-attacker"), boardSlot: 0 as const, currentAttack: 2, enteredThisTurn: false };
  state.players[0].board = [source, null, null, null];
  state.players[0].graveyard = [reviveTarget];
  state.players[1].board = [attacker, null, null, null];
  state.activePlayerId = "player-2";
  const afterLeave = action(state, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: attacker.instanceId,
    target: { type: "WRESTLER", playerId: "player-1", cardInstanceId: source.instanceId },
  }, "F attack failed");
  assert.equal(afterLeave.pendingDelayedEffects.length, 1);
  assert.equal(afterLeave.players[0].board.some((item) => item?.instanceId === reviveTarget.instanceId), false);

  const afterOwnerTurn = action(afterLeave, { type: "END_TURN", playerId: "player-2" }, "F owner turn failed");
  const revived = afterOwnerTurn.players[0].board.find((item) => item?.instanceId === reviveTarget.instanceId);
  assert.ok(revived);
  assert.equal(revived.currentAttack, reviveTarget.currentAttack + 2);
  assert.equal(afterOwnerTurn.pendingDelayedEffects.length, 0);
  const afterNextTurn = endTurn({
    ...afterOwnerTurn,
    activePlayerId: "player-1",
  }, "player-1");
  assert.equal(afterNextTurn.success, true);
  if (afterNextTurn.success) assert.equal(afterNextTurn.state.players[0].board.find((item) => item?.instanceId === reviveTarget.instanceId)?.currentAttack, revived.currentAttack);
});

test("G queues the next ally wrestler and consumes the queue once", () => {
  const state = stateWithPool();
  const source = card("G", "g-source");
  const first = instance(summonDefinition, "g-first");
  const second = instance(summonDefinition, "g-second");
  const afterSource = play(state, source, 0);
  assert.equal(afterSource.pendingCardEffects.length, 1);
  const afterFirst = play({
    ...afterSource,
    players: afterSource.players.map((player) => player.id === "player-1"
      ? { ...player, hand: [first], currentGold: 10 }
      : player),
  }, first, 1);
  assert.equal(afterFirst.players[0].board[1]?.currentAttack, first.currentAttack + 2);
  assert.equal(afterFirst.players[0].board[1]?.currentHealth, first.currentHealth + 2);
  assert.equal(afterFirst.pendingCardEffects.length, 0);
  const afterSecond = play({
    ...afterFirst,
    players: afterFirst.players.map((player) => player.id === "player-1"
      ? { ...player, hand: [second], currentGold: 10 }
      : player),
  }, second, 2);
  assert.equal(afterSecond.players[0].board[2]?.currentAttack, second.currentAttack);
  assert.equal(afterSecond.players[0].board[2]?.currentHealth, second.currentHealth);
});

test("H prevents the first incoming damage through combat and consumes uses", () => {
  const state = stateWithPool();
  const shield = { ...card("H", "h-source"), boardSlot: 0 as const, currentHealth: 1, maxHealth: 1 };
  const firstAttacker = { ...card("A", "h-attacker-1"), boardSlot: 0 as const, currentAttack: 3, enteredThisTurn: false };
  const secondAttacker = { ...card("A", "h-attacker-2"), boardSlot: 1 as const, currentAttack: 3, enteredThisTurn: false };
  state.players[0].board = [shield, null, null, null];
  state.players[1].board = [firstAttacker, secondAttacker, null, null];
  state.activePlayerId = "player-2";
  const first = action(state, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: firstAttacker.instanceId,
    target: { type: "WRESTLER", playerId: "player-1", cardInstanceId: shield.instanceId },
  }, "H first attack failed");
  assert.equal(first.players[0].board[0]?.instanceId, shield.instanceId);
  assert.equal(first.players[0].board[0]?.currentHealth, 1);
  const second = action(first, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: secondAttacker.instanceId,
    target: { type: "WRESTLER", playerId: "player-1", cardInstanceId: shield.instanceId },
  }, "H second attack failed");
  assert.equal(second.players[0].board[0], null);
  assert.equal(second.players[0].graveyard.some((item) => item.instanceId === shield.instanceId), true);
});

test("I counts only board zombie wrestlers and buffs itself at the threshold", () => {
  const twoZombieState = stateWithPool();
  twoZombieState.players[0].board = [
    { ...card("A", "i-two-1", { tags: ["ZOMBIE"] }), boardSlot: 0 },
    { ...card("A", "i-two-2", { tags: ["ZOMBIE"] }), boardSlot: 1 },
    null,
    null,
  ];
  const two = play(twoZombieState, card("I", "i-two-source"), 2);
  assert.equal(two.players[0].board[2]?.currentAttack, definitions.I.attack);
  assert.equal(two.players[0].board[2]?.currentHealth, definitions.I.health);

  const threeZombieState = stateWithPool();
  threeZombieState.players[0].board = [
    { ...card("A", "i-three-1", { tags: ["ZOMBIE"] }), boardSlot: 0 },
    { ...card("A", "i-three-2", { tags: ["ZOMBIE"] }), boardSlot: 1 },
    null,
    null,
  ];
  const threeSource = card("I", "i-three-source", { tags: ["ZOMBIE"] });
  const three = play(threeZombieState, threeSource, 2);
  assert.equal(three.players[0].board[2]?.currentAttack, definitions.I.attack + 3);
  assert.equal(three.players[0].board[2]?.currentHealth, definitions.I.health + 3);

  const nonWrestlerState = stateWithPool();
  nonWrestlerState.players[0].board = [
    { ...card("A", "i-non-wrestler", { tags: ["ZOMBIE"], cardType: "TECHNIQUE" }), boardSlot: 0 },
    { ...card("A", "i-one-wrestler", { tags: ["ZOMBIE"] }), boardSlot: 1 },
    null,
    null,
  ];
  const nonWrestler = play(nonWrestlerState, card("I", "i-non-wrestler-source"), 2);
  assert.equal(nonWrestler.players[0].board[2]?.currentAttack, definitions.I.attack);

  const nonFieldState = stateWithPool();
  nonFieldState.players[0].board = [
    { ...card("A", "i-field-zombie", { tags: ["ZOMBIE"] }), boardSlot: 0 },
    { ...card("A", "i-field-zombie-2", { tags: ["ZOMBIE"] }), boardSlot: 1 },
    null,
    null,
  ];
  nonFieldState.players[0].hand = [{ ...card("A", "i-hand-zombie", { tags: ["ZOMBIE"] }) }];
  const nonField = play(nonFieldState, card("I", "i-non-field-source"), 2);
  assert.equal(nonField.players[0].board[2]?.currentAttack, definitions.I.attack);
});

test("J uses current-turn retirement history to damage the enemy player", () => {
  const state = stateWithPool();
  const source = { ...card("J", "j-source"), boardSlot: 0 as const, currentHealth: 1, maxHealth: 1 };
  const attacker = { ...card("A", "j-attacker"), boardSlot: 0 as const, currentAttack: 2, enteredThisTurn: false };
  state.players[0].board = [source, null, null, null];
  state.players[1].board = [attacker, null, null, null];
  state.activePlayerId = "player-2";
  const result = action(state, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: attacker.instanceId,
    target: { type: "WRESTLER", playerId: "player-1", cardInstanceId: source.instanceId },
  }, "J attack failed");
  assert.equal(result.players[1].health, 9);
  assert.equal(event(result, "CARD_RETIRED", source.instanceId).cardInstanceId, source.instanceId);
});

test("K applies the hidden-zone health floor through a real SCRIPT_V1 card play", () => {
  const source = card("K", "k-source");
  const hidden = {
    ...instance(summonDefinition, "k-generated-hand-target"),
    currentHealth: 3,
    maxHealth: 3,
    isGenerated: true,
  };
  const state = stateWithPool();
  state.players[0].hand = [source, hidden];
  state.players[0].currentGold = 10;

  const candidate = getLegalActions(state, PLAYER_ONE).find(
    (item) => item.type === "PLAY_WRESTLER" &&
      item.cardInstanceId === source.instanceId &&
      item.boardSlot === 0,
  );
  assert.ok(candidate, "no legal SCRIPT_V1 play action");
  const result = action(state, candidate!, "K play failed");

  assert.equal(result.players[0].hand.find((item) => item.instanceId === hidden.instanceId)?.currentHealth, 1);
  const healthChange = result.events.find((item) =>
    item.type === "STAT_CHANGED" &&
    item.cardInstanceId === hidden.instanceId &&
    item.stat === "currentHealth",
  );
  assert.equal(healthChange?.delta, -2);
});