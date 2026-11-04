import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  aiInformationState,
  chooseBestAction,
  DEFAULT_AI_DIFFICULTY,
  AI_SEARCH_PROFILES,
  type AISearchStats,
} from "./ai-evaluator";
import { executeAction, getLegalActions } from "./engine-actions";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import { cardRecordToDefinition } from "../cards/published-cards";
import type { CardDefinition } from "../cards/types";
import type { GameState } from "../types/game-state";

test("a revealed own-deck tutor chooses useful material without learning draw order", () => {
  const s = setup();
  field(s, body, "source", 0);
  const small = { ...body, id: "qa-small", attack: 0, health: 1 },
    large = { ...body, id: "qa-large", attack: 12, health: 12 };
  s.cardPool = [body, small, large];
  s.players[0].deck = [
    generateCardInstance(small, { instanceId: "small" }),
    generateCardInstance(large, { instanceId: "large" }),
  ];
  s.targetingState = {
    active: true,
    playerId: "player-1",
    sourceInstanceId: "source",
    sourceCard: s.players[0].board[0]!,
    effects: [
      {
        type: "STRUCTURED",
        action: "MOVE_TO_HAND",
        target: {
          zone: "DECK",
          owner: "SELF",
          selection: "PLAYER_CHOICE",
          count: 1,
        },
      },
    ],
    effectIndex: 0,
    selectedTargetIds: [],
    lastTargetIds: [],
    validTargetIds: ["small", "large"],
    minTargets: 1,
    maxTargets: 1,
    mandatory: true,
    cancelable: false,
  };
  const changed = structuredClone(s);
  changed.players[0].deck.reverse();
  assert.deepEqual(
    aiInformationState(s, "player-1"),
    aiInformationState(changed, "player-1"),
  );
  const action = chooseBestAction(
    s,
    getLegalActions(s, "player-1"),
    "player-1",
  );
  assert.equal("targetId" in action ? action.targetId : "", "large");
});
const body: CardDefinition = {
  id: "qa-body",
  name: "QA",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 3,
  health: 8,
  rulesText: "",
  keywords: [],
  abilities: [],
};
function setup() {
  const s = createInitialGameState();
  Object.assign(s, {
    status: "IN_PROGRESS",
    activePlayerId: "player-1",
    turn: 5,
    events: [],
    cardPool: [body],
  });
  for (const p of s.players) {
    p.health = 25;
    p.maxHealth = 25;
    p.currentGold = 6;
    p.personalTurn = 5;
    p.mulliganUsed = true;
    p.hand = [];
    p.board = [null, null, null, null];
    p.deck = Array.from({ length: 6 }, (_, i) =>
      generateCardInstance(body, { instanceId: p.id + "-deck-" + i }),
    );
    p.graveyard = [];
    p.champion!.quest = null;
  }
  return s;
}
function field(
  s: GameState,
  d: CardDefinition,
  id: string,
  slot: 0 | 1 | 2 | 3,
  owner = 0,
) {
  s.players[owner].board[slot] = {
    ...generateCardInstance(d, { instanceId: id }),
    boardSlot: slot,
    enteredThisTurn: false,
    enteredOnTurn: 0,
  };
}
const stats = (): AISearchStats => ({
  simulations: 0,
  replySimulations: 0,
  reachedDepth: 0,
});
test("default highest AI finds a five-action lethal inside deterministic node budget", () => {
  const s = setup();
  for (const slot of [0, 1, 2, 3] as const)
    field(s, { ...body, attack: 2 }, "striker-" + slot, slot);
  s.players[1].health = 10;
  s.players[1].champion!.health = 10;
  s.players[0].champion!.ability = {
    id: "qa-face",
    name: "public hit",
    description: "",
    cost: 1,
    effects: [
      {
        type: "STRUCTURED",
        action: "DAMAGE",
        target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF" },
        values: { amount: 2 },
      },
    ],
  };
  let proof = executeAction(s, {
    type: "USE_CHAMPION_ABILITY",
    playerId: "player-1",
  }).state;
  for (const slot of [0, 1, 2, 3])
    proof = executeAction(proof, {
      type: "ATTACK",
      playerId: "player-1",
      attackerInstanceId: "striker-" + slot,
      target: { type: "PLAYER", playerId: "player-2" },
    }).state;
  assert.equal(
    proof.winnerId,
    "player-1",
    JSON.stringify({
      hp: proof.players[1].health,
      events: proof.events.slice(-6),
    }),
  );
  const metric = stats(),
    action = chooseBestAction(
      s,
      getLegalActions(s, "player-1"),
      "player-1",
      undefined,
      metric,
    );
  assert.equal(DEFAULT_AI_DIFFICULTY, "BOSS");
  assert.equal(
    metric.lethalDepth,
    5,
    JSON.stringify({ metric, action, legal: getLegalActions(s, "player-1") }),
  );
  assert.ok(metric.simulations <= AI_SEARCH_PROFILES.BOSS.budget);
  assert.ok(executeAction(s, action).success);
});
test("highest AI sees lethal in real Ninja / Hellppeok / Pain Collector interaction", () => {
  const defs = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../docs/qa/fixtures/20261104-ninja-pain-collector.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).map(cardRecordToDefinition) as CardDefinition[];
  let s = setup();
  s.cardPool = [...defs, body];
  for (const [name, id, slot] of [
    ["고통 수집가", "collector", 0],
    ["헬뻑", "hell", 1],
  ] as const) {
    s.players[0].hand = [
      generateCardInstance(
        defs.find((d) => d.name === name)!,
        { instanceId: id },
      ),
    ];
    const r = executeAction(s, {
      type: "PLAY_WRESTLER",
      playerId: "player-1",
      cardInstanceId: id,
      boardSlot: slot,
    });
    assert.ok(r.success);
    s = r.state;
  }
  s.players[0].board[0]!.enteredThisTurn = false;
  s.players[0].board[0]!.enteredOnTurn = 0;
  s.players[0].currentGold = 1;
  s.players[1].health = 3;
  s.players[1].champion!.health = 3;
  s.players[0].hand = [
    generateCardInstance(body, { instanceId: "ordinary" }),
    generateCardInstance(
      defs.find((d) => d.name === "닌자")!,
      { instanceId: "ninja" },
    ),
  ];
  const action = chooseBestAction(
    s,
    getLegalActions(s, "player-1"),
    "player-1",
  );
  assert.equal(action.type, "PLAY_WRESTLER");
  assert.equal(
    "cardInstanceId" in action ? action.cardInstanceId : "",
    "ninja",
  );
  s = executeAction(s, action).state;
  assert.equal(s.players[0].board[0]!.currentAttack, 3);
  const attack = chooseBestAction(
    s,
    getLegalActions(s, "player-1"),
    "player-1",
  );
  assert.equal(executeAction(s, attack).state.winnerId, "player-1");
});
test("mandatory full-hand discard preserves a valuable card instead of blindly dropping the first card", () => {
  const s = setup(),
    strong = { ...body, id: "big", attack: 15, health: 15 };
  s.players[0].hand = Array.from({ length: 7 }, (_, i) =>
    generateCardInstance(i === 0 ? strong : { ...body, attack: 0, health: 1 }, {
      instanceId: "hand-" + i,
    }),
  );
  s.targetingState = {
    active: true,
    playerId: "player-1",
    sourceInstanceId: "pending",
    effects: [],
    effectIndex: 0,
    selectedTargetIds: [],
    lastTargetIds: [],
    validTargetIds: s.players[0].hand.map((c) => c.instanceId),
    minTargets: 1,
    maxTargets: 1,
    mandatory: true,
    cancelable: false,
    handAddition: {
      playerId: "player-1",
      cards: [{ card: generateCardInstance(body, { instanceId: "incoming" }) }],
    },
  };
  const chosen = chooseBestAction(
    s,
    getLegalActions(s, "player-1"),
    "player-1",
  );
  assert.equal(chosen.type, "SELECT_EFFECT_TARGET");
  assert.notEqual("targetId" in chosen ? chosen.targetId : "", "hand-0");
});
test("removal targets a live damage engine over an otherwise similar vanilla body", () => {
  const s = setup(),
    defs = JSON.parse(
      readFileSync(
        new URL(
          "../../../../../docs/qa/fixtures/20261104-ninja-pain-collector.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).map(cardRecordToDefinition) as CardDefinition[];
  field(
    s,
    defs.find((d) => d.name === "고통 수집가")!,
    "enemy-engine",
    0,
    1,
  );
  field(s, { ...body, cost: 3, attack: 1, health: 5 }, "enemy-body", 1, 1);
  field(s, body, "source", 0);
  s.targetingState = {
    active: true,
    playerId: "player-1",
    sourceInstanceId: "source",
    sourceCard: s.players[0].board[0]!,
    effects: [
      {
        type: "STRUCTURED",
        action: "DESTROY",
        target: {
          zone: "BOARD",
          owner: "ENEMY",
          selection: "PLAYER_CHOICE",
          count: 1,
        },
      },
    ],
    effectIndex: 0,
    selectedTargetIds: [],
    lastTargetIds: [],
    validTargetIds: ["enemy-body", "enemy-engine"],
    minTargets: 1,
    maxTargets: 1,
    mandatory: true,
    cancelable: false,
  };
  const action = chooseBestAction(
    s,
    getLegalActions(s, "player-1"),
    "player-1",
  );
  assert.equal("targetId" in action ? action.targetId : "", "enemy-engine");
});
test("public-reply analysis never reads hidden hand identities or actual random seed", () => {
  const s = setup();
  field(s, body, "ally", 0);
  field(s, { ...body, attack: 4, health: 7 }, "enemy", 0, 1);
  s.players[1].hand = [generateCardInstance(body, { instanceId: "hidden" })];
  const changed = structuredClone(s);
  changed.randomSeed = 98765;
  changed.players[1].hand = [
    generateCardInstance(
      {
        ...body,
        attack: 999,
        cost: 0,
        abilities: [
          {
            trigger: "ACTIVE",
            effects: [{ type: "DAMAGE_OPPONENT_CHAMPION", amount: 999 }],
          },
        ],
      },
      { instanceId: "secret" },
    ),
  ];
  changed.players[0].deck.reverse();
  assert.deepEqual(
    chooseBestAction(s, getLegalActions(s, "player-1"), "player-1"),
    chooseBestAction(changed, getLegalActions(changed, "player-1"), "player-1"),
  );
});

test("hidden data stays masked inside a serialized card-play rollback too", () => {
  const s = setup();
  field(s, body, "source", 0);
  s.players[1].hand = [generateCardInstance(body, { instanceId: "private" })];
  const rollback = structuredClone(s);
  s.targetingState = {
    active: true,
    playerId: "player-1",
    sourceInstanceId: "source",
    effects: [],
    effectIndex: 0,
    selectedTargetIds: [],
    lastTargetIds: [],
    validTargetIds: [],
    minTargets: 0,
    maxTargets: 0,
    mandatory: true,
    cancelable: false,
    playRollback: rollback,
  };
  const changed = structuredClone(s);
  changed.targetingState!.playRollback!.randomSeed = 929292;
  changed.targetingState!.playRollback!.players[1].hand[0].currentAttack = 999;
  assert.deepEqual(
    aiInformationState(s, "player-1"),
    aiInformationState(changed, "player-1"),
  );
});
