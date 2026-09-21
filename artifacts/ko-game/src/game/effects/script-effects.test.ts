import assert from "node:assert/strict";
import test from "node:test";

import { generateCard } from "../cards/generation";
import type { CardDefinition, CardInstance } from "../cards/types";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { enterField } from "../engine/enter-field";
import type { CardEffect } from "./types";

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