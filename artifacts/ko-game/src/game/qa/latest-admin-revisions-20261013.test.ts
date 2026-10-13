import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import { executeAction } from "../actions/engine-actions";
import { healNewCardAware } from "../engine/new-card-rules";
import { completeMinionACatalog } from "../champions/minion-a";
import type { CardDefinition } from "../cards/types";
import type { GameState } from "../types/game-state";

const records: PublishedCardRecord[] = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../docs/qa/snapshots/20261013-admin/cards.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const definitions = records.map(cardRecordToDefinition);
test("current full random catalog preserves all 129 stored IDs without an extra synthetic Zombie slot", () => {
  assert.deepEqual(
    completeMinionACatalog(records)
      .map((card) => card.id)
      .sort(),
    records.map((card) => card.id).sort(),
  );
});
const basic: CardDefinition = {
  id: "audit-target",
  name: "Audit target",
  cardType: "WRESTLER",
  cost: 2,
  attack: 0,
  health: 10,
  rulesText: "",
  keywords: ["TAUNT"],
  abilities: [],
  isToken: false,
  isChampionToken: false,
};
function setup(name: string) {
  const definition = definitions.find((card) => card.name === name)!;
  const state = createInitialGameState(undefined, [...definitions, basic]);
  state.status = "IN_PROGRESS";
  state.activePlayerId = "player-1";
  state.turn = 3;
  for (const player of state.players) {
    player.hand = [];
    player.board = [null, null, null, null];
    player.deck = [];
    player.graveyard = [];
    player.currentGold = 20;
    if (player.champion) player.champion.quest = null;
  }
  state.players[0].hand = [
    generateCardInstance(definition, { instanceId: "source" }),
  ];
  return state;
}
function run(state: GameState, action: Parameters<typeof executeAction>[1]) {
  const result = executeAction(state, action);
  assert.ok(
    result.success,
    result.success ? "" : result.errorCode + ": " + result.message,
  );
  return result.state;
}
function target(state: GameState, id: string) {
  assert.ok(
    state.targetingState?.active,
    "actual action must request a target",
  );
  const type =
    state.targetingState.phase === "PRE_COMMIT"
      ? "CONFIRM_PRECOMMIT_TARGET"
      : "SELECT_EFFECT_TARGET";
  return run(state, { type, playerId: "player-1", targetId: id });
}
function opponent(
  state: GameState,
  id: string,
  cost = 2,
  health = 10,
  slot = 0,
) {
  state.players[1].board[slot] = {
    ...generateCardInstance({ ...basic, cost }, { instanceId: id }),
    boardSlot: slot as 0,
    currentHealth: health,
    enteredThisTurn: false,
  };
}

test("current Arbiter enters through PLAY_WRESTLER and silences exactly one enemy costing at most three", () => {
  let state = setup("아비터");
  opponent(state, "eligible", 3);
  opponent(state, "expensive", 4, 10, 1);
  const before = JSON.stringify(state);
  const one = run(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "source",
    boardSlot: 0,
  });
  assert.equal(JSON.stringify(state), before, "input remains immutable");
  assert.equal(one.players[1].board[0]?.isSilenced, true);
  assert.equal(one.players[1].board[1]?.isSilenced, false);
  assert.equal(
    one.players[0].board[0]?.armor,
    1,
    "stored armor survives the new effect",
  );
  assert.equal(
    one.targetingState?.active ?? false,
    false,
    "random silence does not ask for user selection",
  );
  const two = run(JSON.parse(before), {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "source",
    boardSlot: 0,
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(one)),
    JSON.parse(JSON.stringify(two)),
    "the existing seeded RNG gives the same serialized outcome",
  );
});
test("current Arbiter has no target when only expensive enemies exist", () => {
  let state = setup("아비터");
  opponent(state, "expensive", 4);
  state = run(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "source",
    boardSlot: 0,
  });
  assert.equal(state.players[1].board[0]?.isSilenced, false);
  assert.equal(state.targetingState?.active ?? false, false);
});
test("current Casto uses actual selected ally HP for its active and does not keep obsolete overheal growth", () => {
  let state = setup("카스토");
  const source = state.players[0].hand.pop()!;
  state.players[0].board[0] = {
    ...source,
    boardSlot: 0,
    enteredThisTurn: false,
  };
  state.players[0].board[1] = {
    ...generateCardInstance(basic, { instanceId: "ally" }),
    boardSlot: 1,
    currentHealth: 3,
    enteredThisTurn: false,
  };
  opponent(state, "enemy");
  const attack = source.currentAttack;
  state = run(state, {
    type: "USE_ACTIVE",
    playerId: "player-1",
    cardInstanceId: "source",
  });
  assert.ok(!state.targetingState?.validTargetIds.includes("enemy"));
  state = target(state, "ally");
  assert.equal(state.players[0].board[0]?.currentAttack, attack + 3);
  assert.equal(state.players[0].board[1]?.currentHealth, 3);
  assert.equal(
    executeAction(state, {
      type: "USE_ACTIVE",
      playerId: "player-1",
      cardInstanceId: "source",
    }).success,
    false,
    "existing once-per-turn limit remains",
  );
  const maximum = state.players[0].maxHealth;
  state.players[0].health = maximum;
  state = healNewCardAware(state, "player-1", 2);
  assert.equal(
    state.players[0].maxHealth,
    maximum,
    "the removed passive must not grow max HP",
  );
});
test("current Pandora enter damage and pinfall are separate actual actions; health one is not pinfall", () => {
  let state = setup("판도라");
  opponent(state, "enemy", 2, 2);
  state = run(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "source",
    boardSlot: 0,
  });
  state = target(state, "enemy");
  assert.equal(state.players[1].board[0]?.currentHealth, 1);
  const source = state.players[0].board[0]!;
  assert.equal(
    source.currentAttack,
    definitions.find((card) => card.name === "판도라")!.attack,
  );
  source.enteredThisTurn = false;
  source.currentAttack = 1;
  const maximum = source.maxHealth;
  state = run(state, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: "source",
    target: { type: "WRESTLER", playerId: "player-2", cardInstanceId: "enemy" },
  });
  assert.equal(
    state.players[1].graveyard.some((card) => card.instanceId === "enemy"),
    true,
  );
  assert.equal(state.players[0].board[0]?.currentAttack, 3);
  assert.equal(state.players[0].board[0]?.maxHealth, maximum + 2);
});
test("current Pandora exact-zero entrance damage triggers pinfall", () => {
  let state = setup("판도라");
  opponent(state, "enemy", 2, 1);
  state = run(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "source",
    boardSlot: 0,
  });
  state = target(state, "enemy");
  assert.equal(
    state.players[0].board[0]?.currentAttack,
    definitions.find((card) => card.name === "판도라")!.attack + 2,
    "exact-zero effect damage grants pinfall",
  );
});

test("current Pandora overkill grants no pinfall bonus", () => {
  let state = setup("판도라");
  const source = state.players[0].hand.pop()!;
  state.players[0].board[0] = {
    ...source,
    boardSlot: 0,
    enteredThisTurn: false,
    currentAttack: 3,
  };
  opponent(state, "enemy", 2, 1);
  const health = source.maxHealth;
  state = run(state, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: "source",
    target: { type: "WRESTLER", playerId: "player-2", cardInstanceId: "enemy" },
  });
  assert.equal(state.players[0].board[0]?.currentAttack, 3);
  assert.equal(state.players[0].board[0]?.maxHealth, health);
});
test("Zombie Dehun personal retirement creates its current linked zombie on the allied field, not in hand", () => {
  let state = setup("좀비 데헌");
  const source = state.players[0].hand.pop()!;
  state.players[0].board[0] = {
    ...source,
    boardSlot: 0,
    enteredThisTurn: false,
    currentAttack: 3,
  };
  opponent(state, "enemy", 2, 1);
  state = run(state, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: "source",
    target: { type: "WRESTLER", playerId: "player-2", cardInstanceId: "enemy" },
  });
  assert.equal(
    state.players[0].board.filter(
      (card) => card?.definitionId === "66143efe-2eec-450a-8570-9a4c4d92330e",
    ).length,
    1,
  );
  assert.equal(state.players[0].hand.length, 0);
});
test("Zombie Dehun generation merges into an existing zombie even when allied field is full", () => {
  let state = setup("좀비 데헌");
  const source = state.players[0].hand.pop()!;
  state.players[0].board[0] = {
    ...source,
    boardSlot: 0,
    enteredThisTurn: false,
    currentAttack: 3,
  };
  const zombie = definitions.find(
    (card) => card.id === "66143efe-2eec-450a-8570-9a4c4d92330e",
  )!;
  state.players[0].board[1] = {
    ...generateCardInstance(zombie, { instanceId: "zombie" }),
    boardSlot: 1,
    enteredThisTurn: false,
  };
  for (const slot of [2, 3] as const)
    state.players[0].board[slot] = {
      ...generateCardInstance(basic, { instanceId: "ally-" + slot }),
      boardSlot: slot,
      enteredThisTurn: false,
    };
  opponent(state, "enemy", 2, 1);
  state = run(state, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: "source",
    target: { type: "WRESTLER", playerId: "player-2", cardInstanceId: "enemy" },
  });
  assert.equal(
    state.players[0].board.filter((card) => card?.definitionId === zombie.id)
      .length,
    1,
  );
  assert.ok(
    state.players[0].board[1]!.currentAttack >= 3,
    "existing zombie receives retirement growth and merged summon stats",
  );
  assert.equal(state.players[0].hand.length, 0);
});
