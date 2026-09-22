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
  assert.equal(result.players[0].board[1]?.currentAttack, 3);
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