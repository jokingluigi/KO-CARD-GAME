import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { executeAction } from "../actions/engine-actions";
import { generateCardInstance } from "../cards/generation";
import { processChampionQuestEvents } from "./quests";
import type { CardDefinition } from "../cards/types";
import type { ChampionQuest } from "./types";
import type { CardEffect } from "../effects/types";

const card = (
  id: string,
  effects: CardEffect[] = [],
  trigger: "ENTER_FIELD" | "LEAVE_FIELD" | "TURN_END" = "ENTER_FIELD",
): CardDefinition => ({
  id,
  name: id,
  cardType: "WRESTLER",
  cost: 1,
  attack: 3,
  health: 1,
  rulesText: "",
  isToken: false,
  isChampionToken: false,
  keywords: [],
  abilities: effects.length
    ? [
        trigger === "LEAVE_FIELD"
          ? { trigger, reasons: ["RETIRE"], effects }
          : { trigger, effects },
      ]
    : [],
});
const retire: CardEffect = {
  type: "STRUCTURED",
  action: "RETIRE",
  target: { zone: "BOARD", owner: "ENEMY", selection: "ALL", count: 20 },
};
const generate: CardEffect = {
  type: "STRUCTURED",
  action: "GENERATE",
  values: { definitionRef: { id: "generated" }, count: 1 },
};
function fixture(event: ChampionQuest["trackedEvent"] = "CARD_RETIRED") {
  const state = createInitialGameState(
    undefined,
    [card("generated")],
    undefined,
    undefined,
    { randomSeed: 42 },
  );
  state.status = "IN_PROGRESS";
  state.turn = 2;
  state.activePlayerId = "player-2";
  state.events = [];
  for (const p of state.players) {
    p.hand = [];
    p.board = [null, null, null, null];
    p.currentGold = 5;
    p.mulliganUsed = true;
    p.champion!.quest = null;
  }
  const champion = state.players[0].champion!;
  champion.quest = {
    id: "opponent-turn-quest",
    name: "Opponent Turn",
    description: "",
    trackedEvent: event,
    cardType: "WRESTLER",
    requiredProgress: 2,
    reward: { type: "UPGRADE_ABILITY" },
  };
  champion.questProgress = 1;
  champion.questCompleted = false;
  return state;
}
function assertCompleted(state: ReturnType<typeof fixture>) {
  assert.equal(state.players[0].champion?.questProgress, 2);
  assert.equal(state.players[0].champion?.questCompleted, true);
  assert.equal(
    state.events.filter(
      (e) => e.type === "CHAMPION_QUEST_COMPLETED" && e.playerId === "player-1",
    ).length,
    1,
  );
  const replay = processChampionQuestEvents(
    state,
    JSON.parse(JSON.stringify(state)),
  );
  assert.equal(
    replay.events.filter(
      (e) => e.type === "CHAMPION_QUEST_COMPLETED" && e.playerId === "player-1",
    ).length,
    1,
  );
}

test("enemy attack completes allied-retirement quest on the opponent turn immediately", () => {
  const state = fixture();
  state.players[0].board[0] = {
    ...generateCardInstance(card("victim"), { instanceId: "victim" }),
    boardSlot: 0,
  };
  state.players[1].board[0] = {
    ...generateCardInstance(card("attacker"), { instanceId: "attacker" }),
    boardSlot: 0,
  };
  const result = executeAction(state, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: "attacker",
    target: {
      type: "WRESTLER",
      playerId: "player-1",
      cardInstanceId: "victim",
    },
  });
  assert.ok(result.success);
  assertCompleted(result.state);
  assert.equal(result.state.activePlayerId, "player-2");
});

test("enemy played card retires an ally and upgrades the quest during the opponent turn", () => {
  const state = fixture();
  state.players[0].board[0] = {
    ...generateCardInstance(card("victim"), { instanceId: "victim" }),
    boardSlot: 0,
  };
  state.players[1].hand = [
    generateCardInstance(card("enemy-removal", [retire]), {
      instanceId: "enemy-removal",
    }),
  ];
  const result = executeAction(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-2",
    cardInstanceId: "enemy-removal",
    boardSlot: 0,
  });
  assert.ok(result.success);
  assertCompleted(result.state);
  assert.equal(result.state.activePlayerId, "player-2");
});

test("ally leave-field generation qualifies on the opponent turn", () => {
  const state = fixture("CARD_GENERATED");
  state.players[0].board[0] = {
    ...generateCardInstance(card("victim", [generate], "LEAVE_FIELD"), {
      instanceId: "victim",
    }),
    boardSlot: 0,
  };
  state.players[1].hand = [
    generateCardInstance(card("enemy-removal", [retire]), {
      instanceId: "enemy-removal",
    }),
  ];
  const result = executeAction(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-2",
    cardInstanceId: "enemy-removal",
    boardSlot: 0,
  });
  assert.ok(result.success);
  assertCompleted(result.state);
  assert.equal(result.state.activePlayerId, "player-2");
});

test("opponent turn-end retirements are included rather than skipped by the quest cursor", () => {
  const state = fixture();
  state.players[0].board[0] = {
    ...generateCardInstance(card("victim"), { instanceId: "victim" }),
    boardSlot: 0,
  };
  state.players[1].board[0] = {
    ...generateCardInstance(card("turn-end-removal", [retire], "TURN_END"), {
      instanceId: "turn-end-removal",
    }),
    boardSlot: 0,
  };
  const result = executeAction(state, {
    type: "END_TURN",
    playerId: "player-2",
  });
  assert.ok(result.success);
  assertCompleted(result.state);
});

test("opponent turn-end ally retirement and own leave-field generation progress both quests once", () => {
  const state = fixture("CARD_GENERATED");
  state.players[0].board[0] = {
    ...generateCardInstance(card("victim", [generate], "LEAVE_FIELD"), {
      instanceId: "victim",
    }),
    boardSlot: 0,
  };
  state.players[1].board[0] = {
    ...generateCardInstance(card("turn-end-removal", [retire], "TURN_END"), {
      instanceId: "turn-end-removal",
    }),
    boardSlot: 0,
  };
  const result = executeAction(state, {
    type: "END_TURN",
    playerId: "player-2",
  });
  assert.ok(result.success);
  assertCompleted(result.state);
});

test("own turn-end generations also count and are not replayed on the next action", () => {
  const state = fixture("CARD_GENERATED");
  state.activePlayerId = "player-1";
  state.turn = 1;
  state.players[0].board[0] = {
    ...generateCardInstance(
      card("turn-end-generator", [generate], "TURN_END"),
      { instanceId: "turn-end-generator" },
    ),
    boardSlot: 0,
  };
  const result = executeAction(state, {
    type: "END_TURN",
    playerId: "player-1",
  });
  assert.ok(result.success);
  assertCompleted(result.state);
});

test("opponent damage meets a state-based health quest without waiting for the owner turn", () => {
  const state = fixture();
  state.players[0].health = 11;
  state.players[0].champion!.health = 11;
  state.players[0].champion!.quest!.condition = {
    type: "HEALTH",
    owner: "SELF",
    op: "LTE",
    value: 10,
  };
  state.players[1].board[0] = {
    ...generateCardInstance(card("attacker"), { instanceId: "attacker" }),
    boardSlot: 0,
  };
  const result = executeAction(state, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: "attacker",
    target: { type: "PLAYER", playerId: "player-1" },
  });
  assert.ok(result.success);
  assertCompleted(result.state);
  assert.equal(result.state.activePlayerId, "player-2");
});

for (const order of ["normal", "reverse"] as const)
  test(`a reward generation completes the other champion quest in the same resolution (${order})`, () => {
    const state = fixture("CARD_GENERATED");
    state.players[0].champion!.quest!.reward = {
      type: "STRUCTURED",
      effects: [generate],
    };
    state.players[1].champion!.quest = {
      id: "other-quest",
      name: "Other",
      description: "",
      trackedEvent: "CARD_PLAYED",
      requiredProgress: 1,
      reward: {
        type: "STRUCTURED",
        effects: [
          {
            type: "STRUCTURED",
            action: "GENERATE",
            target: {
              zone: "HAND",
              owner: "SELF",
              selection: "RANDOM",
              count: 1,
            },
            values: { destination: "HAND" },
          },
        ],
      },
    };
    // The first champion watches an opponent generation; reward events must be
    // read using each quest's own cursor, independently of player iteration order.
    state.players[0].champion!.quest!.condition = {
      type: "EVENT",
      owner: "ENEMY",
      event: "CARD_GENERATED",
      required: 1,
      cardType: "WRESTLER",
    };
    state.players[1].champion!.questProgress = 0;
    state.players[1].champion!.questCompleted = false;
    if (order === "reverse") state.players.reverse();
    const result = processChampionQuestEvents(state, {
      ...state,
      events: [
        { type: "CARD_PLAYED", playerId: "player-2", cardType: "WRESTLER" },
      ],
    });
    assert.ok(result.players.every((p) => p.champion?.questCompleted));
    assert.equal(
      result.events.filter((e) => e.type === "CHAMPION_QUEST_COMPLETED").length,
      2,
    );
    assert.equal(
      processChampionQuestEvents(result, result).events.filter(
        (e) => e.type === "CHAMPION_QUEST_COMPLETED",
      ).length,
      2,
    );
  });

test("enemy retirement and DESTROY do not count as an allied retirement", () => {
  const state = fixture();
  const result = processChampionQuestEvents(state, {
    ...state,
    events: [
      { type: "CARD_RETIRED", playerId: "player-2", cardType: "WRESTLER" },
      { type: "CARD_DESTROYED", playerId: "player-1", cardType: "WRESTLER" },
    ],
  });
  assert.equal(result.players[0].champion?.questProgress, 1);
  assert.equal(result.players[0].champion?.questCompleted, false);
});
