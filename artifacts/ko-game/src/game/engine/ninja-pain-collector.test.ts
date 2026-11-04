import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { cardRecordToDefinition } from "../cards/published-cards";
import { generateCardInstance } from "../cards/generation";
import type { CardDefinition } from "../cards/types";
import { createInitialGameState } from "./create-initial-game-state";
import { executeAction } from "../actions/engine-actions";
import type { GameState } from "../types/game-state";
const records = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../docs/qa/fixtures/20261104-ninja-pain-collector.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const definitions: CardDefinition[] = records.map(cardRecordToDefinition);
const named = (name: string) => definitions.find((d) => d.name === name)!;
function setup() {
  const s = createInitialGameState();
  s.status = "IN_PROGRESS";
  s.activePlayerId = "player-1";
  s.turn = 3;
  s.events = [];
  s.cardPool = definitions;
  for (const p of s.players) {
    p.currentGold = 99;
    p.hand = [];
    p.board = [null, null, null, null];
    p.graveyard = [];
    p.champion!.quest = null;
  }
  return s;
}
function play(
  s: GameState,
  name: string,
  id: string,
  slot: 0 | 1 | 2 | 3,
  owner = "player-1",
) {
  const ownerState = s.players.find((p) => p.id === owner)!;
  s = {
    ...s,
    activePlayerId: owner,
    players: s.players.map((p) =>
      p.id === owner
        ? {
            ...ownerState,
            hand: [
              ...p.hand,
              generateCardInstance(named(name), { instanceId: id }),
            ],
          }
        : p,
    ),
  };
  const r = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: owner,
    cardInstanceId: id,
    boardSlot: slot,
  });
  assert.ok(r.success, r.message);
  return r.state;
}
const attackOf = (s: GameState, id = "collector") =>
  s.players[0].board.find((c) => c?.instanceId === id)!.currentAttack;
function assertNinjaHits(s: GameState, from: number, count: number) {
  const ids = s.events
    .slice(from)
    .filter(
      (e) =>
        e.type === "ENTER_FIELD" && e.cardDefinitionId === named("닌자").id,
    )
    .map((e) => e.cardInstanceId);
  assert.equal(
    ids.length,
    count,
    "ninja and its summoned copy enter exactly once each",
  );
  for (const id of ids) {
    assert.equal(
      s.players[0].graveyard.filter((c) => c.instanceId === id).length,
      1,
    );
    assert.equal(
      s.events
        .slice(from)
        .filter(
          (e) =>
            e.type === "DAMAGE_DEALT" &&
            e.target?.type === "CARD" &&
            e.target.cardInstanceId === id &&
            e.amount === 1,
        ).length,
      1,
    );
  }
  assert.equal(s.targetingState?.active ?? false, false);
}
for (const helOwner of ["player-1", "player-2"])
  test(
    "real Ninja entry + lethal Hellppeok + Pain Collector, hel owner=" +
      helOwner,
    () => {
      let s = play(setup(), "고통 수집가", "collector", 0);
      s = play(s, "헬뻑", "hell", helOwner === "player-1" ? 1 : 0, helOwner);
      const before = attackOf(s),
        from = s.events.length;
      s = play(s, "닌자", "ninja", 2);
      assertNinjaHits(s, from, 2);
      assert.equal(
        attackOf(s),
        before + 2,
        "both actual allied damage applications grant one stack",
      );
    },
  );
test("Ninja and copy lethal damage each buff both allied collectors after restore", () => {
  let s = play(setup(), "고통 수집가", "collector", 0);
  s = play(s, "고통 수집가", "collector-b", 1);
  s = play(s, "헬뻑", "hell", 0, "player-2");
  s = JSON.parse(JSON.stringify(s));
  const before = [attackOf(s), attackOf(s, "collector-b")],
    from = s.events.length;
  s = play(s, "닌자", "ninja", 2);
  assertNinjaHits(s, from, 2);
  assert.deepEqual(
    [attackOf(s), attackOf(s, "collector-b")],
    before.map((v) => v + 2),
  );
});
test("separate Ninja plays each grant two stacks without duplicate entry or listeners", () => {
  let s = play(setup(), "고통 수집가", "collector", 0);
  s = play(s, "헬뻑", "hell", 1);
  const before = attackOf(s),
    from = s.events.length;
  s = play(s, "닌자", "ninja-a", 2);
  s = play(s, "닌자", "ninja-b", 2);
  assertNinjaHits(s, from, 4);
  assert.equal(attackOf(s), before + 4);
});
test("Ninja without incoming damage grants no damage stack", () => {
  let s = play(setup(), "고통 수집가", "collector", 0);
  const before = attackOf(s);
  s = play(s, "닌자", "ninja", 1);
  assert.equal(attackOf(s), before);
  assert.equal(
    s.players[0].board.filter((c) => c?.definitionId === named("닌자").id)
      .length,
    2,
  );
});
test("opponent Ninja takes lethal entry damage without buffing my Pain Collector", () => {
  let s = play(setup(), "고통 수집가", "collector", 0);
  s = play(s, "헬뻑", "hell", 1);
  const before = attackOf(s);
  s = play(s, "닌자", "enemy-ninja", 0, "player-2");
  assert.equal(attackOf(s), before);
  assert.equal(
    s.players[1].graveyard.filter((c) => c.definitionId === named("닌자").id)
      .length,
    2,
  );
});
