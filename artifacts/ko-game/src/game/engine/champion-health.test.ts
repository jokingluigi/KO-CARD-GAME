import assert from "node:assert/strict";
import test from "node:test";

import { createInitialGameState } from "./create-initial-game-state";
import { useChampionAbility } from "./champion-system";
import { startGame } from "./turn-system";
import type { ChampionDefinition } from "../champions/types";

const fixedRandom = () => 0.5;

function champion(id: string, maxHealth: number, healAmount = 0): ChampionDefinition {
  return {
    id,
    name: id,
    maxHealth,
    abilityCost: 1,
    ability: {
      id: `${id}-ability`,
      name: "회복",
      description: "회복합니다.",
      effects: healAmount ? [{ type: "HEAL_CHAMPION", amount: healAmount }] : [],
    },
    quest: null,
    upgradedAbility: null,
  };
}

test("Champion maxHealth가 매치 시작 HP와 최대 HP에 반영된다", () => {
  const state = createInitialGameState(
    ["health-20", "health-25"],
    undefined,
    [champion("health-20", 20), champion("health-25", 25)],
  );
  assert.equal(state.players[0].health, 20);
  assert.equal(state.players[0].maxHealth, 20);
  assert.equal(state.players[1].health, 25);
  assert.equal(state.players[1].maxHealth, 25);
});

test("Champion maxHealth 15가 회복 상한으로 사용된다", () => {
  const started = startGame(
    createInitialGameState(
      ["health-15", "health-20"],
      undefined,
      [champion("health-15", 15, 10), champion("health-20", 20)],
    ),
    fixedRandom,
  );
  const damaged = {
    ...started,
    players: started.players.map((player) =>
      player.id === "player-1"
        ? { ...player, health: 10, champion: player.champion ? { ...player.champion, health: 10 } : null }
        : player,
    ),
  };
  const result = useChampionAbility(damaged, "player-1");
  assert.equal(result.success, true);
  assert.equal(result.state.players[0].health, 15);
  assert.equal(result.state.players[0].champion?.health, 15);
});