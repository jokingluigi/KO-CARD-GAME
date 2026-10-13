import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import { generateCardInstance } from "../cards/generation";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { executeAction } from "../actions/engine-actions";
import {
  applyEffect,
  resolveTriggeredAbilities,
} from "../effects/effect-engine";
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
const unit: CardDefinition = {
  id: "passive-target",
  name: "Passive target",
  cardType: "WRESTLER",
  cost: 1,
  attack: 2,
  health: 10,
  rulesText: "",
  tags: ["디 어쏘리티"],
  keywords: [],
  abilities: [],
  isToken: false,
  isChampionToken: false,
};
function setup(name: string) {
  const d = definitions.find((d) => d.name === name)!;
  assert.ok(d);
  const s = createInitialGameState(undefined, [...definitions, unit]);
  s.status = "IN_PROGRESS";
  s.activePlayerId = "player-1";
  s.turn = 3;
  s.randomSeed = 400123;
  for (const p of s.players) {
    p.hand = [];
    p.deck = [generateCardInstance(unit, { instanceId: p.id + "-draw" })];
    p.board = [null, null, null, null];
    p.currentGold = 20;
    p.health = 20;
    p.maxHealth = 25;
    p.champion.quest = null;
  }
  s.players[0].board[0] = {
    ...generateCardInstance(d, { instanceId: "source" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  s.players[1].board[0] = {
    ...generateCardInstance(unit, { instanceId: "enemy" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  return s;
}
function settle(s: GameState, preferred?: string) {
  for (let n = 0; s.targetingState?.active; n++) {
    assert.ok(n < 30);
    const f = s.targetingState;
    const id =
      preferred && f.validTargetIds.includes(preferred)
        ? preferred
        : f.validTargetIds.find((id) => !f.selectedTargetIds.includes(id));
    assert.ok(id);
    const r = executeAction(JSON.parse(JSON.stringify(s)), {
      type:
        f.phase === "PRE_COMMIT"
          ? "CONFIRM_PRECOMMIT_TARGET"
          : "SELECT_EFFECT_TARGET",
      playerId: f.playerId,
      targetId: id,
    });
    assert.ok(r.success, r.success ? "" : r.errorCode);
    s = r.state;
  }
  return s;
}
function fire(
  s: GameState,
  trigger: Parameters<typeof resolveTriggeredAbilities>[3],
  preferred?: string,
) {
  return settle(
    resolveTriggeredAbilities(s, "player-1", s.players[0].board[0]!, trigger),
    preferred,
  );
}
function damage(s: GameState, amount: number) {
  return applyEffect(
    s,
    "player-2",
    s.players[1].board[0]!,
    {
      type: "STRUCTURED",
      action: "DAMAGE",
      target: {
        zone: "BOARD",
        owner: "ENEMY",
        selection: "PLAYER_CHOICE",
        count: 1,
      },
      values: { amount },
    },
    ["source"],
  );
}

test("current MPG selects an enemy, lowers its ATK one and increases its own one", () => {
  const s = setup("MPG"),
    base = s.players[0].board[0]!.currentAttack;
  const n = fire(s, "ENTER_FIELD", "enemy");
  assert.equal(n.players[1].board[0]!.currentAttack, 1);
  assert.equal(n.players[0].board[0]!.currentAttack, base + 1);
});
test("current Gold Marble destroy requires strictly lower current ATK and never retires", () => {
  const s = setup("금구슬 마스터");
  s.players[1].board[0]!.currentAttack = s.players[0].board[0]!.currentAttack;
  let n = fire(s, "ENTER_FIELD");
  assert.ok(n.players[1].board[0]);
  s.players[1].board[0]!.currentAttack--;
  n = fire(s, "ENTER_FIELD", "enemy");
  assert.equal(n.players[1].board[0], null);
  assert.equal(n.players[1].graveyard.length, 0);
});
test("current Luna MK silences on entry, preserves the target at turn start, destroys silenced opponents at owner turn end", () => {
  let s = setup("루나 MK.사일런스");
  s.players[1].board[1] = {
    ...generateCardInstance(unit, { instanceId: "safe" }),
    boardSlot: 1,
  };
  s = fire(s, "ENTER_FIELD", "enemy");
  assert.equal(s.players[1].board[0]!.isSilenced, true);
  s = fire(s, "TURN_START");
  assert.ok(s.players[1].board[0]);
  s = fire(s, "TURN_END");
  assert.equal(s.players[1].board[0], null);
  assert.ok(s.players[1].board[1]);
  assert.equal(s.players[1].graveyard.length, 0);
});
test("current Lube grows and gains Taunt only when alone on the allied field", () => {
  for (const alone of [false, true]) {
    const s = setup("루브");
    const base = s.players[0].board[0]!;
    if (!alone)
      s.players[0].board[1] = {
        ...generateCardInstance(unit, { instanceId: "ally" }),
        boardSlot: 1,
      };
    const n = fire(s, "TURN_END");
    assert.equal(
      n.players[0].board[0]!.currentAttack,
      base.currentAttack + (alone ? 1 : 0),
    );
    assert.equal(
      n.players[0].board[0]!.maxHealth,
      base.maxHealth + (alone ? 1 : 0),
    );
    assert.equal(n.players[0].board[0]!.keywords.includes("TAUNT"), alone);
  }
});
test("current Ruina generates one actual Authority card and gives allied Authority lifesteal, never enemy cards", () => {
  let s = setup("루이나");
  s.players[0].board[1] = {
    ...generateCardInstance(
      { ...unit, tags: ["디 어쏘리티"] },
      { instanceId: "ally" },
    ),
    boardSlot: 1,
  };
  s.players[1].board[0]!.tags = ["디 어쏘리티"];
  s = fire(s, "ENTER_FIELD");
  assert.equal(s.players[0].hand.length, 1);
  assert.ok(s.players[0].hand[0].tags?.includes("디 어쏘리티"));
  assert.ok(records.some((r) => r.id === s.players[0].hand[0].definitionId));
  assert.ok(s.players[0].board[1]!.keywords.includes("LIFESTEAL"));
  assert.equal(s.players[1].board[0]!.keywords.includes("LIFESTEAL"), false);
});
test("current Madokawa increases allied outgoing damage by two and other allied incoming damage by one, without old automatic retirement", () => {
  const s = setup("마도카와");
  s.players[0].board[1] = {
    ...generateCardInstance(unit, { instanceId: "attacker" }),
    boardSlot: 1,
    enteredThisTurn: false,
  };
  const r = executeAction(s, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: "attacker",
    target: { type: "WRESTLER", playerId: "player-2", cardInstanceId: "enemy" },
  });
  assert.ok(r.success);
  assert.equal(r.state.players[1].board[0]!.currentHealth, 6);
  assert.equal(r.state.players[0].board[1]!.currentHealth, 7);
  assert.equal(r.state.players[0].graveyard.length, 0);
});
test("current Vampire MPG adds exactly the sum of damage actually applied to enemy wrestlers, including armor targets", () => {
  const s = setup("뱀파이어 왕자 MPG"),
    base = s.players[0].board[0]!.currentAttack;
  s.players[1].board[1] = {
    ...generateCardInstance(unit, { instanceId: "armored" }),
    boardSlot: 1,
    keywords: ["ARMOR"],
    armor: 2,
  };
  const n = fire(s, "ENTER_FIELD");
  assert.equal(n.players[0].board[0]!.currentAttack, base + 2);
  assert.equal(n.players[1].board[0]!.currentHealth, 9);
  assert.equal(n.players[1].board[1]!.currentHealth, 9);
});
test("current Black Out reacts to positive effect damage, not zero damage", () => {
  for (const amount of [0, 1]) {
    const s = setup("블랙 아웃"),
      base = s.players[0].board[0]!.currentAttack;
    const n = damage(s, amount);
    assert.equal(n.players[0].board[0]!.currentAttack, base + (amount ? 1 : 0));
  }
});
test("current Silence receives two less damage only from silenced sources", () => {
  for (const silenced of [false, true]) {
    const s = setup("사일런스"),
      hp = s.players[0].board[0]!.currentHealth;
    s.players[1].board[0]!.isSilenced = silenced;
    const n = damage(s, 3);
    assert.equal(n.players[0].board[0]!.currentHealth, hp - (silenced ? 1 : 3));
  }
});
test("current Cassandra affects allied hand and board Authority only, then heals allied board and champion once", () => {
  let s = setup("카산드라");
  s.players[0].board[1] = {
    ...generateCardInstance(
      { ...unit, tags: ["디 어쏘리티"] },
      { instanceId: "ally" },
    ),
    boardSlot: 1,
    currentHealth: 2,
  };
  s.players[0].hand = [
    generateCardInstance(
      { ...unit, tags: ["디 어쏘리티"] },
      { instanceId: "hand" },
    ),
  ];
  s.players[1].board[0]!.tags = ["디 어쏘리티"];
  s = fire(s, "ENTER_FIELD");
  assert.equal(s.players[0].board[1]!.maxHealth, 11);
  assert.ok(s.players[0].board[1]!.keywords.includes("REGEN"));
  assert.equal(s.players[0].hand[0].maxHealth, 11);
  assert.ok(s.players[0].hand[0].keywords.includes("REGEN"));
  assert.equal(s.players[1].board[0]!.maxHealth, 10);
  const hp = s.players[0].board[1]!.currentHealth;
  s = fire(s, "TURN_END");
  assert.equal(s.players[0].board[1]!.currentHealth, hp + 1);
  assert.equal(s.players[0].health, 21);
});
test("current Helper generates Nyang on entry and requires previous-turn total overheal strictly greater than three", () => {
  const entry = fire(setup("헬퍼"), "ENTER_FIELD");
  assert.equal(
    entry.players[0].hand[0].definitionId,
    records.find((r) => r.name === "냥냥 펀치")!.id,
  );
  for (const overflow of [3, 4]) {
    const s = setup("헬퍼");
    s.overhealByTurn = { "2:player-1": overflow, "1:player-1": 99 };
    const n = fire(s, "TURN_START");
    assert.equal(n.players[0].hand.length, overflow > 3 ? 1 : 0);
  }
});
test("current HellBbeok damages every allied and enemy wrestler once, leaves both champions unchanged", () => {
  const s = setup("헬뻑"),
    ownHp = s.players[0].board[0]!.currentHealth;
  const n = fire(s, "TURN_END");
  assert.equal(n.players[0].board[0]!.currentHealth, ownHp - 1);
  assert.equal(n.players[1].board[0]!.currentHealth, 9);
  assert.equal(n.players[0].health, 20);
  assert.equal(n.players[1].health, 20);
});
test("current HillBill heals two after personally retiring an enemy in actual combat", () => {
  const s = setup("힐빌");
  s.players[0].board[0]!.currentHealth = 1;
  s.players[1].board[0]!.currentHealth = 1;
  s.players[1].board[0]!.currentAttack = 0;
  const r = executeAction(s, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: "source",
    target: { type: "WRESTLER", playerId: "player-2", cardInstanceId: "enemy" },
  });
  assert.ok(r.success);
  assert.equal(r.state.players[0].board[0]!.currentHealth, 3);
  assert.equal(r.state.players[1].board[0], null);
});
