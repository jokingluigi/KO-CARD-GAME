import test from "node:test";
import assert from "node:assert/strict";
import { generateCardInstance } from "../cards/generation";
import { resetCardAfterLeavingBoard } from "../cards/zone-state";
import type { CardDefinition } from "../cards/types";
import { createInitialGameState } from "./create-initial-game-state";
import { silenceCard } from "./card-status";
import { applyEffect } from "../effects/effect-engine";
import { directDeployChampionToken } from "./champion-token";
import { TEST_CHAMPIONS } from "../champions/test-champions";
const base: CardDefinition = {
  id: "silence-target",
  name: "target",
  cardType: "WRESTLER",
  rarity: "CHAMPION",
  cost: 1,
  attack: 2,
  health: 5,
  rulesText: "",
  isToken: true,
  isChampionToken: true,
  keywords: ["RUSH"],
  abilities: [{ trigger: "TURN_END", effects: [{ type: "DRAW", amount: 1 }] }],
};
function fixture(def = base, owner = 0) {
  const s = createInitialGameState(
    ["test-champion-no-quest", "test-champion-no-quest"],
    [def],
  );
  s.status = "IN_PROGRESS";
  s.events = [];
  s.players.forEach((p) => {
    p.board = [null, null, null, null];
    p.champion.quest = null;
  });
  s.players[owner].board[0] = {
    ...generateCardInstance(def, { instanceId: "target" }),
    boardSlot: 0,
    currentAttack: 7,
    maxHealth: 9,
    currentHealth: 8,
  };
  return s;
}
for (const owner of [0, 1])
  test(`champion rarity token keeps text, keywords and buffs on direct and structured silence, owner ${owner}`, () => {
    let s = fixture(base, owner);
    assert.equal(s.players[owner].board[0]!.isSilenceImmune, true);
    const before = structuredClone(s);
    s = silenceCard(s, "target");
    assert.deepEqual(s.players[owner].board[0], before.players[owner].board[0]);
    assert.deepEqual(before, fixture(base, owner));
    const p = s.players[owner];
    const n = applyEffect(s, p.id, p.board[0]!, {
      type: "STRUCTURED",
      action: "SILENCE",
      target: { zone: "BOARD", owner: "SELF", selection: "ALL" },
    });
    assert.equal(n.players[owner].board[0]!.isSilenced, false);
    assert.equal(n.players[owner].board[0]!.currentAttack, 7);
    assert.equal(n.players[owner].board[0]!.keywords.includes("RUSH"), true);
  });
test("ordinary tokens, legendary tokens and non-token champion rarity do not gain silence immunity", () => {
  for (const patch of [
    { rarity: "NORMAL" as const },
    { rarity: "LEGENDARY" as const },
    { isToken: false, isChampionToken: false },
  ]) {
    const def = { ...base, ...patch },
      s = fixture(def);
    assert.equal(s.players[0].board[0]!.isSilenceImmune, false);
    assert.equal(
      silenceCard(s, "target").players[0].board[0]!.isSilenced,
      true,
    );
  }
});
test("old snapshots with false immunity are protected by authoritative definition; no new definition path inferred", () => {
  let s = fixture();
  s.players[0].board[0]!.isSilenceImmune = false;
  assert.equal(silenceCard(s, "target").players[0].board[0]!.isSilenced, false);
  s.cardPool = s.cardPool?.filter((d) => d.id !== base.id);
  assert.equal(silenceCard(s, "target").players[0].board[0]!.isSilenced, true);
});
test("leaving board restores intrinsic immunity and direct champion deployment does not overwrite it", () => {
  const c = generateCardInstance(base, { instanceId: "returned" });
  assert.equal(resetCardAfterLeavingBoard(c, base).isSilenceImmune, true);
  const s = fixture();
  s.players[0].board = [null, null, null, null];
  s.players[0].champion.championTokenDefinitionId = base.id;
  const n = directDeployChampionToken(
    s,
    s.players[0].id,
    s.players[0].champion.id,
    base.id,
  );
  assert.equal(n.players[0].board[0]!.isSilenceImmune, true);
});
test("combined weakening still reduces attack and stuns, but cannot silence a champion rarity token", () => {
  const s = fixture();
  const n = applyEffect(s, s.players[0].id, s.players[0].board[0]!, {
    type: "STRUCTURED",
    action: "WEAKEN_TO_STUN_SILENCE",
    target: { zone: "BOARD", owner: "SELF", selection: "ALL" },
    values: { amount: 10 },
  });
  const c = n.players[0].board[0]!;
  assert.equal(c.currentAttack, 0);
  assert.equal(c.isStunned, true);
  assert.equal(c.isSilenced, false);
  assert.equal(c.abilities.length, 1);
});

test("silence immunity never grants protection from retirement, destruction or removal", () => {
  for (const action of ["RETIRE", "DESTROY", "REMOVE_FROM_GAME"] as const) {
    const s = fixture();
    const n = applyEffect(s, s.players[0].id, s.players[0].board[0]!, {
      type: "STRUCTURED",
      action,
      target: { zone: "BOARD", owner: "SELF", selection: "ALL" },
    });
    assert.equal(
      n.players[0].board.some((c) => c?.instanceId === "target"),
      false,
      action,
    );
  }
});
