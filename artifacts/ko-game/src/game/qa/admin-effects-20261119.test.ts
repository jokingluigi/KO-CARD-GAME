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
const definitions = records.map(cardRecordToDefinition);
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
for (const record of records)
  test(`${record.name}: reviewed current text has executable effects and keeps administrator status`, () => {
    const d = cardRecordToDefinition(record);
    assert.ok(d.abilities.length);
    assert.equal(d.status, record.status);
    assert.equal(d.rulesText, record.text);
  });
test("Rosetta draws the highest eligible rarity without drawing a Champion or disturbing other deck order", () => {
  let s = setup();
  const epic = { ...body, id: "epic", rarity: "EPIC" as const },
    legend = { ...technique, id: "legend", rarity: "LEGENDARY" as const },
    champ = {
      ...body,
      id: "champ",
      rarity: "CHAMPION" as const,
      isChampionToken: true,
    };
  s.cardPool!.push(epic, legend, champ);
  s.players[0].deck = [body, champ, legend, epic].map((d) =>
    generateCardInstance(d, { instanceId: "deck:" + d.id }),
  );
  s = cast(s, "로제타 마담");
  assert.deepEqual(
    s.players[0].hand.map((c) => c.definitionId),
    ["legend"],
  );
  assert.deepEqual(
    s.players[0].deck.map((c) => c.definitionId),
    [body.id, "champ", "epic"],
  );
  assert.equal(s.events.filter((e) => e.type === "CARD_DRAWN").length, 1);
});
test("Rosetta has no eligible draw when the deck only contains Champion cards", () => {
  let s = setup();
  const champ = {
    ...body,
    id: "champ",
    rarity: "CHAMPION" as const,
    isChampionToken: true,
  };
  s.cardPool!.push(champ);
  s.players[0].deck = [generateCardInstance(champ, { instanceId: "champ" })];
  s = cast(s, "로제타 마담");
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.players[0].deck.length, 1);
  assert.equal(s.players[0].fatigueCount, 0);
});
for (const hp of [2, 3, 4])
  test(`Dragon Breath at health ${hp}: only an exact pinfall hits the enemy champion`, () => {
    let s = setup();
    const victim = put(s, { ...body, health: hp }, 0, 1);
    s = cast(s, "드래곤 브레스");
    s = choose(s, victim.instanceId);
    assert.equal(s.players[1].health, hp === 3 ? 19 : 20);
    assert.equal(s.players[1].board[0]?.currentHealth ?? 0, hp === 4 ? 1 : 0);
  });
test("Briganda requires own next-turn bonus and generates only standard epic-or-legendary wrestlers with +1/+1 and Wanted", () => {
  let s = setup();
  const brig = put(s, def("알바생 브리간다"));
  const eligible = { ...body, id: "eligible", rarity: "EPIC" as const };
  s.cardPool = [
    eligible,
    { ...eligible, id: "token", isToken: true },
    { ...eligible, id: "champion", rarity: "CHAMPION", isChampionToken: true },
    { ...eligible, id: "draft", status: "DRAFT" },
    { ...eligible, id: "tech", cardType: "TECHNIQUE" },
  ];
  s.minionACardPool = s.cardPool;
  s.players[1].nextTurnGoldBonus = 1;
  s = resolveTriggeredAbilities(s, "player-1", brig, "TURN_END");
  assert.equal(s.players[0].hand.length, 0);
  s.players[0].nextTurnGoldBonus = 1;
  s = resolveTriggeredAbilities(s, "player-1", brig, "TURN_END");
  const generated = s.players[0].hand[0];
  assert.equal(generated.definitionId, "eligible");
  assert.deepEqual([generated.currentAttack, generated.currentHealth], [4, 9]);
  assert.ok(generated.keywords.includes("WANTED"));
  assert.equal(s.players[0].nextTurnGoldBonus, 1);
});
test("Knowledge messenger grows on draws and generated techniques, but not on returning a card", () => {
  let s = setup();
  const host = put(s, body, 1);
  s = cast(s, "리브, 지식의 천사");
  s = choose(s, host.instanceId);
  let c = s.players[0].board[1]!;
  assert.deepEqual([c.currentAttack, c.currentHealth], [4, 9]);
  assert.ok(getActiveCardAbilities(c).some((a) => "cardGainGrowth" in a));
  s.players[0].deck = [
    generateCardInstance(technique, { instanceId: "draw-tech" }),
  ];
  s = drawCard(s, "player-1");
  c = s.players[0].board[1]!;
  assert.deepEqual([c.currentAttack, c.currentHealth], [5, 10]);
  s = applyEffect(s, "player-1", c, {
    type: "STRUCTURED",
    action: "GENERATE",
    values: { definitionRef: { id: technique.id }, count: 1 },
  });
  assert.deepEqual(
    [
      s.players[0].board[1]!.currentAttack,
      s.players[0].board[1]!.currentHealth,
    ],
    [6, 11],
  );
  const returned = put(s, { ...body, id: "returned" }, 2);
  s = applyEffect(
    s,
    "player-1",
    c,
    {
      type: "STRUCTURED",
      action: "MOVE_TO_HAND",
      target: {
        zone: "BOARD",
        owner: "SELF",
        selection: "PLAYER_CHOICE",
        count: 1,
      },
    },
    [returned.instanceId],
  );
  assert.equal(s.players[0].board[1]!.currentAttack, 6);
});
test("Knowledge messenger draws once on its actual attack and grows once after its attack draw", () => {
  let s = setup();
  const host = put(s, body, 1);
  s = cast(s, "리브, 지식의 천사");
  s = choose(s, host.instanceId);
  s.players[0].deck = [
    generateCardInstance(technique, { instanceId: "attack-draw" }),
  ];
  const victim = put(s, { ...body, attack: 0, health: 20 }, 0, 1);
  s = act(s, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: host.instanceId,
    target: {
      type: "CARD",
      playerId: "player-2",
      cardInstanceId: victim.instanceId,
    },
  });
  assert.equal(s.events.filter((e) => e.type === "CARD_DRAWN").length, 1);
  assert.equal(s.players[0].board[1]!.currentAttack, 5);
  assert.equal(s.players[1].board[0]!.currentHealth, 16);
});
test("Edelweiss marks a target and generates Breath, repeating entry on enemy Wanted retirement only", () => {
  let s = setup();
  const first = put(s, { ...body, id: "first" }, 0, 1),
    second = put(s, { ...body, id: "second" }, 1, 1);
  s = cast(s, "에델바이스(헌터)");
  s = choose(s, first.instanceId);
  assert.ok(s.players[1].board[0]!.keywords.includes("WANTED"));
  assert.equal(
    s.players[0].hand.filter((c) => c.definitionId === def("드래곤 브레스").id)
      .length,
    1,
  );
  const edel = s.players[0].board[0]!;
  s = applyEffect(
    s,
    "player-1",
    edel,
    {
      type: "STRUCTURED",
      action: "RETIRE",
      target: {
        zone: "BOARD",
        owner: "ENEMY",
        selection: "PLAYER_CHOICE",
        count: 1,
      },
    },
    [first.instanceId],
  );
  assert.ok(s.targetingState?.validTargetIds.includes(second.instanceId));
  s = choose(s, second.instanceId);
  assert.ok(s.players[1].board[1]!.keywords.includes("WANTED"));
  assert.equal(
    s.players[0].hand.filter((c) => c.definitionId === def("드래곤 브레스").id)
      .length,
    2,
  );
});
test("Wanted notice marks enemy board and shuffles a new Star Killer into enemy deck without early arrival", () => {
  let s = setup();
  const notice = put(s, def("엄청난 현상수배서")),
    enemy = put(s, body, 0, 1);
  s = applyEffect(s, "player-1", notice, {
    type: "STRUCTURED",
    action: "RETIRE",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.ok(s.players[1].board[0]!.keywords.includes("WANTED"));
  assert.equal(s.players[1].board[0]!.instanceId, enemy.instanceId);
  assert.equal(s.players[1].deck.length, 1);
  assert.equal(s.players[1].deck[0].definitionId, def("스타 킬러").id);
  assert.ok(!s.events.some((e) => e.reason === "STAR_KILLER_ARRIVAL"));
});
test("Star Killer draw reveals, destroys Wanted on both boards, gains only actual kills, and switches ownership once", () => {
  let s = setup();
  put(s, { ...body, id: "own-wanted", keywords: ["WANTED"] });
  put(s, { ...body, id: "enemy-wanted", keywords: ["WANTED"] }, 0, 1);
  s.players[0].deck = [
    generateCardInstance(def("스타 킬러"), { instanceId: "star-drawn" }),
  ];
  s = drawCard(s, "player-1");
  assert.equal(s.players[0].hand.length, 0);
  const star = s.players[1].board.find((c) => c?.instanceId === "star-drawn")!;
  assert.ok(star);
  assert.equal(star.currentAttack, 7);
  assert.equal(
    s.events.filter(
      (e) => e.type === "CARD_REVEALED" && e.reason === "STAR_KILLER_ARRIVAL",
    ).length,
    1,
  );
  assert.equal(s.events.filter((e) => e.type === "CARD_DESTROYED").length, 2);
});
test("Star Killer generated into hand activates; shuffling it into deck does not", () => {
  let s = setup();
  const source = put(s, body);
  s = applyEffect(s, "player-1", source, {
    type: "STRUCTURED",
    action: "GENERATE",
    values: { definitionRef: { id: def("스타 킬러").id }, count: 1 },
  });
  assert.equal(s.players[0].hand.length, 0);
  assert.ok(
    s.players[1].board.some((c) => c?.definitionId === def("스타 킬러").id),
  );
  assert.equal(
    s.events.filter((e) => e.reason === "STAR_KILLER_ARRIVAL").length,
    1,
  );
});
test("Star Killer clears the cheapest opposing wrestler when the board is full without counting that as a Wanted kill", () => {
  let s = setup();
  for (const [slot, cost] of [4, 1, 3, 2].entries())
    put(s, { ...body, id: "full-" + slot, cost }, slot as 0 | 1 | 2 | 3, 1);
  s.players[0].deck = [
    generateCardInstance(def("스타 킬러"), { instanceId: "full-star" }),
  ];
  s = drawCard(s, "player-1");
  assert.equal(s.players[1].board[1]?.instanceId, "full-star");
  assert.equal(s.players[1].board[1]?.currentAttack, 3);
  assert.equal(s.players[1].board.filter(Boolean).length, 4);
  assert.ok(
    s.events.some(
      (e) => e.type === "CARD_DESTROYED" && e.cardDefinitionId === "full-1",
    ),
  );
});
test("Star Killer overdraw burns without triggering its hand-arrival effect", () => {
  let s = setup();
  s.players[0].hand = Array.from({ length: 10 }, (_, i) =>
    generateCardInstance(body, { instanceId: "hand:" + i }),
  );
  s.players[0].deck = [
    generateCardInstance(def("스타 킬러"), { instanceId: "burned-star" }),
  ];
  s = drawCard(s, "player-1");
  assert.equal(s.players[1].board.filter(Boolean).length, 0);
  assert.ok(!s.events.some((e) => e.reason === "STAR_KILLER_ARRIVAL"));
  assert.ok(
    s.players[0].removedFromGame.some((c) => c.instanceId === "burned-star"),
  );
});
test("Current administrator champion records remain executable including draft Luna and saved finisher links", () => {
  const rows = JSON.parse(
    readFileSync("docs/qa/snapshots/20261119-admin/champions.json", "utf8"),
  );
  assert.equal(rows.length, 12);
  for (const r of rows) {
    const d = championRecordToDefinition(r);
    assert.ok(d.ability.effects.length, r.name);
    assert.equal(d.status, r.status);
    if (r.questCondition?.finisher)
      assert.deepEqual(d.quest?.finisher, r.questCondition.finisher);
    if (r.questCondition?.finisherChoices)
      assert.equal(
        d.quest?.finisherChoices?.length,
        r.questCondition.finisherChoices.length,
      );
  }
});

test("Edelweiss does not repeat entry for destruction or an unmarked retirement", () => {
  for (const [action, wanted] of [
    ["DESTROY", true],
    ["RETIRE", false],
  ] as const) {
    let s = setup();
    const edel = put(s, def("에델바이스(헌터)"));
    const victim = put(
      s,
      { ...body, keywords: wanted ? ["WANTED"] : [] },
      0,
      1,
    );
    put(s, { ...body, id: "survivor" }, 1, 1);
    s = applyEffect(
      s,
      "player-1",
      edel,
      {
        type: "STRUCTURED",
        action,
        target: {
          zone: "BOARD",
          owner: "ENEMY",
          selection: "PLAYER_CHOICE",
          count: 1,
        },
      },
      [victim.instanceId],
    );
    assert.equal(s.players[0].hand.length, 0);
    assert.ok(!s.targetingState?.active);
  }
});
test("A previously generated Star Killer returned from the board does not activate again", () => {
  let s = setup();
  const source = put(s, body);
  s = applyEffect(s, "player-1", source, {
    type: "STRUCTURED",
    action: "GENERATE",
    values: { definitionRef: { id: def("스타 킬러").id }, count: 1 },
  });
  const star = s.players[1].board.find(
    (c) => c?.definitionId === def("스타 킬러").id,
  )!;
  s = applyEffect(s, "player-2", star, {
    type: "STRUCTURED",
    action: "MOVE_TO_HAND",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.ok(s.players[1].hand.some((c) => c.instanceId === star.instanceId));
  assert.equal(
    s.events.filter((e) => e.reason === "STAR_KILLER_ARRIVAL").length,
    1,
  );
});
test("Knowledge messenger does not grow on fatigue but grows on an overdraw", () => {
  let s = setup();
  const host = put(s, body, 1);
  s = cast(s, "리브, 지식의 천사");
  s = choose(s, host.instanceId);
  s = drawCard(s, "player-1");
  assert.equal(s.players[0].board[1]!.currentAttack, 4);
  s.players[0].hand = Array.from({ length: 10 }, (_, i) =>
    generateCardInstance(body, { instanceId: "full:" + i }),
  );
  s.players[0].deck = [
    generateCardInstance(technique, { instanceId: "overdraw" }),
  ];
  s = drawCard(s, "player-1");
  assert.equal(s.players[0].board[1]!.currentAttack, 5);
});

test("Current Nebra wording grants both +2/+2 and attack drain in combat", () => {
  let s = setup();
  const host = put(s, body, 1);
  const enemy = put(s, { ...body, attack: 8, health: 20 }, 0, 1);
  s = cast(s, "네브라, 어둠의 천사");
  s = choose(s, host.instanceId);
  assert.deepEqual(
    [s.players[0].board[1]!.currentAttack, s.players[0].board[1]!.maxHealth],
    [5, 10],
  );
  s = act(s, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: host.instanceId,
    target: {
      type: "WRESTLER",
      playerId: "player-2",
      cardInstanceId: enemy.instanceId,
    },
  });
  assert.equal(s.players[0].board[1]!.currentAttack, 9);
  assert.equal(s.players[1].board[0]!.currentAttack, 4);
});
test("Karzael destruction messenger replaces retirement and grows exactly once per destroyed card", () => {
  let s = setup();
  const host = put(s, body, 1);
  const enemy = put(s, { ...body, attack: 0, health: 2 }, 0, 1);
  s = cast(s, "카르자엘, 파괴의 천사");
  s = choose(s, host.instanceId);
  s = act(s, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: host.instanceId,
    target: {
      type: "WRESTLER",
      playerId: "player-2",
      cardInstanceId: enemy.instanceId,
    },
  });
  assert.equal(
    s.events.filter(
      (e) =>
        e.type === "CARD_DESTROYED" && e.cardInstanceId === enemy.instanceId,
    ).length,
    1,
  );
  assert.equal(
    s.events.filter(
      (e) => e.type === "CARD_RETIRED" && e.cardInstanceId === enemy.instanceId,
    ).length,
    0,
  );
  assert.equal(s.players[0].board[1]!.currentAttack, 6);
  assert.equal(s.players[1].graveyard.length, 0);
});
