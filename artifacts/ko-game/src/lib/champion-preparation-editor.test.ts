import assert from "node:assert/strict";
import test from "node:test";
import { PREPARATION_EVENTS } from "./champion-preparation-editor";
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
