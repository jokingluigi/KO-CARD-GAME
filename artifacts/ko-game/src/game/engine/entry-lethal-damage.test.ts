import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { cardRecordToDefinition } from "../cards/published-cards";
import { generateCardInstance } from "../cards/generation";
import type { CardDefinition } from "../cards/types";
import { createInitialGameState } from "./create-initial-game-state";
import { executeAction } from "../actions/engine-actions";
import { applyEffect } from "../effects/effect-engine";
const records = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../docs/qa/fixtures/20261104-entry-lethal-damage.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const definitions: CardDefinition[] = records.map(cardRecordToDefinition);
const collector = definitions.find((d) => d.name === "고통 수집가")!,
  hel = definitions.find((d) => d.name === "헬뻑")!;
const unit: CardDefinition = {
  id: "qa-entry-victim",
  name: "진입 피해 검증",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 1,
  health: 1,
  rulesText: "",
  keywords: [],
  abilities: [],
};
function setup() {
  const s = createInitialGameState();
  s.status = "IN_PROGRESS";
  s.activePlayerId = "player-1";
  s.turn = 3;
  s.cardPool = [...definitions, unit];
  s.events = [];
  for (const p of s.players) {
    p.currentGold = 99;
    p.hand = [];
    p.board = [null, null, null, null];
    p.graveyard = [];
    p.champion!.quest = null;
    p.deck = Array.from({ length: 10 }, (_, i) =>
      generateCardInstance(unit, { instanceId: p.id + "-draw-" + i }),
    );
  }
  return s;
}
function play(
  s: ReturnType<typeof setup>,
  d: CardDefinition,
  id: string,
  slot: 0 | 1 | 2 | 3,
  owner = "player-1",
) {
  s = {
    ...s,
    activePlayerId: owner,
    players: s.players.map((p) =>
      p.id !== owner
        ? p
        : {
            ...p,
            hand: [...p.hand, generateCardInstance(d, { instanceId: id })],
          },
    ),
  };
  const r = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: owner,
    cardInstanceId: id,
    boardSlot: slot,
  });
  assert.ok(r.success);
  return r.state;
}
for (const hp of [1, 2])
  test(
    "Hellppeok entry hit: allied collector counts actual damage when victim HP=" +
      hp,
    () => {
      let s = play(setup(), collector, "collector", 0);
      s = play(s, hel, "hell", 1);
      const before = s.players[0].board[0]!.currentAttack;
      s = play(s, { ...unit, health: hp }, "victim", 2);
      assert.equal(s.players[0].board[0]!.currentAttack, before + 1);
      assert.equal(
        s.events.filter(
          (e) =>
            e.type === "DAMAGE_DEALT" &&
            e.target?.type === "CARD" &&
            e.target.cardInstanceId === "victim" &&
            e.amount === 1,
        ).length,
        1,
      );
      assert.equal(
        s.players[0].graveyard.filter((c) => c.instanceId === "victim").length,
        hp === 1 ? 1 : 0,
      );
      assert.equal(
        s.events.filter(
          (e) => e.type === "CARD_RETIRED" && e.cardInstanceId === "victim",
        ).length,
        hp === 1 ? 1 : 0,
      );
    },
  );
test("both allied collectors gain from a lethal summon hit, exactly once each", () => {
  let s = play(setup(), collector, "collector-a", 0);
  s = play(s, collector, "collector-b", 1);
  s = play(s, hel, "hell", 2);
  const before = s.players[0].board.slice(0, 2).map((c) => c!.currentAttack);
  s = applyEffect(s, "player-1", s.players[0].board[2]!, {
    type: "STRUCTURED",
    action: "SUMMON",
    values: { definitionRef: { id: unit.id }, count: 1 },
  });
  assert.deepEqual(
    s.players[0].board.slice(0, 2).map((c) => c!.currentAttack),
    before.map((v) => v + 1),
  );
  assert.equal(s.players[0].graveyard.length, 1);
});
test("enemy lethal entry does not grant an allied collector a stack", () => {
  let s = play(setup(), collector, "collector", 0);
  s = play(s, hel, "hell", 1);
  const before = s.players[0].board[0]!.currentAttack;
  s = play(s, unit, "enemy", 0, "player-2");
  assert.equal(s.players[0].board[0]!.currentAttack, before);
  assert.equal(s.players[1].graveyard[0]?.instanceId, "enemy");
});
test("damage and self-damage draw triggers both resolve once on lethal entry", () => {
  let s = play(setup(), collector, "collector", 0);
  s = play(s, hel, "hell", 1);
  const before = s.players[0].board[0]!.currentAttack;
  const victim = {
    ...unit,
    abilities: [
      {
        trigger: "SELF_DAMAGED" as const,
        effects: [
          {
            type: "STRUCTURED" as const,
            action: "DRAW" as const,
            values: { amount: 1 },
          },
        ],
      },
    ],
  };
  s = play(s, victim, "draw-victim", 2);
  assert.equal(s.players[0].board[0]!.currentAttack, before + 1);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.players[0].graveyard.length, 1);
});
