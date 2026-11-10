import assert from "node:assert/strict";
import test from "node:test";
import {
  PREPARATION_EVENTS,
  applyPreparationCondition,
} from "./champion-preparation-editor";
import { questEventRegistry } from "../../../../lib/game-engine/src/quest-conditions";
test("condition editors offer only actual registered battle events", () => {
  const registry = questEventRegistry();
  for (const [event, label] of PREPARATION_EVENTS) {
    assert.ok(registry[event], event);
    assert.ok(label);
    assert.ok(!event.startsWith("CHAMPION_QUEST_"));
  }
  assert.equal(
    new Set(PREPARATION_EVENTS.map(([id]) => id)).size,
    PREPARATION_EVENTS.length,
  );
});
test("applying analyzed condition clears stale special counters and preserves unrelated settings without mutating old config", () => {
  const old = {
    event: "DAMAGE_DEALT",
    selfEffectDamage: true,
    goldSpent: true,
    condition: { type: "TURN", turn: 5 },
    strictEventCount: true,
    sourceActionType: "CARD_EFFECT",
    custom: { note: "keep" },
  };
  const next = applyPreparationCondition(old, {
    event: "CARD_PLAYED",
    required: 7,
    progress: 1,
  });
  assert.deepEqual(next, {
    event: "CARD_PLAYED",
    required: 7,
    progress: 1,
    custom: { note: "keep" },
  });
  assert.equal(old.selfEffectDamage, true);
  assert.equal(old.event, "DAMAGE_DEALT");
});
