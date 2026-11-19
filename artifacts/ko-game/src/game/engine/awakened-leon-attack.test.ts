import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import { generateCardInstance } from "../cards/generation";
import type { CardDefinition } from "../cards/types";
import { createInitialGameState } from "./create-initial-game-state";
import { enterField } from "./enter-field";
import { applyEffect, resolveStateBasedDeaths } from "../effects/effect-engine";
import { destroyCard } from "./destroy-card";
import type { GameState } from "../types/game-state";
const records: PublishedCardRecord[] = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../docs/qa/snapshots/20261111-admin/cards.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const definitions = records
  .filter((r) => r.id.startsWith("crisis-awakening-"))
  .map(cardRecordToDefinition);
const unit: CardDefinition = {
  id: "leon-test-unit",
  name: "검증 선수",
  cardType: "WRESTLER",
  cost: 0,
  attack: 0,
  health: 1,
  rulesText: "",
  keywords: [],
  abilities: [],
  isToken: false,
  isChampionToken: false,
};
function setup() {
  const s = createInitialGameState(undefined, [...definitions, unit]);
  Object.assign(s, {
    status: "IN_PROGRESS",
    turn: 5,
    activePlayerId: "player-1",
    events: [],
    openingMulligan: undefined,
  });
  for (const p of s.players) {
    p.board = [null, null, null, null];
    p.hand = [];
    p.deck = [];
    p.graveyard = [];
    p.health = 25;
    p.champion!.quest = null;
  }
  return s;
}
function put(s: GameState, id: string, owner = 0, slot = 0) {
  const c = {
    ...generateCardInstance(unit, { instanceId: id }),
    boardSlot: slot as 0,
  };
  s.players[owner].board[slot] = c;
  return c;
}
function summon(s: GameState, id = "crisis-awakening-dealer", owner = 0) {
  const card = generateCardInstance(
    definitions.find((d) => d.id === id)!,
    { instanceId: id },
  );
  return enterField(
    s,
    s.players[owner].id,
    card,
    0,
    undefined,
    undefined,
    "SUMMON",
  );
}
for (const removal of ["retire", "destroy", "combat-health"] as const)
  for (const owner of [0, 1])
    test(`awakened Leon gains two after four ${removal} removals for player ${owner}`, () => {
      let s = setup();
      for (let i = 0; i < 4; i++) {
        const c = put(s, "fallen-" + i, owner);
        if (removal === "destroy")
          s = destroyCard(s, s.players[owner].id, c.instanceId).state;
        else if (removal === "combat-health") {
          c.currentHealth = 0;
          s = resolveStateBasedDeaths(s);
        } else
          s = applyEffect(s, s.players[owner].id, c, {
            type: "STRUCTURED",
            action: "RETIRE",
            target: {
              zone: "BOARD",
              owner: "SELF",
              selection: "SELF",
              count: 1,
            },
          });
        s = JSON.parse(JSON.stringify(s));
      }
      s = summon(s, undefined, owner);
      assert.equal(s.players[owner].board[0]?.currentAttack, 2);
    });
test("two previous allies plus tank and healer deaths count as four before Leon entry", () => {
  let s = setup();
  for (let i = 0; i < 2; i++) {
    const c = put(s, "earlier-" + i);
    c.currentHealth = 0;
    s = resolveStateBasedDeaths(s);
  }
  s = summon(s, "crisis-awakening-tank");
  s.players[0].board[0]!.currentHealth = 0;
  s = resolveStateBasedDeaths(s);
  assert.equal(s.players[0].board[0]?.definitionId, "crisis-awakening-healer");
  s.players[0].board[0]!.currentHealth = 0;
  s = resolveStateBasedDeaths(s);
  assert.equal(s.players[0].board[0]?.definitionId, "crisis-awakening-dealer");
  assert.equal(s.players[0].board[0]?.currentAttack, 2);
});
test("simultaneous allied deaths include the healer that summons Leon", () => {
  let s = summon(setup(), "crisis-awakening-healer");
  for (let i = 1; i < 4; i++) put(s, "simultaneous-" + i, 0, i);
  for (const c of s.players[0].board) c!.currentHealth = 0;
  s = resolveStateBasedDeaths(s);
  assert.equal(s.players[0].board[0]?.definitionId, "crisis-awakening-dealer");
  assert.equal(s.players[0].board[0]?.currentAttack, 2);
});

for (const slot of [0, 1, 2, 3])
  test(`an area hit removes four allies before healer slot ${slot} summons Leon`, () => {
    let s = setup();
    const healer = generateCardInstance(
      definitions.find((d) => d.id === "crisis-awakening-healer")!,
      { instanceId: "aoe-healer" },
    );
    s.players[0].board[slot] = {
      ...healer,
      boardSlot: slot as 0,
      currentHealth: 1,
    };
    for (let i = 0; i < 4; i++) if (i !== slot) put(s, "aoe-" + i, 0, i);
    const enemy = put(s, "enemy", 1);
    s = applyEffect(s, "player-2", enemy, {
      type: "STRUCTURED",
      action: "DAMAGE",
      target: { zone: "BOARD", owner: "ENEMY", selection: "ALL", count: 4 },
      values: { amount: 1 },
    });
    assert.equal(
      s.events.filter(
        (e) => e.type === "CARD_RETIRED" && e.playerId === "player-1",
      ).length,
      4,
    );
    const leon = s.players[0].board.find(
      (c) => c?.definitionId === "crisis-awakening-dealer",
    );
    assert.ok(leon);
    assert.equal(leon.currentAttack, 2);
  });

test("area hit counts actual retirements and excludes surviving, dodging and opposing players", () => {
  let s = setup();
  s.players[0].board[1] = {
    ...generateCardInstance(
      definitions.find((d) => d.id === "crisis-awakening-healer")!,
      { instanceId: "partial-healer" },
    ),
    boardSlot: 1,
    currentHealth: 1,
  };
  put(s, "fallen", 0, 0);
  put(s, "survivor", 0, 2).currentHealth = 5;
  const dodger = put(s, "dodger", 0, 3);
  Object.assign(dodger, {
    keywords: ["DODGE"],
    dodgeCharges: 1,
    dodgeAvailable: true,
  });
  const enemy = put(s, "enemy", 1);
  s = applyEffect(s, "player-2", enemy, {
    type: "STRUCTURED",
    action: "DAMAGE",
    target: { zone: "BOARD", owner: "ENEMY", selection: "ALL", count: 4 },
    values: { amount: 1 },
  });
  const leon = s.players[0].board.find(
    (c) => c?.definitionId === "crisis-awakening-dealer",
  );
  assert.equal(leon?.currentAttack, 1);
  assert.equal(s.players[0].graveyard.length, 2);
  assert.equal(s.removalBatch, undefined);
});
test("completed batch has no deferred state and later independent deaths do not grow an existing Leon", () => {
  let s = setup();
  for (let i = 0; i < 3; i++) {
    const c = put(s, "old-" + i);
    c.currentHealth = 0;
    s = resolveStateBasedDeaths(s);
  }
  s = summon(s);
  assert.equal(s.players[0].board[0]?.currentAttack, 1);
  const later = put(s, "later", 0, 1);
  later.currentHealth = 0;
  s = resolveStateBasedDeaths(s);
  assert.equal(s.players[0].board[0]?.currentAttack, 1);
  assert.equal(s.removalBatch, undefined);
});
