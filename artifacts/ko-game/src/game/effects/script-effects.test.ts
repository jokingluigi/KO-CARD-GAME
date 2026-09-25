import assert from "node:assert/strict";
import test from "node:test";

import { generateCard } from "../cards/generation";
import type { CardDefinition, CardInstance } from "../cards/types";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { enterField } from "../engine/enter-field";
import type { CardEffect } from "./types";
import { applyEffect, selectEffectTarget } from "./effect-engine";

function card(id: string, effects: CardEffect[] = []): CardInstance {
  const definition: CardDefinition = {
    id,
    name: id,
    cardType: "WRESTLER",
    cost: 1,
    attack: 1,
    health: 3,
    rulesText: "",
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [{ trigger: "ENTER_FIELD", effects }],
  };
  return generateCard(definition, {
    instanceId: `${id}-instance`,
    playerId: "player-1",
    source: { type: "PLAYER", playerId: "player-1" },
    reason: "TEST",
  }).card;
}

test("SCRIPT_V1 반복 규칙은 피해를 합산하지 않고 독립된 이벤트로 적용한다", () => {
  const script: CardEffect = {
    type: "SCRIPT",
    script: { version: "SCRIPT_V1", trigger: "ENTER_FIELD", steps: [
      { type: "REPEAT", count: { kind: "CONSTANT", value: 3 }, steps: [{ type: "EFFECT", effect: {
        action: "DAMAGE",
        target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
        values: { amount: 1 },
      } }] },
    ] },
  };
  const initial = createInitialGameState();
  const before = initial.players[1]!.health;
  const result = enterField(initial, "player-1", card("triple-hit", [script]), 0);
  assert.equal(result.players[1]!.health, before - 3);
  assert.equal(result.events.filter((event) => event.type === "DAMAGE_DEALT").length, 3);
});

test("SCRIPT_V1 반복 횟수는 경기 중 필드 카드 수를 읽되 8회로 제한한다", () => {
  const script: CardEffect = { type: "SCRIPT", script: {
    version: "SCRIPT_V1", trigger: "ENTER_FIELD", steps: [
      { type: "SELECT", id: "allies", target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 20 } },
      { type: "AGGREGATE", id: "allyCount", selectionId: "allies", operation: "COUNT" },
      { type: "REPEAT", count: { kind: "RESULT_VALUE", resultId: "allyCount" }, steps: [{ type: "EFFECT", effect: {
        action: "DAMAGE", target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 }, values: { amount: 1 },
      } }] },
    ],
  } };
  const initial = createInitialGameState();
  const ally = { ...card("ally"), boardSlot: 1 as const };
  initial.players[0]!.board[1] = ally;
  const before = initial.players[1]!.health;
  const result = enterField(initial, "player-1", card("counted-hits", [script]), 0);
  assert.equal(result.players[1]!.health, before - 2);
  assert.equal(result.events.filter((event) => event.type === "DAMAGE_DEALT").length, 2);
});

test("SCRIPT_V1은 선택 수의 두 배를 계산해 경기 규칙으로 실행한다", () => {
  const script: CardEffect = { type: "SCRIPT", script: {
    version: "SCRIPT_V1", trigger: "ENTER_FIELD", steps: [
      { type: "SELECT", id: "allies", target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 20 } },
      { type: "AGGREGATE", id: "allyCount", selectionId: "allies", operation: "COUNT" },
      { type: "EFFECT", effect: {
        action: "DAMAGE", target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
        values: { amountExpression: { kind: "MULTIPLY", left: { kind: "RESULT_VALUE", resultId: "allyCount" }, right: { kind: "CONSTANT", value: 2 } } },
      } },
    ],
  } };
  const state = createInitialGameState();
  state.players[0]!.board[1] = { ...card("friend"), boardSlot: 1 };
  const after = enterField(state, "player-1", card("double-count", [script]), 0);
  assert.equal(after.players[1]!.health, state.players[1]!.health - 4);
});

test("SCRIPT_V1 selects and aggregates live board cards before applying a typed value", () => {
  const script: CardEffect = {
    type: "SCRIPT",
    script: {
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [
        {
          type: "SELECT",
          id: "allies",
          target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 20 },
        },
        { type: "AGGREGATE", id: "allyCount", selectionId: "allies", operation: "COUNT" },
        {
          type: "IF",
          condition: {
            left: { kind: "RESULT_VALUE", resultId: "allyCount" },
            compare: "GTE",
            right: { kind: "CONSTANT", value: 2 },
          },
          then: [{
            type: "EFFECT",
            effect: {
              action: "BUFF",
              target: { resultId: "allies", owner: "SELF", zone: "BOARD" },
              values: { attackExpression: { kind: "RESULT_VALUE", resultId: "allyCount" } },
            },
          }],
        },
      ],
    },
  };
  const ally = { ...card("ally"), boardSlot: 1 as const };
  const state = createInitialGameState();
  const withAlly = {
    ...state,
    players: state.players.map((player) =>
      player.id === "player-1" ? { ...player, board: [null, ally, null, null] as typeof player.board } : player,
    ),
  };

  const result = enterField(withAlly, "player-1", card("script-source", [script]), 0);
  assert.equal(result.players[0].board[0]?.currentAttack, 3);
  assert.equal(result.players[0].board[0]?.currentHealth, 3);
  assert.equal(result.players[0].board[0]?.maxHealth, 3);
  assert.equal(result.players[0].board[1]?.currentAttack, 3);
  assert.equal(result.players[0].board[1]?.currentHealth, 3);
  assert.equal(result.players[0].board[1]?.maxHealth, 3);
});

test("SCRIPT_V1 tag selection reads CardDefinition tags across board and hidden zones", () => {
  const script: CardEffect = {
    type: "SCRIPT",
    script: {
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [
        {
          type: "SELECT",
          id: "tagged",
          target: {
            zones: ["BOARD", "HAND", "DECK"],
            owner: "SELF",
            filter: { tagsAny: ["실험체"] },
            selection: "ALL",
            count: 20,
          },
        },
        { type: "AGGREGATE", id: "taggedCount", selectionId: "tagged", operation: "COUNT" },
        {
          type: "EFFECT",
          effect: {
            action: "BUFF",
            target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
            values: { attackExpression: { kind: "RESULT_VALUE", resultId: "taggedCount" } },
          },
        },
      ],
    },
  };
  const taggedDefinition: CardDefinition = {
    id: "script-tagged-definition",
    name: "script-tagged-definition",
    cardType: "WRESTLER",
    cost: 1,
    attack: 1,
    health: 3,
    rulesText: "",
    isToken: false,
    isChampionToken: false,
    keywords: [],
    tags: ["실험체"],
    abilities: [],
  };
  const untaggedDefinition: CardDefinition = { ...taggedDefinition, id: "script-untagged-definition", tags: [] };
  const makeFromDefinition = (definition: CardDefinition, instanceId: string, instanceTags: string[]) => ({
    ...generateCard(definition, {
      instanceId,
      playerId: "player-1",
      source: { type: "PLAYER", playerId: "player-1" },
      reason: "TEST",
    }).card,
    tags: instanceTags,
  });
  const source = card("script-tag-source", [script]);
  const boardTag = { ...makeFromDefinition(taggedDefinition, "script-tag-board", []), boardSlot: 1 as const };
  const handTag = makeFromDefinition(taggedDefinition, "script-tag-hand", ["다른태그"]);
  const deckTag = makeFromDefinition(taggedDefinition, "script-tag-deck", []);
  const staleUntagged = makeFromDefinition(untaggedDefinition, "script-stale-untagged", ["실험체"]);
  const initial = createInitialGameState();
  const state = {
    ...initial,
    cardPool: [taggedDefinition, untaggedDefinition],
    players: initial.players.map((player) =>
      player.id === "player-1"
        ? {
            ...player,
            board: [null, boardTag, null, null] as typeof player.board,
            hand: [handTag],
            deck: [deckTag, staleUntagged],
          }
        : player,
    ),
  };

  const result = enterField(state, "player-1", source, 0);
  assert.equal(result.players[0]?.board[0]?.currentAttack, 4);
});

test("SCRIPT_V1 PLAYER_CHOICE pauses in GameState and resumes into a later result-referenced effect", () => {
  const script: CardEffect = {
    type: "SCRIPT",
    script: {
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [
        {
          type: "SELECT",
          id: "victim",
          target: { zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 },
        },
        {
          type: "EFFECT",
          effect: {
            action: "DAMAGE",
            target: { resultId: "victim", zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER" },
            values: { amount: 1 },
          },
        },
      ],
    },
  };
  const source = card("script-choice", [script]);
  const enemy = { ...card("choice-target"), boardSlot: 2 as const };
  const state = createInitialGameState();
  state.players[1].board[2] = enemy;

  const pending = enterField(state, "player-1", source, 0);
  assert.deepEqual(pending.targetingState?.validTargetIds, [enemy.instanceId]);
  assert.equal(pending.players[1].board[2]?.currentHealth, enemy.currentHealth);
  assert.equal(structuredClone(pending).targetingState?.scriptContinuation?.selectedResultId, "victim");

  const resolved = selectEffectTarget(pending, enemy.instanceId);
  assert.equal(resolved.targetingState, undefined);
  assert.equal(resolved.players[1].board[2]?.currentHealth, enemy.currentHealth - 1);
});

test("SCRIPT_V1 filters, sorts, and takes a deterministic highest-cost hidden-zone card", () => {
  const script: CardEffect = {
    type: "SCRIPT",
    script: {
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [
        {
          type: "SELECT",
          id: "highest",
          target: {
            zone: "HAND",
            owner: "ENEMY",
            cardType: "WRESTLER",
            selection: "ALL",
            sort: { stat: "COST", direction: "DESC" },
            take: 1,
          },
        },
        {
          type: "EFFECT",
          effect: {
            action: "INCREASE_COST",
            target: { resultId: "highest", zone: "HAND", owner: "ENEMY", cardType: "WRESTLER" },
            values: { amount: 2 },
          },
        },
      ],
    },
  };
  const source = card("script-sort", [script]);
  const low = { ...card("low"), currentCost: 1 };
  const high = { ...card("high"), currentCost: 5 };
  const state = createInitialGameState();
  state.players[1].hand = [low, high];

  const result = enterField(state, "player-1", source, 0);
  assert.equal(result.players[1].hand.find((entry) => entry.instanceId === low.instanceId)?.currentCost, 1);
  assert.equal(result.players[1].hand.find((entry) => entry.instanceId === high.instanceId)?.currentCost, 7);
});

test("SCRIPT_V1 resolves adjacent empty slots, records successful summons, and applies a follow-up keyword", () => {
  const summonedDefinition = {
    id: "script-summoned",
    name: "script-summoned",
    cardType: "WRESTLER" as const,
    cost: 1,
    attack: 2,
    health: 2,
    rulesText: "",
    isToken: false,
    isChampionToken: false,
    keywords: [] as [],
    abilities: [],
  };
  const script: CardEffect = {
    type: "SCRIPT",
    script: {
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [
        {
          type: "SELECT",
          id: "slots",
          target: { zone: "BOARD", owner: "SELF", selection: "ADJACENT_EMPTY_SLOTS", count: 2 },
        },
        {
          type: "EFFECT",
          id: "summons",
          effect: {
            action: "SUMMON",
            target: { resultId: "slots", owner: "SELF", cardType: "WRESTLER", randomScope: "STANDARD" },
          },
        },
        {
          type: "EFFECT",
          effect: {
            action: "ADD_KEYWORD",
            target: { resultId: "summons", owner: "SELF", cardType: "WRESTLER" },
            values: { keyword: "TAUNT" },
          },
        },
      ],
    },
  };
  const source = card("script-adjacent", [script]);
  const state = { ...createInitialGameState(), cardPool: [summonedDefinition] };

  const result = enterField(state, "player-1", source, 2);
  const summoned = result.players[0].board.filter(
    (entry): entry is CardInstance => Boolean(entry) && entry.instanceId !== source.instanceId,
  );
  assert.equal(summoned.length, 2);
  assert.equal(summoned.every((entry) => entry.keywords.includes("TAUNT")), true);
  assert.deepEqual(summoned.map((entry) => entry.boardSlot).sort(), [1, 3]);
});

test("SCRIPT_V1 filters a graveyard and deterministically revives one eligible wrestler", () => {
  const script: CardEffect = {
    type: "SCRIPT",
    script: {
      version: "SCRIPT_V1",
      trigger: "ACTIVE",
      steps: [
        {
          type: "SELECT",
          id: "reviveTarget",
          target: {
            zone: "GRAVEYARD",
            owner: "SELF",
            cardType: "WRESTLER",
            selection: "RANDOM",
            count: 1,
            filter: { cost: { compare: "LTE", value: 3 } },
          },
        },
        {
          type: "EFFECT",
          effect: {
            action: "REVIVE",
            target: { resultId: "reviveTarget", zone: "GRAVEYARD", owner: "SELF", cardType: "WRESTLER" },
          },
        },
      ],
    },
  };
  const source = card("script-revive", [script]);
  const eligible = { ...card("eligible"), currentCost: 3, boardSlot: null };
  const ineligible = { ...card("ineligible"), currentCost: 4, boardSlot: null };
  const state = createInitialGameState();
  state.players[0].board[0] = source;
  state.players[0].graveyard = [eligible, ineligible];

  const result = applyEffect(
    state,
    "player-1",
    source,
    script,
  );
  assert.equal(result.players[0].graveyard.length, 1);
  assert.equal(result.players[0].graveyard[0]?.instanceId, ineligible.instanceId);
  assert.equal(result.players[0].board.some((entry) => entry?.instanceId === eligible.instanceId), true);
});

test("SCRIPT_V1 copies the best named Zombie stats or generates an exact 2/2 Zombie", () => {
  const generatedDefinition: CardDefinition = {
    id: "script-generated-zombie",
    name: "좀비",
    cardType: "WRESTLER",
    cost: 1,
    attack: 1,
    health: 1,
    rulesText: "",
    isToken: true,
    isChampionToken: false,
    keywords: [],
    abilities: [],
  };
  const script: CardEffect = {
    type: "SCRIPT",
    script: {
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [
        {
          type: "SELECT",
          id: "fieldZombies",
          target: {
            zone: "BOARD",
            owner: "SELF",
            cardType: "WRESTLER",
            filter: { definitionRef: { id: generatedDefinition.id } },
            selection: "ALL",
            count: 20,
          },
        },
        { type: "AGGREGATE", id: "zombieCount", selectionId: "fieldZombies", operation: "COUNT" },
        {
          type: "IF",
          condition: {
            left: { kind: "RESULT_VALUE", resultId: "zombieCount" },
            compare: "GT",
            right: { kind: "CONSTANT", value: 0 },
          },
          then: [{
            type: "EFFECT",
            effect: {
              action: "COPY_BEST_STATS",
              target: {
                resultId: "fieldZombies",
                zone: "BOARD",
                owner: "SELF",
                selection: "ALL",
                count: 20,
              },
            },
          }],
          else: [
            {
              type: "EFFECT",
              id: "generatedZombie",
              effect: {
                action: "GENERATE",
                values: { definitionRef: { id: generatedDefinition.id }, destination: "HAND", count: 1 },
              },
            },
            {
              type: "EFFECT",
              effect: {
                action: "SET_STATS",
                target: {
                  resultId: "generatedZombie",
                  zone: "HAND",
                  owner: "SELF",
                  selection: "ALL",
                  count: 1,
                },
                values: { attack: 2, health: 2 },
              },
            },
            {
              type: "EFFECT",
              effect: {
                action: "COPY_BEST_STATS",
                target: {
                  resultId: "generatedZombie",
                  zone: "HAND",
                  owner: "SELF",
                  selection: "ALL",
                  count: 1,
                },
              },
            },
          ],
        },
      ],
    },
  };
  const source = {
    ...card("script-zombie-copy", [script]),
    baseAttack: 3,
    currentAttack: 3,
    baseHealth: 3,
    currentHealth: 3,
    maxHealth: 3,
  };
  const initial = { ...createInitialGameState(), cardPool: [generatedDefinition] };
  const generatedResult = enterField(initial, "player-1", source, 0);
  const generatedSource = generatedResult.players[0]?.board[0];
  const generated = generatedResult.players[0]?.hand.find((entry) => entry.definitionId === generatedDefinition.id);

  assert.equal(generatedSource?.currentAttack, 5);
  assert.equal(generatedSource?.currentHealth, 5);
  assert.equal(generated?.isGenerated, true);
  assert.equal(generated?.currentAttack, 2);
  assert.equal(generated?.currentHealth, 2);
  assert.ok(generatedResult.events.some((event) => event.type === "CARD_GENERATED" && event.cardInstanceId === generated?.instanceId));

  const weakerZombie = { ...card("weaker-zombie"), definitionId: generatedDefinition.id, boardSlot: 1 as const, currentAttack: 2, currentHealth: 3, maxHealth: 3 };
  const existingZombie = { ...card("existing-zombie"), definitionId: generatedDefinition.id, boardSlot: 2 as const, currentAttack: 4, currentHealth: 5, maxHealth: 5 };
  const existingState = { ...createInitialGameState(), cardPool: [generatedDefinition] };
  existingState.players[0].board[1] = weakerZombie;
  existingState.players[0].board[2] = existingZombie;
  const existingResult = enterField(existingState, "player-1", card("script-zombie-copy-existing", [script]), 0);
  assert.equal(existingResult.players[0]?.board[0]?.currentAttack, 5);
  assert.equal(existingResult.players[0]?.board[0]?.currentHealth, 8);
  assert.equal(existingResult.players[0]?.hand.some((entry) => entry.definitionId === generatedDefinition.id), false);
});

test("SCRIPT_V1 transfers only the actual attack reduction after the chosen enemy is set to one and stunned", () => {
  const script: CardEffect = {
    type: "SCRIPT",
    script: {
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [
        {
          type: "SELECT",
          id: "target",
          target: { zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 },
        },
        { type: "AGGREGATE", id: "attackBefore", selectionId: "target", operation: "MAX", stat: "ATTACK" },
        {
          type: "IF",
          condition: {
            left: { kind: "RESULT_VALUE", resultId: "attackBefore" },
            compare: "GT",
            right: { kind: "CONSTANT", value: 1 },
          },
          then: [
            {
              type: "EFFECT",
              effect: {
                action: "SET_STAT",
                target: { resultId: "target", zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER" },
                values: { stat: "ATTACK", amount: 1 },
              },
            },
            {
              type: "EFFECT",
              effect: {
                action: "BUFF",
                target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
                values: {
                  healthExpression: { kind: "RESULT_VALUE", resultId: "attackBefore", offset: -1 },
                },
              },
            },
          ],
        },
        {
          type: "EFFECT",
          effect: {
            action: "STUN",
            target: { resultId: "target", zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER" },
          },
        },
      ],
    },
  };

  const noTarget = enterField(createInitialGameState(), "player-1", card("transfer-no-target", [script]), 0);
  assert.equal(noTarget.targetingState, undefined);
  assert.equal(noTarget.players[0]?.board[0]?.currentHealth, 3);

  const strongEnemy = { ...card("transfer-strong-enemy"), boardSlot: 2 as const, currentAttack: 4 };
  const state = createInitialGameState();
  state.players[1]!.board[2] = strongEnemy;
  const pending = enterField(state, "player-1", card("transfer-source", [script]), 0);
  assert.deepEqual(pending.targetingState?.validTargetIds, [strongEnemy.instanceId]);

  const invalid = selectEffectTarget(pending, "not-a-valid-target");
  assert.deepEqual(invalid.targetingState?.validTargetIds, [strongEnemy.instanceId]);
  assert.equal(invalid.players[1]?.board[2]?.currentAttack, 4);

  const resolved = selectEffectTarget(pending, strongEnemy.instanceId);
  assert.equal(resolved.players[1]?.board[2]?.currentAttack, 1);
  assert.equal(resolved.players[1]?.board[2]?.isStunned, true);
  assert.equal(resolved.players[0]?.board[0]?.currentHealth, 6);
  assert.equal(resolved.players[0]?.board[0]?.maxHealth, 6);
  assert.equal(resolved.targetingState, undefined);

  for (const attack of [1, 0]) {
    const lowEnemy = { ...card(`transfer-low-enemy-${attack}`), boardSlot: 3 as const, currentAttack: attack };
    const lowState = createInitialGameState();
    lowState.players[1]!.board[3] = lowEnemy;
    const lowPending = enterField(lowState, "player-1", card(`transfer-low-source-${attack}`, [script]), 0);
    const lowResult = selectEffectTarget(lowPending, lowEnemy.instanceId);
    assert.equal(lowResult.players[1]?.board[3]?.currentAttack, attack);
    assert.equal(lowResult.players[1]?.board[3]?.isStunned, true);
    assert.equal(lowResult.players[0]?.board[0]?.currentHealth, 3);
  }
});
