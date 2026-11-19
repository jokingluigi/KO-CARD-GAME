import { isTokenCard } from "../cards/types";
import { isEligibleForRandomPool } from "../cards/generation";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import { championRecordToDefinition } from "../champions/published-champions";
import { generateCardInstance } from "../cards/generation";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { drawCard } from "../engine/draw-card";
import {
  applyEffect,
  resolveTriggeredAbilities,
} from "../effects/effect-engine";
import { executeAction } from "../actions/engine-actions";
import {
  getActiveCardAbilities,
  getActiveCardKeywords,
} from "../cards/granted-text";
import type { CardDefinition } from "../cards/types";
import type { GameState } from "../types/game-state";
const records: PublishedCardRecord[] = JSON.parse(
  readFileSync("docs/qa/snapshots/20261119-admin/cards.json", "utf8"),
);
const latestRecords: PublishedCardRecord[] = JSON.parse(
  readFileSync("docs/qa/snapshots/20261119-refresh/cards.json", "utf8"),
);
const combinedRecords = [
  ...records.filter(
    (record) => !latestRecords.some((latest) => latest.id === record.id),
  ),
  ...latestRecords,
];
const definitions = combinedRecords.map(cardRecordToDefinition);
const def = (name: string) => {
  const d = definitions.find((d) => d.name === name);
  assert.ok(d, name);
  return d;
};
const body: CardDefinition = {
  id: "nov19-body",
  name: "검증 선수",
  cardType: "WRESTLER",
  cost: 2,
  attack: 3,
  health: 8,
  rarity: "NORMAL",
  status: "PUBLISHED",
  keywords: [],
  abilities: [],
  rulesText: "",
  isToken: false,
  isChampionToken: false,
};
const technique: CardDefinition = {
  ...body,
  id: "nov19-technique",
  name: "검증 기술",
  cardType: "TECHNIQUE",
  attack: 0,
  health: 0,
};
function setup() {
  const s = createInitialGameState();
  s.status = "IN_PROGRESS";
  s.gameId = "nov19-test";
  s.turn = 5;
  s.activePlayerId = "player-1";
  s.events = [];
  s.openingMulligan = undefined;
  s.cardPool = [...definitions, body, technique];
  s.minionACardPool = s.cardPool;
  for (const p of s.players) {
    p.board = [null, null, null, null];
    p.hand = [];
    p.deck = [];
    p.graveyard = [];
    p.removedFromGame = [];
    p.currentGold = 20;
    p.health = 20;
    p.maxHealth = 20;
    p.nextTurnGoldBonus = 0;
    p.fatigueCount = 0;
    p.champion!.quest = null;
  }
  return s;
}
function put(
  s: GameState,
  d: CardDefinition,
  slot: 0 | 1 | 2 | 3 = 0,
  owner = 0,
) {
  const c = {
    ...generateCardInstance(d, { instanceId: `${owner}:${d.id}:${slot}` }),
    boardSlot: slot,
    enteredThisTurn: false,
  };
  s.players[owner].board[slot] = c;
  return c;
}
function act(s: GameState, a: Parameters<typeof executeAction>[1]) {
  const r = executeAction(s, a);
  assert.ok(r.success, r.message);
  return r.state;
}
function choose(s: GameState, id: string) {
  return act(s, {
    type: "SELECT_EFFECT_TARGET",
    playerId: s.targetingState!.playerId,
    targetId: id,
  });
}
function cast(s: GameState, name: string) {
  const d = def(name),
    id = "play:" + d.id;
  s.players[0].hand.push(generateCardInstance(d, { instanceId: id }));
  return act(
    s,
    d.cardType === "TECHNIQUE"
      ? { type: "PLAY_TECHNIQUE", playerId: "player-1", cardInstanceId: id }
      : {
          type: "PLAY_WRESTLER",
          playerId: "player-1",
          cardInstanceId: id,
          boardSlot: 0,
        },
  );
}
for (const record of latestRecords)
  test(`${record.name}: latest administrator stats, keywords, token flags and text are preserved`, () => {
    const d = cardRecordToDefinition(record);
    assert.equal(d.cost, record.cost);
    assert.equal(d.attack, record.attack);
    assert.equal(d.health, record.health);
    assert.deepEqual(d.keywords, record.keywords);
    assert.equal(d.rarity, record.rarity);
    assert.equal(d.isToken, record.isToken);
    assert.equal(d.rulesText, record.text);
    assert.ok(d.abilities.length);
    assert.equal(d.status, record.status);
  });
function starDraw(s: GameState) {
  s.players[0].deck = [
    generateCardInstance(def("스타 킬러"), { instanceId: "refresh-star" }),
  ];
  return drawCard(s, "player-1");
}
function retire(
  s: GameState,
  source: ReturnType<typeof put>,
  victim: ReturnType<typeof put>,
  owner: "SELF" | "ENEMY" = "ENEMY",
) {
  return applyEffect(
    s,
    "player-1",
    source,
    {
      type: "STRUCTURED",
      action: "RETIRE",
      target: { zone: "BOARD", owner, selection: "PLAYER_CHOICE", count: 1 },
    },
    [victim.instanceId],
  );
}
test("latest Star Killer destroys Wanted wrestlers in both hands and boards and gains one attack per actual kill", () => {
  let s = setup();
  put(s, { ...body, id: "own-field", keywords: ["WANTED"] });
  put(s, { ...body, id: "enemy-field", keywords: ["WANTED"] }, 0, 1);
  s.players[0].hand = [
    generateCardInstance(
      { ...body, keywords: ["WANTED"] },
      { instanceId: "own-hand" },
    ),
    generateCardInstance(body, { instanceId: "safe-own" }),
  ];
  s.players[1].hand = [
    generateCardInstance(
      { ...body, keywords: ["WANTED"] },
      { instanceId: "enemy-hand" },
    ),
    generateCardInstance(body, { instanceId: "safe-enemy" }),
  ];
  s = starDraw(s);
  const star = s.players[1].board.find(
    (c) => c?.instanceId === "refresh-star",
  )!;
  assert.ok(star);
  assert.equal(star.currentAttack, 5);
  assert.equal(star.currentCost, 7);
  assert.deepEqual(star.keywords, []);
  assert.deepEqual(
    s.players[0].hand.map((c) => c.instanceId),
    ["safe-own"],
  );
  assert.deepEqual(
    s.players[1].hand.map((c) => c.instanceId),
    ["safe-enemy"],
  );
  assert.equal(s.events.filter((e) => e.type === "CARD_DESTROYED").length, 4);
  assert.equal(s.events.filter((e) => e.reason === "HAND_DESTROY").length, 2);
  assert.equal(s.players[0].nextTurnGoldBonus, 2);
  assert.ok(!s.events.some((e) => e.type === "CARD_RETIRED"));
});
test("Star Killer does not destroy Wanted techniques or cards in decks and graveyards", () => {
  let s = setup();
  s.players[1].hand = [
    generateCardInstance(
      { ...technique, keywords: ["WANTED"] },
      { instanceId: "wanted-tech" },
    ),
  ];
  s.players[1].deck = [
    generateCardInstance(
      { ...body, keywords: ["WANTED"] },
      { instanceId: "wanted-deck" },
    ),
  ];
  s.players[1].graveyard = [
    generateCardInstance(
      { ...body, keywords: ["WANTED"] },
      { instanceId: "wanted-grave" },
    ),
  ];
  s = starDraw(s);
  assert.equal(s.players[1].hand[0].instanceId, "wanted-tech");
  assert.equal(s.players[1].deck[0].instanceId, "wanted-deck");
  assert.equal(s.players[1].graveyard[0].instanceId, "wanted-grave");
  assert.equal(s.players[1].board[0]!.currentAttack, 1);
});
test("Star Killer clears the lowest-cost enemy on a full board without an extra attack bonus", () => {
  let s = setup();
  [4, 1, 3, 2].forEach((cost, i) =>
    put(s, { ...body, id: "full-" + i, cost }, i as 0 | 1 | 2 | 3, 1),
  );
  s = starDraw(s);
  assert.equal(s.players[1].board[1]?.instanceId, "refresh-star");
  assert.equal(s.players[1].board[1]?.currentAttack, 1);
  assert.equal(s.events.filter((e) => e.type === "CARD_DESTROYED").length, 1);
});
test("a Wanted Star Killer is included in the hand wipe and cannot be summoned after destroying itself", () => {
  let s = setup();
  for (let i = 0; i < 4; i++)
    put(s, { ...body, id: "full-" + i }, i as 0 | 1 | 2 | 3, 1);
  s.players[0].deck = [
    generateCardInstance(
      { ...def("스타 킬러"), keywords: ["WANTED"] },
      { instanceId: "wanted-star" },
    ),
  ];
  s = drawCard(s, "player-1");
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.players[1].board.filter(Boolean).length, 4);
  assert.ok(!s.players[1].board.some((c) => c?.instanceId === "wanted-star"));
  assert.deepEqual(
    s.events
      .filter((e) => e.type === "CARD_DESTROYED")
      .map((e) => e.cardInstanceId),
    ["wanted-star"],
  );
});
test("newly generated Star Killer uses the revised arrival effect exactly once", () => {
  let s = setup();
  const source = put(s, body);
  s.players[1].hand = [
    generateCardInstance(
      { ...body, keywords: ["WANTED"] },
      { instanceId: "generated-target" },
    ),
  ];
  s = applyEffect(s, "player-1", source, {
    type: "STRUCTURED",
    action: "GENERATE",
    values: { definitionRef: { id: def("스타 킬러").id }, count: 1 },
  });
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.players[1].hand.length, 0);
  assert.equal(s.players[1].board[0]?.currentAttack, 2);
  assert.equal(
    s.events.filter((e) => e.reason === "STAR_KILLER_ARRIVAL").length,
    1,
  );
});
test("notice puts Star Killer on the enemy deck top, preserving every previous card order", () => {
  let s = setup();
  const notice = put(s, def("엄청난 현상수배서"));
  put(s, body, 0, 1);
  s.players[1].deck = ["a", "b", "c"].map((instanceId) =>
    generateCardInstance(body, { instanceId }),
  );
  s = retire(s, notice, notice, "SELF");
  assert.deepEqual(
    s.players[1].deck.slice(1).map((c) => c.instanceId),
    ["a", "b", "c"],
  );
  assert.equal(s.players[1].deck[0].definitionId, def("스타 킬러").id);
  assert.ok(s.players[1].board[0]?.keywords.includes("WANTED"));
  assert.ok(!s.events.some((e) => e.reason === "STAR_KILLER_ARRIVAL"));
  s = drawCard(s, "player-2");
  assert.ok(
    s.players[0].board.some((c) => c?.definitionId === def("스타 킬러").id),
  );
  assert.deepEqual(
    s.players[1].deck.map((c) => c.instanceId),
    ["a", "b", "c"],
  );
});
test("Edelweiss initially chooses a target but later marks randomly without opening a target picker", () => {
  let s = setup();
  const first = put(s, { ...body, id: "first" }, 0, 1),
    second = put(s, { ...body, id: "second" }, 1, 1);
  s = cast(s, "에델바이스(헌터)");
  s = choose(s, first.instanceId);
  const edel = s.players[0].board[0]!;
  assert.ok(edel.keywords.includes("WANTED"));
  assert.equal(edel.maxHealth, 5);
  s = retire(s, edel, first);
  assert.ok(!s.targetingState?.active);
  assert.ok(s.players[1].board[1]?.keywords.includes("WANTED"));
  assert.equal(
    s.players[0].hand.filter((c) => c.definitionId === def("드래곤 브레스").id)
      .length,
    2,
  );
});
test("Edelweiss still creates Breath when the last Wanted enemy retires and no random target remains", () => {
  let s = setup();
  const victim = put(s, { ...body, keywords: ["WANTED"] }, 0, 1),
    edel = put(s, def("에델바이스(헌터)"));
  s = retire(s, edel, victim);
  assert.ok(!s.targetingState?.active);
  assert.equal(s.players[0].hand[0]?.definitionId, def("드래곤 브레스").id);
});
test("Edelweiss ignores own Wanted retirement, unmarked enemy retirement and enemy destruction", () => {
  for (const scenario of ["own", "unmarked", "destroy"] as const) {
    let s = setup();
    const edel = put(s, def("에델바이스(헌터)"));
    const victim = put(
      s,
      {
        ...body,
        id: scenario,
        keywords: scenario === "unmarked" ? [] : ["WANTED"],
      },
      1,
      scenario === "own" ? 0 : 1,
    );
    if (scenario === "destroy")
      s = applyEffect(s, "player-1", edel, {
        type: "STRUCTURED",
        action: "DESTROY",
        target: { zone: "BOARD", owner: "ENEMY", selection: "ALL", count: 4 },
      });
    else s = retire(s, edel, victim, scenario === "own" ? "SELF" : "ENEMY");
    assert.equal(s.players[0].hand.length, 0);
  }
});
test("legendary-token Pandora remains a token while its turn-end absorb and dodge still work", () => {
  let s = setup();
  const wolf = put(s, def("늑대인간 판도라"));
  const victim = put(s, body, 1);
  assert.equal(def("늑대인간 판도라").rarity, "LEGENDARY");
  assert.equal(wolf.isToken, true);
  const charges = wolf.dodgeCharges ?? 0;
  s = resolveTriggeredAbilities(s, "player-1", wolf, "TURN_END");
  s = choose(s, victim.instanceId);
  assert.equal(s.players[0].board[1], null);
  assert.equal(s.players[0].board[0]?.currentAttack, 6);
  assert.equal(s.players[0].board[0]?.currentHealth, 12);
  assert.equal(s.players[0].board[0]?.dodgeCharges, charges + 1);
});

test("legendary token flags override rarity for token classification and standard random generation", () => {
  const token = def("늑대인간 판도라");
  assert.equal(isTokenCard(token), true);
  assert.equal(isEligibleForRandomPool(token, "STANDARD"), false);
  assert.equal(isEligibleForRandomPool(token, "FULL"), true);
  let s = setup();
  const brig = put(s, def("알바생 브리간다"));
  const ordinary = {
    ...body,
    id: "ordinary-legendary",
    rarity: "LEGENDARY" as const,
  };
  s.cardPool = [token, ordinary];
  s.minionACardPool = s.cardPool;
  s.players[0].nextTurnGoldBonus = 1;
  s = resolveTriggeredAbilities(s, "player-1", brig, "TURN_END");
  assert.equal(s.players[0].hand[0]?.definitionId, "ordinary-legendary");
  assert.equal(s.players[0].hand[0]?.isToken, false);
});

test("destroying a Wanted card in hand does not count as a field destruction for a destruction messenger", () => {
  let s = setup();
  const host = put(s, body, 1);
  s = cast(s, "카르자엘, 파괴의 천사");
  s = choose(s, host.instanceId);
  const attack = s.players[0].board[1]!.currentAttack;
  s.players[1].hand = [
    generateCardInstance(
      { ...body, keywords: ["WANTED"] },
      { instanceId: "hand-only-destroy" },
    ),
  ];
  s = starDraw(s);
  assert.equal(s.players[0].board[1]!.currentAttack, attack);
  assert.equal(s.players[1].board[0]?.currentAttack, 2);
});
