import assert from "node:assert/strict";
import test from "node:test";

import {
  championAbilityAction,
  effectTargetAction,
  shouldResyncAfterActionRejection,
} from "./online-target-actions";

test("Champion ability uses the direct action when no player choice is needed", () => {
  assert.deepEqual(
    championAbilityAction([{ type: "GAIN_GOLD", amount: 1 }]),
    { type: "USE_CHAMPION_ABILITY" },
  );
  assert.deepEqual(championAbilityAction([]), { type: "USE_CHAMPION_ABILITY" });
  assert.equal(championAbilityAction(undefined), null);
});

test("the selected current ability effects determine targeted Champion action", () => {
  assert.deepEqual(
    championAbilityAction(
      [{ type: "STRUCTURED", action: "DAMAGE", target: { selection: "PLAYER_CHOICE" } }],
    ),
    {
      type: "BEGIN_TARGETED_ACTION",
      action: { type: "USE_CHAMPION_ABILITY" },
    },
  );
  assert.deepEqual(
    championAbilityAction(
      [{
        type: "SCRIPT",
        script: {
          steps: [{ type: "SELECT", target: { selection: "PLAYER_CHOICE" } }],
        },
      }],
    ),
    {
      type: "BEGIN_TARGETED_ACTION",
      action: { type: "USE_CHAMPION_ABILITY" },
    },
  );
});

test("stale target and version rejections request an authoritative resync", () => {
  assert.equal(shouldResyncAfterActionRejection("INVALID_TARGET", 5, 5), true);
  assert.equal(shouldResyncAfterActionRejection("STALE_VERSION", 5, 5), true);
  assert.equal(shouldResyncAfterActionRejection("OTHER_ERROR", 5, 4), true);
  assert.equal(shouldResyncAfterActionRejection("OTHER_ERROR", 5, 5), false);
});

test("effect target action follows the authoritative targeting phase", () => {
  assert.deepEqual(effectTargetAction("PRE_COMMIT", "target-1"), {
    type: "CONFIRM_PRECOMMIT_TARGET",
    targetId: "target-1",
  });
  assert.deepEqual(effectTargetAction("POST_COMMIT", "target-1"), {
    type: "SELECT_EFFECT_TARGET",
    targetId: "target-1",
  });
  assert.deepEqual(effectTargetAction(undefined, "legacy-target"), {
    type: "SELECT_EFFECT_TARGET",
    targetId: "legacy-target",
  });
});