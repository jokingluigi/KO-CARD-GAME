import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../game/engine/create-initial-game-state";
import { battleEventCaption } from "./battle-event-caption-policy";
import { parseCombatPreferences } from "../combat-preferences";
function pair() {
  const a = createInitialGameState();
  a.status = "IN_PROGRESS";
  a.events = [];
  return [a, structuredClone(a)] as const;
}
test("only committed positive damage and actual healing announce; max health changes do not", () => {
  const [a, b] = pair();
  b.events = [
    {
      type: "DAMAGE_DEALT",
      amount: 0,
      target: { type: "PLAYER", playerId: b.players[0].id },
    },
  ];
  assert.equal(battleEventCaption(a, b), null);
  b.events[0].amount = 5;
  assert.equal(battleEventCaption(a, b), "내 챔피언 5 피해");
  b.events = [];
  b.players[0].health += 2;
  b.players[0].maxHealth += 2;
  assert.equal(battleEventCaption(a, b), null);
  b.players[0].presentationHealing = { sequence: 1, total: 2 };
  assert.equal(battleEventCaption(a, b), "내 챔피언 체력 +2 회복");
});
test("quest/result priority, no historical replay/new-match carryover and no mutation", () => {
  const [a, b] = pair();
  b.events = [
    { type: "CHAMPION_QUEST_COMPLETED", playerId: b.players[0].id },
    { type: "ENTER_FIELD", playerId: b.players[0].id },
  ];
  const snapshot = JSON.stringify(b);
  assert.match(battleEventCaption(a, b) ?? "", /퀘스트 완료/);
  assert.equal(JSON.stringify(b), snapshot);
  assert.equal(battleEventCaption(b, b), null);
  b.status = "FINISHED";
  b.winnerId = b.players[0].id;
  assert.equal(battleEventCaption(a, b), "승리 확정");
  b.gameId = "different";
  assert.equal(battleEventCaption(a, b), null);
});
test("hidden opponent draw never leaks card identity into captions", () => {
  const [a, b] = pair();
  b.events = [
    {
      type: "CARD_DRAWN",
      playerId: b.players[1].id,
      cardInstanceId: b.players[1].deck[0].instanceId,
    },
  ];
  assert.equal(battleEventCaption(a, b), null);
});
test("old preferences keep compatible defaults and invalid reading scales are rejected", () => {
  assert.equal(parseCombatPreferences(null).detailTextScale, 1);
  const p = parseCombatPreferences(
    JSON.stringify({
      detailTextScale: 1.3,
      dialogueTextScale: 900,
      highContrastTargets: false,
      visualEventCaptions: false,
    }),
  );
  assert.equal(p.detailTextScale, 1.3);
  assert.equal(p.dialogueTextScale, 1);
  assert.equal(p.highContrastTargets, false);
  assert.equal(p.visualEventCaptions, false);
});
