import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createInitialGameState } from "./create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import {
  HELPER_ID,
  HELPER_LEGACY_TEXT,
  HELPER_RULES_TEXT,
  normalizeHelperHealing,
  helperHealingAbilities,
} from "../cards/helper-healing";
import { executeAction } from "../actions/engine-actions";
import {
  applyEffect,
  resolveTriggeredAbilities,
} from "../effects/effect-engine";
import type { GameState } from "../types/game-state";
import type { CardDefinition } from "../cards/types";
const records: PublishedCardRecord[] = JSON.parse(
  readFileSync("docs/qa/snapshots/20261014-admin/cards.json", "utf8"),
);
const raw = records.find((c) => c.id === HELPER_ID)!;
const helper = cardRecordToDefinition({ ...raw, text: HELPER_LEGACY_TEXT });
const token = cardRecordToDefinition(
  records.find((c) => c.id === "e584c34e-d640-4c41-a148-cfb70389f08a")!,
);
const unit: CardDefinition = {
  id: "qa-helper-unit",
  name: "회복 검증 선수",
  cardType: "WRESTLER",
  cost: 1,
  attack: 1,
  health: 5,
  keywords: [],
  abilities: [],
  rulesText: "",
};
function setup() {
  const s = createInitialGameState(undefined, [helper, token, unit]);
  s.status = "IN_PROGRESS";
  s.turn = 3;
  s.activePlayerId = "player-1";
  s.events = [{ type: "TURN_STARTED", playerId: "player-1" }];
  s.cardPool = [helper, token, unit];
  for (const p of s.players) {
    p.hand = [];
    p.board = [null, null, null, null];
    p.health = 20;
    p.maxHealth = 20;
    p.champion!.health = 20;
    p.champion!.maxHealth = 20;
    p.champion!.quest = null;
    p.currentGold = 6;
    p.deck = Array.from({ length: 5 }, (_, i) =>
      generateCardInstance(unit, { instanceId: p.id + "-draw-" + i }),
    );
  }
  s.players[0].hand = [generateCardInstance(helper, { instanceId: "helper" })];
  s.players[0].board[1] = {
    ...generateCardInstance(unit, { instanceId: "ally" }),
    boardSlot: 1,
    enteredThisTurn: false,
    entryDefenseActive: false,
  };
  s.players[1].board[0] = {
    ...generateCardInstance(unit, { instanceId: "enemy" }),
    boardSlot: 0,
    enteredThisTurn: false,
    entryDefenseActive: false,
  };
  const r = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "helper",
    boardSlot: 0,
  });
  assert.ok(r.success, r.message);
  assert.equal(count(r.state), 1);
  return r.state;
}
const count = (s: GameState) =>
  s.players[0].hand.filter((c) => c.definitionId === token.id).length;
const source = (s: GameState) => s.players[0].board[0]!;
function heal(
  s: GameState,
  zone: "PLAYER" | "BOARD",
  owner: "SELF" | "ENEMY" = "SELF",
  amount = 1,
) {
  return applyEffect(
    s,
    "player-1",
    source(s),
    {
      type: "STRUCTURED",
      action: "HEAL",
      target: {
        zone,
        owner,
        selection: zone === "PLAYER" ? "SELF" : "SAME_TARGET",
        count: 1,
      },
      values: { amount },
    },
    zone === "BOARD" ? [owner === "SELF" ? "ally" : "enemy"] : undefined,
  );
}
function end(s: GameState) {
  const r = executeAction(s, { type: "END_TURN", playerId: s.activePlayerId! });
  assert.ok(r.success, r.message);
  return r.state;
}
for (const healed of [
  "champion",
  "wrestler",
  "both",
  "none",
  "full",
  "zero",
  "enemy",
  "opponent-turn",
] as const)
  test(`Helper previous-own-turn healing: ${healed}`, () => {
    let s = setup();
    if (healed === "opponent-turn") s = end(s);
    if (["champion", "both", "opponent-turn"].includes(healed)) {
      s.players[0].health = 18;
      s.players[0].champion!.health = 18;
      s = heal(s, "PLAYER");
    }
    if (["wrestler", "both", "opponent-turn"].includes(healed)) {
      s.players[0].board[1]!.currentHealth = 3;
      s = heal(s, "BOARD");
    }
    if (healed === "full") {
      s = heal(heal(s, "PLAYER"), "BOARD");
    }
    if (healed === "zero") {
      s.players[0].health = 18;
      s.players[0].champion!.health = 18;
      s = heal(s, "PLAYER", "SELF", 0);
    }
    if (healed === "enemy") {
      s.players[1].board[0]!.currentHealth = 3;
      s = heal(s, "BOARD", "ENEMY");
    }
    s = JSON.parse(JSON.stringify(s));
    s = healed === "opponent-turn" ? end(s) : end(end(s));
    const eligible = ["champion", "wrestler", "both"].includes(healed);
    assert.equal(count(s), eligible ? 2 : 1);
    assert.equal(s.targetingState, undefined);
    assert.equal(
      s.events.filter(
        (e) => e.type === "CARD_GENERATED" && e.cardDefinitionId === token.id,
      ).length,
      eligible ? 2 : 1,
    );
    s = end(end(s));
    assert.equal(
      count(s),
      eligible ? 2 : 1,
      "old healing must not trigger again two turns later",
    );
  });
test("Helper itself is an allied wrestler that can satisfy healing", () => {
  let s = setup();
  s.players[0].board[0]!.currentHealth = 1;
  s = applyEffect(s, "player-1", source(s), {
    type: "STRUCTURED",
    action: "HEAL",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
    values: { amount: 1 },
  });
  assert.equal(count(end(end(s))), 2);
});
test("silenced or disabled Helper cannot generate from previous healing", () => {
  for (const status of ["isSilenced", "isAbilityDisabled"] as const) {
    let s = setup();
    s.players[0].health = 18;
    s.players[0].champion!.health = 18;
    s = heal(s, "PLAYER");
    s.players[0].board[0]![status] = true;
    assert.equal(count(end(end(s))), 1);
  }
});
test("no previous healing record in old save does not grant a token", () => {
  const s = setup();
  delete s.ownTurnHealing;
  s.turn = 5;
  const n = resolveTriggeredAbilities(s, "player-1", source(s), "TURN_START");
  assert.equal(count(n), 1);
});
test("public and runtime text say either; new conditions do not change legacy BOTH semantics", () => {
  assert.equal(
    normalizeHelperHealing({ ...raw, text: HELPER_LEGACY_TEXT }).text,
    HELPER_RULES_TEXT,
  );
  for (const text of [HELPER_LEGACY_TEXT, HELPER_RULES_TEXT]) {
    const d = cardRecordToDefinition({ ...raw, text });
    assert.equal(d.rulesText, HELPER_RULES_TEXT);
    assert.equal(
      d.abilities.find((a) => a.trigger === "TURN_START")?.condition?.type,
      "PREVIOUS_OWN_TURN_ANY_HEALED",
    );
  }
  const s = setup();
  s.turn = 5;
  s.ownTurnHealing = { "3:player-1": { champion: true } };
  const original = {
    ...source(s),
    abilities: [
      {
        trigger: "TURN_START" as const,
        condition: { type: "PREVIOUS_OWN_TURN_BOTH_HEALED" as const },
        effects: [{ type: "GAIN_GOLD" as const, amount: 1 }],
      },
    ],
  };
  assert.equal(
    resolveTriggeredAbilities(s, "player-1", original, "TURN_START").players[0]
      .currentGold,
    s.players[0].currentGold,
  );
});
test("unknown card revisions and explicit effect configs are not overwritten", () => {
  const changed = { ...raw, text: "완전히 새로운 관리자 효과" };
  assert.equal(normalizeHelperHealing(changed), changed);
  assert.equal(helperHealingAbilities(changed), null);
  const manual = {
    ...raw,
    text: HELPER_LEGACY_TEXT,
    effectId: "STRUCTURED_EFFECTS_V1",
  };
  assert.equal(normalizeHelperHealing(manual), manual);
  assert.equal(helperHealingAbilities(manual), null);
});
