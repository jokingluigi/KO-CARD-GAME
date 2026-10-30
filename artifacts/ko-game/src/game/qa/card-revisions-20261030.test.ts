import { isEffectScript } from "@workspace/effect-registry";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import { reviewedOctober30Abilities } from "../cards/reviewed-admin-content-20261030";
import {
  createInitialGameState,
  generateCardInstance,
  executeAction,
  applyEffect,
  type GameState,
  type CardDefinition,
} from "../index";
import { enterField } from "../engine/enter-field";
const changed: PublishedCardRecord[] = JSON.parse(
  readFileSync("docs/qa/snapshots/20261030-admin/changed-cards.json", "utf8"),
);
const before: PublishedCardRecord[] = JSON.parse(
  readFileSync("docs/qa/snapshots/20261024-admin/cards.json", "utf8"),
);
const records = before.map((c) => changed.find((n) => n.id === c.id) ?? c);
const definitions = records.map(cardRecordToDefinition);
const unit: CardDefinition = {
  id: "revision-target",
  name: "검증 대상",
  cardType: "WRESTLER",
  cost: 1,
  attack: 4,
  health: 10,
  rulesText: "",
  status: "PUBLISHED",
  isToken: false,
  isChampionToken: false,
  keywords: [],
  tags: [],
  abilities: [],
};
const undead: CardDefinition = {
  ...unit,
  id: "revision-undead",
  name: "검증 언데드",
  tags: ["언데드"],
};
const def = (name: string) => {
  const d = definitions.find((d) => d.name === name);
  assert.ok(d, name);
  return d;
};
function setup() {
  const s = createInitialGameState(undefined, [...definitions, unit, undead]);
  s.status = "IN_PROGRESS";
  s.activePlayerId = "player-1";
  s.turn = 3;
  s.events = [];
  s.randomSeed = 321;
  for (const p of s.players) {
    p.board = [null, null, null, null];
    p.hand = [];
    p.deck = Array.from({ length: 30 }, (_, i) =>
      generateCardInstance(unit, { instanceId: `${p.id}-draw-${i}` }),
    );
    p.currentGold = 100;
    p.champion!.quest = null;
    p.health = 25;
    p.maxHealth = 25;
  }
  return s;
}
function put(
  s: GameState,
  owner: 0 | 1,
  slot: 0 | 1 | 2 | 3,
  id: string,
  d = unit,
) {
  const c = {
    ...generateCardInstance(d, { instanceId: id }),
    boardSlot: slot,
    enteredThisTurn: false,
  };
  s.players[owner].board[slot] = c;
  return c;
}
function settle(s: GameState, preferred?: string) {
  for (let i = 0; s.targetingState?.active; i++) {
    assert.ok(i < 20, "no stale choice loop");
    const p = s.targetingState;
    const id =
      preferred && p.validTargetIds.includes(preferred)
        ? preferred
        : p.validTargetIds.find((id) => !p.selectedTargetIds.includes(id));
    assert.ok(id);
    const r = executeAction(JSON.parse(JSON.stringify(s)), {
      type:
        p.phase === "PRE_COMMIT"
          ? "CONFIRM_PRECOMMIT_TARGET"
          : "SELECT_EFFECT_TARGET",
      playerId: p.playerId,
      targetId: id,
    });
    assert.ok(r.success, r.message);
    s = r.state;
  }
  return s;
}
function play(
  s: GameState,
  name: string,
  preferred?: string,
  slot: 0 | 1 | 2 | 3 = 0,
) {
  const d = def(name);
  s.players[0].hand = [generateCardInstance(d, { instanceId: "source" })];
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
          boardSlot: slot,
        },
  );
  assert.ok(r.success, r.message);
  return settle(r.state, preferred);
}
const live = (s: GameState, id: string) =>
  s.players.flatMap((p) => p.board).find((c) => c?.instanceId === id)!;
function removal(
  s: GameState,
  id: string,
  kind: "RETIRE" | "DESTROY" | "REMOVE_FROM_GAME",
  owner: "SELF" | "ENEMY" = "SELF",
) {
  return settle(
    applyEffect(
      s,
      "player-1",
      live(s, "source"),
      {
        type: "STRUCTURED",
        action: kind,
        target: { zone: "BOARD", owner, selection: "PLAYER_CHOICE", count: 1 },
      },
      [id],
    ),
  );
}

test("latest saved cost/stats/status are not overridden; disabled Zombie Platinum remains disabled", () => {
  const purple = def("퍼플레인");
  assert.equal(purple.cost, 6);
  assert.equal(purple.abilities[0].effects[0].type, "STRUCTURED");
  const m = def("좀비 플래티넘구슬 마스터");
  assert.deepEqual(
    [m.cost, m.attack, m.health, m.status],
    [6, 0, 7, "DISABLED"],
  );
  assert.deepEqual(
    [def("폭죽광").cost, def("폭죽광").attack, def("폭죽광").health],
    [1, 1, 1],
  );
});
test("reviewed overrides require stable ID and exact current wording; old/future card definitions retain their path", () => {
  for (const c of changed.filter((c) => c.name !== "퍼플레인")) {
    assert.ok(reviewedOctober30Abilities(c), c.name);
    assert.equal(
      reviewedOctober30Abilities({ ...c, id: "another-" + c.id }),
      null,
    );
    assert.equal(
      reviewedOctober30Abilities({ ...c, text: c.text + " 추가 효과." }),
      null,
    );
    const old = before.find((o) => o.id === c.id)!;
    assert.equal(reviewedOctober30Abilities(old), null);
  }
});
test("Annihilation silences both sides using current attack <=2, never destroys/retires", () => {
  const s = setup();
  for (const owner of [0, 1] as const)
    for (const slot of [0, 1, 2] as const) {
      const c = put(s, owner, slot, `${owner}-${slot}`);
      c.currentAttack = slot + 1;
      c.keywords = ["TAUNT"];
    }
  const n = play(s, "절멸");
  for (const owner of [0, 1])
    for (const slot of [0, 1, 2]) {
      const c = n.players[owner].board[slot]!;
      assert.ok(c);
      assert.equal(c.isSilenced, slot < 2);
      assert.equal(c.currentHealth, 10);
    }
  assert.ok(
    !n.events.some((e) =>
      ["CARD_DESTROYED", "CARD_RETIRED", "CARD_VANISHED"].includes(e.type),
    ),
  );
  assert.equal(n.players[0].hand.length, 0);
});
test("Annihilation with no qualifying cards resolves without a choice or damage", () => {
  const s = setup();
  put(s, 1, 0, "enemy");
  const n = play(s, "절멸");
  assert.equal(live(n, "enemy").isSilenced, false);
  assert.equal(n.targetingState?.active ?? false, false);
  assert.ok(!n.events.some((e) => e.type === "DAMAGE_DEALT"));
});
for (const mode of [
  "one",
  "two",
  "empty",
  "armor",
  "immune",
  "lethal",
] as const)
  test(`Fireworks reselects two one-damage pings: ${mode}`, () => {
    const s = setup();
    if (mode !== "empty") {
      const c = put(s, 1, 0, "enemy");
      if (mode === "two") put(s, 1, 1, "enemy-2");
      if (mode === "armor") {
        c.keywords = ["ARMOR"];
        c.armor = 1;
      }
      if (mode === "immune") c.keywords = ["IMMUNE"];
      if (mode === "lethal") {
        c.currentHealth = 1;
        c.maxHealth = 1;
        const other = put(s, 1, 1, "enemy-2");
        other.currentHealth = 1;
        other.maxHealth = 1;
      }
    }
    const n = play(s, "폭죽광"),
      hits = n.events.filter(
        (e) =>
          e.type === "DAMAGE_DEALT" &&
          e.source?.type === "CARD" &&
          e.source.cardInstanceId === "source",
      );
    assert.equal(n.players[1].health, 25);
    assert.equal(n.targetingState?.active ?? false, false);
    if (mode === "empty") assert.equal(hits.length, 0);
    else if (mode === "immune")
      assert.ok(hits.every((e) => (e.amount ?? 0) === 0));
    else if (mode === "armor")
      assert.equal(
        live(n, "enemy").currentHealth,
        8,
        "effect damage retains existing armor rules",
      );
    else {
      assert.equal(
        hits.reduce((sum, e) => sum + (e.amount ?? 0), 0),
        2,
      );
      assert.ok(hits.every((e) => e.amount === 1));
      if (mode === "one") assert.equal(live(n, "enemy").currentHealth, 8);
      if (mode === "lethal") assert.ok(!live(n, "enemy"));
    }
  });
for (const owner of [0, 1] as const)
  for (const cause of ["hand", "effect"] as const)
    test(`Hellbeok hits each real entrant once: owner ${owner}, ${cause}`, () => {
      let s = play(setup(), "헬뻑");
      assert.equal(live(s, "source").currentHealth, 6);
      s.players[0].board[1] = null;
      const entrant = generateCardInstance(unit, { instanceId: "new-entry" });
      if (cause === "effect")
        s = enterField(s, s.players[owner].id, entrant, 1, "SUMMON");
      else {
        s.activePlayerId = s.players[owner].id;
        s.players[owner].hand = [entrant];
        const r = executeAction(s, {
          type: "PLAY_WRESTLER",
          playerId: s.players[owner].id,
          cardInstanceId: entrant.instanceId,
          boardSlot: 1,
        });
        assert.ok(r.success, r.message);
        s = r.state;
      }
      s = settle(s);
      assert.equal(live(s, entrant.instanceId).currentHealth, 9);
      assert.equal(
        s.events.filter(
          (e) =>
            e.type === "DAMAGE_DEALT" &&
            e.source?.type === "CARD" &&
            e.source.cardInstanceId === "source",
        ).length,
        1,
      );
      assert.equal(s.players[0].health, 25);
      assert.equal(s.players[1].health, 25);
    });
test("Hellbeok silence/absence disables future entry damage; no old turn-end global hit", () => {
  let s = play(setup(), "헬뻑");
  put(s, 0, 1, "ally");
  put(s, 1, 1, "enemy");
  const end = executeAction(s, { type: "END_TURN", playerId: "player-1" });
  assert.ok(end.success);
  assert.equal(live(end.state, "ally").currentHealth, 10);
  assert.equal(live(end.state, "enemy").currentHealth, 10);
  s.players[0].board[0]!.isSilenced = true;
  s = enterField(
    s,
    "player-2",
    generateCardInstance(unit, { instanceId: "new" }),
    2,
    "SUMMON",
  );
  assert.equal(live(s, "new").currentHealth, 10);
});
for (const kind of ["RETIRE", "DESTROY", "REMOVE_FROM_GAME"] as const)
  for (const owner of ["SELF", "ENEMY"] as const)
    test(`Gravekeeper only allied retirement: ${owner} ${kind}`, () => {
      let s = setup();
      put(s, 0, 1, "ally-1");
      put(s, 0, 2, "ally-2");
      put(s, owner === "SELF" ? 0 : 1, 3, "victim");
      s = play(s, "묘지지기");
      s = removal(s, "victim", kind, owner);
      const deltas = ["ally-1", "ally-2"].map(
        (id) => live(s, id).currentAttack - 4,
      );
      assert.equal(
        deltas.reduce((a, b) => a + b, 0),
        kind === "RETIRE" && owner === "SELF" ? 1 : 0,
      );
      assert.equal(live(s, "source").currentAttack, 2);
      assert.equal(s.targetingState?.active ?? false, false);
    });
test("Gravekeeper with no other allies cannot buff itself; silenced source cannot buff", () => {
  let s = setup();
  put(s, 0, 1, "victim");
  s = play(s, "묘지지기");
  s = removal(s, "victim", "RETIRE");
  assert.equal(live(s, "source").currentAttack, 2);
  put(s, 0, 1, "ally");
  put(s, 0, 2, "victim-2");
  live(s, "source").isSilenced = true;
  s = removal(s, "victim-2", "RETIRE");
  assert.equal(live(s, "ally").currentAttack, 4);
});
test("Zombie Platinum chooses allied undead, buffs first, then adds its resulting attack, with no zombie generation", () => {
  const s = setup();
  put(s, 0, 1, "undead", undead);
  put(s, 0, 2, "ordinary");
  put(s, 1, 1, "enemy-undead", undead);
  const n = play(s, "좀비 플래티넘구슬 마스터", "undead");
  assert.deepEqual(
    [
      live(n, "undead").currentAttack,
      live(n, "undead").currentHealth,
      live(n, "undead").maxHealth,
    ],
    [6, 12, 12],
  );
  assert.deepEqual(
    [live(n, "source").currentAttack, live(n, "source").currentHealth],
    [6, 7],
  );
  assert.equal(live(n, "ordinary").currentAttack, 4);
  assert.equal(live(n, "enemy-undead").currentAttack, 4);
  assert.ok(!n.events.some((e) => e.type === "CARD_GENERATED"));
  assert.equal(n.targetingState?.active ?? false, false);
});
test("Zombie Platinum may choose itself; saved disabled status is not enabled by implementation", () => {
  const s = play(setup(), "좀비 플래티넘구슬 마스터", "source");
  assert.deepEqual(
    [live(s, "source").currentAttack, live(s, "source").currentHealth],
    [4, 9],
  );
  assert.equal(def("좀비 플래티넘구슬 마스터").status, "DISABLED");
});

test("source-target opt-in is validated and absent by default for existing scripts", () => {
  const card = changed.find((c) => c.name === "좀비 플래티넘구슬 마스터")!;
  const effect = reviewedOctober30Abilities(card)![0].effects[0];
  assert.equal(effect.type, "SCRIPT");
  if (effect.type !== "SCRIPT") return;
  assert.equal(isEffectScript(effect.script), true);
  const bad = JSON.parse(JSON.stringify(effect.script));
  bad.steps[0].target.allowSource = "yes";
  assert.equal(isEffectScript(bad), false);
  const base = JSON.parse(JSON.stringify(effect.script));
  delete base.steps[0].target.allowSource;
  assert.equal(isEffectScript(base), true);
  const s = setup(),
    d = {
      ...def(card.name),
      abilities: [
        {
          trigger: "ENTER_FIELD" as const,
          effects: [{ type: "SCRIPT" as const, script: base }],
        },
      ],
    };
  s.cardPool = s.cardPool!.map((c) => (c.id === d.id ? d : c));
  s.players[0].hand = [generateCardInstance(d, { instanceId: "source" })];
  const r = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "source",
    boardSlot: 0,
  });
  assert.ok(r.success);
  assert.equal(r.state.targetingState?.active ?? false, false);
  assert.equal(live(r.state, "source").currentAttack, 0);
});
test("multiple Hellbeoks resolve once each and keep nested summon continuation intact", () => {
  const s = setup();
  put(s, 0, 0, "watcher-a", def("헬뻑"));
  put(s, 1, 0, "watcher-b", def("헬뻑"));
  const n = settle(
    enterField(
      s,
      "player-1",
      generateCardInstance(unit, { instanceId: "entrant" }),
      1,
      "SUMMON",
    ),
  );
  assert.equal(live(n, "entrant").currentHealth, 8);
  assert.equal(n.events.filter((e) => e.type === "DAMAGE_DEALT").length, 2);
  assert.equal(n.targetingState?.active ?? false, false);
});
