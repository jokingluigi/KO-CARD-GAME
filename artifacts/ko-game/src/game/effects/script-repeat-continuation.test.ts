import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import { executeAction } from "../actions/engine-actions";
import type { CardDefinition } from "../cards/types";
import type { GameState } from "../types/game-state";
const ally: CardDefinition = {
  id: "repeat-ally",
  name: "Repeat ally",
  cardType: "WRESTLER",
  cost: 1,
  attack: 1,
  health: 10,
  rulesText: "",
  keywords: [],
  abilities: [],
  isToken: false,
  isChampionToken: false,
};
const caster: CardDefinition = {
  ...ally,
  id: "repeat-caster",
  abilities: [
    {
      trigger: "ACTIVE",
      effects: [
        {
          type: "SCRIPT",
          script: {
            version: "SCRIPT_V1",
            trigger: "ACTIVE",
            steps: [
              {
                type: "REPEAT",
                count: { kind: "CONSTANT", value: 2 },
                steps: [
                  {
                    type: "SELECT",
                    id: "target",
                    target: {
                      zone: "BOARD",
                      owner: "SELF",
                      cardType: "WRESTLER",
                      selection: "PLAYER_CHOICE",
                      count: 1,
                    },
                  },
                  {
                    type: "EFFECT",
                    effect: {
                      action: "BUFF",
                      target: {
                        resultId: "target",
                        zone: "BOARD",
                        owner: "SELF",
                      },
                      values: { attack: 1, health: 0 },
                    },
                  },
                ],
              },
              {
                type: "EFFECT",
                effect: { action: "DRAW", values: { amount: 1 } },
              },
            ],
          },
        },
      ],
    },
  ],
};
function setup() {
  const s = createInitialGameState(undefined, [ally, caster]);
  s.status = "IN_PROGRESS";
  s.activePlayerId = "player-1";
  s.players[0].currentGold = 6;
  s.players[0].hand = [];
  s.players[0].deck = [generateCardInstance(ally, { instanceId: "draw" })];
  s.players[0].board = [
    {
      ...generateCardInstance(caster, { instanceId: "caster" }),
      boardSlot: 0,
      enteredThisTurn: false,
    },
    {
      ...generateCardInstance(ally, { instanceId: "ally" }),
      boardSlot: 1,
      enteredThisTurn: false,
    },
    null,
    null,
  ];
  return s;
}
function choose(s: GameState) {
  const r = executeAction(JSON.parse(JSON.stringify(s)), {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "ally",
  });
  assert.ok(r.success, r.success ? "" : r.errorCode);
  return r.state;
}
test("REPEAT target choices pause and resume twice across serialized state, then execute the tail exactly once", () => {
  const initial = setup();
  const before = JSON.stringify(initial);
  const started = executeAction(initial, {
    type: "USE_ACTIVE",
    playerId: "player-1",
    cardInstanceId: "caster",
  });
  assert.ok(started.success);
  assert.equal(JSON.stringify(initial), before);
  assert.equal(started.state.targetingState?.active, true);
  let state = choose(started.state);
  assert.equal(state.players[0].board[1]?.currentAttack, 2);
  assert.equal(state.players[0].hand.length, 0);
  assert.equal(state.targetingState?.active, true);
  state = choose(state);
  assert.equal(state.players[0].board[1]?.currentAttack, 3);
  assert.equal(state.players[0].hand.length, 1);
  assert.equal(state.players[0].hand[0].instanceId, "draw");
  assert.equal(state.targetingState?.active ?? false, false);
  assert.equal(
    executeAction(state, {
      type: "USE_ACTIVE",
      playerId: "player-1",
      cardInstanceId: "caster",
    }).success,
    false,
  );
});
test("finishing the match inside a REPEAT does not execute later iterations or the script tail", () => {
  const s = setup();
  const finishing = {
    ...caster,
    abilities: [
      {
        trigger: "ACTIVE" as const,
        effects: [
          {
            type: "SCRIPT" as const,
            script: {
              version: "SCRIPT_V1" as const,
              trigger: "ACTIVE" as const,
              steps: [
                {
                  type: "REPEAT" as const,
                  count: { kind: "CONSTANT" as const, value: 3 },
                  steps: [
                    {
                      type: "EFFECT" as const,
                      effect: {
                        action: "DAMAGE" as const,
                        target: {
                          zone: "PLAYER" as const,
                          owner: "ENEMY" as const,
                          selection: "SELF" as const,
                          count: 1,
                        },
                        values: { amount: 99 },
                      },
                    },
                  ],
                },
                {
                  type: "EFFECT" as const,
                  effect: { action: "DRAW" as const, values: { amount: 1 } },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  s.players[0].board[0] = {
    ...generateCardInstance(finishing, { instanceId: "caster" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  const r = executeAction(s, {
    type: "USE_ACTIVE",
    playerId: "player-1",
    cardInstanceId: "caster",
  });
  assert.ok(r.success);
  assert.equal(r.state.status, "FINISHED");
  assert.equal(r.state.players[0].hand.length, 0);
  assert.equal(
    r.state.events.filter((e) => e.type === "DAMAGE_DEALT").length,
    1,
  );
});

test("REPEAT pauses for the opponent full-board awakening reward, survives JSON transport, then resumes damage and draws once", async () => {
  const { readFileSync } = await import("node:fs");
  const { cardRecordToDefinition } = await import("../cards/published-cards");
  const { championRecordToDefinition } =
    await import("../champions/published-champions");
  const records = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../docs/qa/snapshots/20261013-admin/champions.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const defender = championRecordToDefinition(
    records.find((r: any) => r.name === "AWAKEN_CHAMPION"),
  );
  const state = setup();
  state.cardPool = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../docs/qa/snapshots/20261013-admin/cards.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).map(cardRecordToDefinition);
  state.players[1].champion = {
    ...state.players[1].champion,
    ...defender,
    questProgress: 0,
    questCompleted: false,
  };
  state.players[1].health = 6;
  state.players[1].board = [0, 1, 2, 3].map((slot) => ({
    ...generateCardInstance(ally, { instanceId: "defender-" + slot }),
    boardSlot: slot as 0 | 1 | 2 | 3,
    enteredThisTurn: false,
  }));
  const damage: CardDefinition = {
    ...caster,
    abilities: [
      {
        trigger: "ACTIVE",
        effects: [
          {
            type: "SCRIPT",
            script: {
              version: "SCRIPT_V1",
              trigger: "ACTIVE",
              steps: [
                {
                  type: "REPEAT",
                  count: { kind: "CONSTANT", value: 3 },
                  steps: [
                    {
                      type: "EFFECT",
                      effect: {
                        action: "DAMAGE",
                        target: {
                          zone: "PLAYER",
                          owner: "ENEMY",
                          selection: "SELF",
                          count: 1,
                        },
                        values: { amount: 1 },
                      },
                    },
                  ],
                },
                {
                  type: "EFFECT",
                  effect: { action: "DRAW", values: { amount: 1 } },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  state.players[0].board[0] = {
    ...generateCardInstance(damage, { instanceId: "caster" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  const started = executeAction(state, {
    type: "USE_ACTIVE",
    playerId: "player-1",
    cardInstanceId: "caster",
  });
  assert.ok(started.success, started.success ? "" : started.errorCode);
  assert.equal(started.state.players[1].health, 5);
  assert.equal(started.state.targetingState?.playerId, "player-2");
  assert.ok(started.state.targetingState?.championRewardReplacement);
  assert.equal(started.state.players[0].hand.length, 0);
  const pending = JSON.parse(JSON.stringify(started.state)) as GameState;
  const selected = executeAction(pending, {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-2",
    targetId: pending.targetingState!.validTargetIds[0],
  });
  assert.ok(selected.success, selected.success ? "" : selected.errorCode);
  assert.equal(
    selected.state.players[1].health,
    5,
    "the deployed awakening tank protects its champion from the two resumed hits",
  );
  assert.equal(
    selected.state.players[1].champion.awakening?.championInvulnerable,
    true,
  );
  assert.equal(selected.state.players[0].hand.length, 1);
  assert.equal(selected.state.players[0].hand[0].instanceId, "draw");
  assert.equal(selected.state.targetingState?.active ?? false, false);
  assert.equal(
    selected.state.events.filter(
      (e) => e.type === "CHAMPION_QUEST_COMPLETED" && e.playerId === "player-2",
    ).length,
    1,
  );
  assert.equal(
    selected.state.players[1].board.filter(
      (c) => c?.definitionId === "crisis-awakening-tank",
    ).length,
    1,
  );
});
