import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import {
  championRecordToDefinition,
  type PublishedChampionRecord,
} from "../champions/published-champions";
import { generateCardInstance } from "../cards/generation";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { executeAction } from "../actions/engine-actions";
import type { CardDefinition } from "../cards/types";
const records = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../docs/qa/snapshots/20261019-admin/cards.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as PublishedCardRecord[];
const defs = records.map(cardRecordToDefinition);
const def = (name: string) => defs.find((d) => d.name === name)!;
const unit: CardDefinition = {
  id: "oct19-vanilla",
  name: "검증 선수",
  cardType: "WRESTLER",
  cost: 1,
  attack: 2,
  health: 10,
  rulesText: "",
  keywords: [],
  abilities: [],
  tags: [],
  status: "PUBLISHED",
  isToken: false,
  isChampionToken: false,
};
const tagged = { ...unit, id: "oct19-authority", tags: ["디 어쏘리티"] };
function setup() {
  const s = createInitialGameState(undefined, defs);
  s.cardPool = [...defs, unit, tagged];
  s.minionACardPool = s.cardPool;
  s.status = "IN_PROGRESS";
  s.turn = 3;
  s.activePlayerId = "player-1";
  s.events = [];
  for (const p of s.players) {
    p.hand = [];
    p.deck = [];
    p.board = [null, null, null, null];
    p.currentGold = 99;
    p.health = 15;
    p.maxHealth = 30;
    p.champion!.health = 15;
    p.champion!.maxHealth = 30;
    p.champion!.quest = undefined;
  }
  return s;
}
function play(s: ReturnType<typeof setup>, name: string, slot = 0) {
  const d = def(name);
  s.players[0].hand.push(generateCardInstance(d, { instanceId: "source" }));
  const r = executeAction(
    s,
    d.cardType === "TECHNIQUE"
      ? {
          type: "PLAY_TECHNIQUE",
          playerId: "player-1",
          cardInstanceId: "source",
        }
      : {
          type: "PLAY_WRESTLER",
          playerId: "player-1",
          cardInstanceId: "source",
          boardSlot: slot as 0,
        },
  );
  assert.ok(r.success, r.message);
  return r.state;
}
test("latest authenticated records retain all administrator wording, numbers, visibility and keywords", () => {
  for (const record of records) {
    const d = cardRecordToDefinition(record);
    assert.equal(d.rulesText, record.text, record.name);
    assert.equal(d.cost, record.cost, record.name);
    assert.equal(d.status, record.status, record.name);
    assert.doesNotThrow(() => JSON.stringify(d));
  }
});
for (const witness of [false, true])
  test(`Cook creates exactly one Feast at latest cost with allied tag=${witness}`, () => {
    const s = setup();
    if (witness)
      s.players[0].board[1] = {
        ...generateCardInstance(tagged, { instanceId: "witness" }),
        boardSlot: 1,
      };
    else
      s.players[1].board[1] = {
        ...generateCardInstance(tagged, { instanceId: "enemy-witness" }),
        boardSlot: 1,
      };
    const n = play(s, "휴먼쿠커");
    assert.equal(n.players[0].hand.length, 1);
    assert.equal(n.players[0].hand[0].definitionId, "epic-spell-feast");
    assert.equal(
      n.players[0].hand[0].currentCost,
      Math.max(0, def("만찬").cost - 1),
    );
    assert.equal(n.players[0].board[0]!.maxHealth, 4);
  });
test("Feast applies +2 current and maximum HP to both allies and champion, without healing event or enemy changes", () => {
  const s = setup();
  s.players[0].board[0] = {
    ...generateCardInstance(unit, { instanceId: "a" }),
    boardSlot: 0,
    currentHealth: 1,
  };
  s.players[0].board[1] = {
    ...generateCardInstance(unit, { instanceId: "b" }),
    boardSlot: 1,
  };
  s.players[1].board[0] = {
    ...generateCardInstance(unit, { instanceId: "e" }),
    boardSlot: 0,
  };
  const n = play(s, "만찬");
  assert.deepEqual(
    n.players[0].board.slice(0, 2).map((c) => [c!.currentHealth, c!.maxHealth]),
    [
      [3, 12],
      [12, 12],
    ],
  );
  assert.deepEqual(
    [
      n.players[0].health,
      n.players[0].maxHealth,
      n.players[0].champion!.health,
      n.players[0].champion!.maxHealth,
    ],
    [17, 32, 17, 32],
  );
  assert.equal(n.players[1].health, 15);
  assert.equal(n.players[1].board[0]!.maxHealth, 10);
  assert.equal(n.events.filter((e) => e.type === "HEALED").length, 0);
});
test("Ruina gives lifesteal only to generated card and buffs from hand tags after generation, excluding field and deck", () => {
  const s = setup();
  s.cardPool = [def("루이나"), tagged];
  s.minionACardPool = s.cardPool;
  s.players[0].hand = [
    generateCardInstance(tagged, { instanceId: "existing" }),
  ];
  s.players[0].deck = [generateCardInstance(tagged, { instanceId: "deck" })];
  s.players[0].board[1] = {
    ...generateCardInstance(tagged, { instanceId: "field" }),
    boardSlot: 1,
  };
  const n = play(s, "루이나");
  const created = n.players[0].hand.find((c) => c.instanceId !== "existing")!;
  assert.equal(created.definitionId, tagged.id);
  assert.ok(created.keywords.includes("LIFESTEAL"));
  assert.ok(
    !n.players[0].hand
      .find((c) => c.instanceId === "existing")!
      .keywords.includes("LIFESTEAL"),
  );
  assert.ok(!n.players[0].board[0]!.keywords.includes("LIFESTEAL"));
  assert.equal(n.players[0].board[0]!.currentAttack, def("루이나").attack + 2);
  assert.equal(n.players[0].board[0]!.maxHealth, def("루이나").health + 2);
});
test("Ruina no candidate does not invent a generated card or count board cards", () => {
  const s = setup();
  s.cardPool = [def("루이나")];
  s.minionACardPool = s.cardPool;
  const n = play(s, "루이나");
  assert.equal(n.players[0].hand.length, 0);
  assert.equal(n.players[0].board[0]!.currentAttack, def("루이나").attack);
});
test("Joking Luigi revised wording still summons adjacent public tag wrestlers with taunt and +1/+1", () => {
  const s = setup();
  s.cardPool = [tagged];
  s.minionACardPool = s.cardPool;
  const n = play(s, "조킹루이지", 1);
  for (const slot of [0, 2]) {
    const c = n.players[0].board[slot]!;
    const base = n.cardPool!.find((d) => d.id === c.definitionId)!;
    assert.ok([tagged.id, def("조킹루이지").id].includes(c.definitionId));
    assert.ok(c.keywords.includes("TAUNT"));
    assert.equal(c.currentAttack, base.attack + 1);
  }
  assert.equal(n.players[0].board[1]!.currentAttack, def("조킹루이지").attack);
});
test("unknown future wording is not silently rebound to October 19 behavior", () => {
  const record = records.find((r) => r.name === "만찬")!;
  const changed = cardRecordToDefinition({
    ...record,
    text: "관리자 확인 필요",
    effectId: null,
    effectConfig: {},
  });
  assert.equal(changed.rulesText, "관리자 확인 필요");
  assert.equal(changed.abilities.length, 0);
});

test("latest champion health and newly removed dodge keywords are not restored from legacy definitions", () => {
  const champions = JSON.parse(
    readFileSync(
      new URL(
        "../../../../../docs/qa/snapshots/20261019-admin/champions.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as PublishedChampionRecord[];
  for (const record of champions)
    assert.equal(
      championRecordToDefinition(record).maxHealth,
      record.maxHealth,
      record.name,
    );
  for (const name of ["스카드", "카미사토르"]) {
    assert.ok(!def(name).keywords.includes("DODGE"));
    assert.ok(def(name).keywords.includes("SURPRISE"));
  }
  assert.equal(def("루나").cost, 5);
  assert.equal(def("조킹루이지").cost, 6);
  assert.equal(def("카미사토르").health, 3);
  assert.equal(def("카산드라").health, 4);
  assert.equal(def("판도라").attack, 2);
  assert.equal(def("판도라").health, 2);
  assert.equal(def("루이나").status, "DISABLED");
});

test("Cook zero-discount branch when no allied authority tag exists; enemy tags do not count", () => {
  const s = setup();
  const cook = { ...def("휴먼쿠커"), tags: [] };
  s.cardPool = [...s.cardPool!.filter((d) => d.id !== cook.id), cook];
  s.minionACardPool = s.cardPool;
  s.players[0].hand = [generateCardInstance(cook, { instanceId: "source" })];
  s.players[1].board[1] = {
    ...generateCardInstance(tagged, { instanceId: "enemy" }),
    boardSlot: 1,
  };
  const r = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "source",
    boardSlot: 0,
  });
  assert.ok(r.success);
  assert.equal(r.state.players[0].hand.length, 1);
  assert.equal(r.state.players[0].hand[0].currentCost, def("만찬").cost);
});
