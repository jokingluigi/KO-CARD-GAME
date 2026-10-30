import test from "node:test";
import assert from "node:assert/strict";
import {
  handUnavailableReason,
  readDeckDraft,
  sameDraft,
  draftKey,
} from "./policy";
import { parseCombatPreferences } from "../combat-preferences";
import { combatCameraFrames, damageImpact } from "../screen-impact-policy";
import type { CardInstance, GameState } from "@/game";
const unit = { cardType: "WRESTLER" } as CardInstance;
const state = () =>
  ({
    status: "IN_PROGRESS",
    activePlayerId: "me",
    players: [{ id: "me", currentGold: 2, board: [null, null, null, null] }],
  }) as unknown as GameState;
test("observable hand prerequisites explain blocked input without mutating state", () => {
  const s = state(),
    before = JSON.stringify(s);
  assert.match(handUnavailableReason(s, unit, 4)!, /2 부족/);
  assert.equal(handUnavailableReason(s, unit, 1), null);
  assert.match(handUnavailableReason(s, unit, 1, false)!, /타워/);
  assert.equal(JSON.stringify(s), before);
  s.players[0].board = [unit, unit, unit, unit];
  assert.match(handUnavailableReason(s, unit, 1)!, /가득/);
  assert.equal(
    handUnavailableReason(s, { ...unit, cardType: "TECHNIQUE" }, 1),
    null,
  );
  s.activePlayerId = "other";
  assert.match(handUnavailableReason(s, unit, 1)!, /내 턴/);
});
test("targeting takes precedence over a misleading gold explanation", () => {
  const s = state();
  s.targetingState = { active: true } as GameState["targetingState"];
  assert.match(handUnavailableReason(s, unit, 10)!, /대상/);
});
test("draft recovery is explicit, bounded and scoped by account", () => {
  const d = {
    editingId: "owned",
    name: "draft",
    championId: null,
    cards: ["a", "b"],
  };
  assert.deepEqual(readDeckDraft(JSON.stringify(d)), d);
  for (const raw of [
    "null",
    "bad",
    "{}",
    JSON.stringify({ ...d, cards: [3] }),
    JSON.stringify({ ...d, cards: Array(101).fill("a") }),
  ])
    assert.equal(readDeckDraft(raw), null);
  assert.ok(sameDraft(d, { ...d, cards: [...d.cards] }));
  assert.equal(sameDraft(d, { ...d, cards: ["a"] }), false);
  assert.notEqual(draftKey("a"), draftKey("b"));
});
test("independent presentation settings keep old defaults and reject malformed values", () => {
  const old = parseCombatPreferences('{"quality":"LOW"}');
  assert.equal(old.zoom, 1);
  assert.equal(old.flash, 1);
  assert.equal(old.spriteMotion, 1);
  assert.equal(old.confirmEndTurn, true);
  const p = parseCombatPreferences(
    '{"zoom":0,"flash":-1,"spriteMotion":4,"confirmEndTurn":false}',
  );
  assert.equal(p.zoom, 0);
  assert.equal(p.flash, 0);
  assert.equal(p.spriteMotion, 1);
  assert.equal(p.confirmEndTurn, false);
  assert.equal(parseCombatPreferences("null").zoom, 1);
});
test("zoom and shake can be controlled independently and return to identity", () => {
  const p = damageImpact(8),
    noZoom = combatCameraFrames(p, { x: 1, y: 0 }, false, 0);
  assert.ok(noZoom.every((f) => f.scale === "1"));
  assert.ok(noZoom.some((f) => f.translate !== "0.000px 0.000px"));
  const zoomOnly = combatCameraFrames(
    { ...p, amplitude: 0 },
    { x: 1, y: 0 },
    false,
    1,
  );
  assert.ok(zoomOnly.some((f) => Number(f.scale) > 1));
  assert.ok(zoomOnly.every((f) => f.translate === "0.000px 0.000px"));
  assert.equal(zoomOnly.at(-1)?.scale, "1");
});
