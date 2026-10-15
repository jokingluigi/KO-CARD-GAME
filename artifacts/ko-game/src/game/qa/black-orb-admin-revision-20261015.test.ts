import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import { generateCardInstance } from "../cards/generation";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { executeAction } from "../actions/engine-actions";
import { enterField } from "../engine/enter-field";
import type { GameState } from "../types/game-state";

const [record] = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../docs/qa/snapshots/20261015-black-orb/cards.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as PublishedCardRecord[];
const definition = cardRecordToDefinition(record);
const dummy = {
  ...definition,
  id: "black-orb-test-enemy",
  name: "격리 테스트 선수",
  cost: 0,
  attack: 1,
  health: 3,
  abilities: [],
  rulesText: "",
};
function setup(seed = 40123): GameState {
  const state = createInitialGameState();
  state.status = "IN_PROGRESS";
  state.activePlayerId = "player-1";
  state.turn = 3;
  state.randomSeed = seed;
  state.cardPool = [definition, dummy];
  for (const p of state.players) {
    p.currentGold = 10;
    p.health = 30;
    p.hand = [];
    p.deck = [];
    p.graveyard = [];
    p.board = [null, null, null, null];
  }
  state.players[0].hand = [
    generateCardInstance(definition, {
      instanceId: "black-orb",
      isGenerated: false,
    }),
  ];
  state.players[0].board[1] = {
    ...generateCardInstance(dummy, { instanceId: "ally", isGenerated: false }),
    boardSlot: 1,
  };
  return state;
}
function enemy(state: GameState, slot = 0, patch = {}) {
  state.players[1].board[slot] = {
    ...generateCardInstance(dummy, {
      instanceId: `enemy-${slot}`,
      isGenerated: false,
    }),
    boardSlot: slot as 0 | 1 | 2 | 3,
    ...patch,
  };
}
function play(state: GameState) {
  const result = executeAction(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "black-orb",
    boardSlot: 0,
  });
  assert.equal(result.success, true);
  return result.state;
}

test("black-orb revision 14 binds the exact administrator effect to one random enemy field wrestler", () => {
  assert.equal(record.version, 14);
  assert.equal(
    record.text,
    "등장:상대 필드에 있는 선수 카드들 중 무작위로 한장을 파괴합니다.",
  );
  assert.deepEqual(definition.abilities, [
    {
      trigger: "ENTER_FIELD",
      effects: [
        {
          type: "STRUCTURED",
          action: "DESTROY",
          target: {
            zone: "BOARD",
            owner: "ENEMY",
            cardType: "WRESTLER",
            selection: "RANDOM",
            count: 1,
          },
        },
      ],
    },
  ]);
});
test("black-orb actual hand play destroys one enemy without target selection, retirement or graveyard placement", () => {
  const state = setup();
  enemy(state);
  const next = play(state);
  assert.equal(next.targetingState?.active ?? false, false);
  assert.equal(next.players[1].board[0], null);
  assert.equal(next.players[1].graveyard.length, 0);
  assert.equal(next.players[0].currentGold, 5);
  assert.equal(next.players[0].board[1]?.instanceId, "ally");
  assert.equal(
    next.events.filter(
      (e) => e.type === "CARD_DESTROYED" && e.cardInstanceId === "enemy-0",
    ).length,
    1,
  );
  assert.equal(next.events.filter((e) => e.type === "CARD_RETIRED").length, 0);
});
test("black-orb with no enemy completes normally and permits the next game action", () => {
  const next = play(setup());
  assert.equal(next.targetingState?.active ?? false, false);
  assert.equal(next.players[0].board[0]?.instanceId, "black-orb");
  assert.equal(next.players[0].currentGold, 5);
  assert.equal(
    executeAction(next, { type: "END_TURN", playerId: "player-1" }).success,
    true,
  );
});
for (const variant of [
  "ordinary",
  "draft",
  "token",
  "champion-token",
  "armor",
] as const) {
  test(`black-orb field targeting includes ${variant} and destroys it through the actual play path`, () => {
    const state = setup();
    enemy(
      state,
      0,
      variant === "draft"
        ? { status: "DRAFT" }
        : variant === "token"
          ? { isToken: true }
          : variant === "champion-token"
            ? { isToken: true, isChampionToken: true }
            : variant === "armor"
              ? { keywords: ["ARMOR"], armor: 5 }
              : {},
    );
    assert.equal(play(state).players[1].board[0], null);
  });
}
test("black-orb multiple enemies resolve exactly once using the shared deterministic seed", () => {
  for (const seed of [1, 40123, 9911223, 987654321]) {
    const state = setup(seed);
    for (let i = 0; i < 4; i++) enemy(state, i);
    const a = play(structuredClone(state)),
      b = play(structuredClone(state));
    assert.equal(a.players[1].board.filter(Boolean).length, 3);
    assert.deepEqual(
      a.players[1].board.map((c) => c?.instanceId),
      b.players[1].board.map((c) => c?.instanceId),
    );
    assert.equal(a.randomSeed, b.randomSeed);
    assert.equal(a.randomSeed, seed); // The engine hashes the immutable seed plus event/source context.
    assert.equal(a.targetingState?.active ?? false, false);
    assert.equal(a.players[0].board[1]?.instanceId, "ally");
  }
});
test("effect SUMMON and REVIVE do not execute black-orb entrance effects", () => {
  for (const cause of ["SUMMON", "REVIVE"] as const) {
    const state = setup();
    enemy(state);
    const next = enterField(
      state,
      "player-1",
      state.players[0].hand[0],
      0,
      undefined,
      undefined,
      cause,
    );
    assert.equal(next.players[1].board[0]?.instanceId, "enemy-0");
  }
});
test("black-orb reviewed binding respects authored effect config and does not guess future text", () => {
  const authored = cardRecordToDefinition({
    ...record,
    effectId: "ENTER_FIELD_GAIN_GOLD",
    effectConfig: { amount: 2 },
  });
  assert.deepEqual(authored.abilities, [
    { trigger: "ENTER_FIELD", effects: [{ type: "GAIN_GOLD", amount: 2 }] },
  ]);
  const future = cardRecordToDefinition({
    ...record,
    text: "새 규칙은 별도로 구현해야 합니다.",
  });
  assert.deepEqual(future.abilities, []);
});
