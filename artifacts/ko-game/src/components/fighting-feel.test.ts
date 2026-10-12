import assert from "node:assert/strict";
import test from "node:test";
import {
  combatTimeline,
  attackFrames,
  targetReactionFrames,
} from "./battle-vfx-model";
import { parseCombatPreferences, impactMultiplier } from "./combat-preferences";
test("contact, joint hitstop and directional recovery use one finite clock", () => {
  for (const [damage, finisher, min, max] of [
    [1, false, 25, 45],
    [4, false, 50, 80],
    [8, false, 85, 125],
    [15, true, 130, 190],
  ] as const) {
    const t = combatTimeline(damage, damage, finisher),
      a = attackFrames(160, -200, t),
      target = targetReactionFrames(160, -200, damage, t);
    assert.ok(t.release - t.impact >= min && t.release - t.impact <= max);
    assert.equal(a[3].transform, a[4].transform);
    assert.equal(target[2].transform, target[3].transform);
    assert.equal(a[3].offset, target[2].offset);
    assert.equal(a[4].offset, target[3].offset);
    assert.ok(String(target[4].transform).includes("rotate("));
    assert.deepEqual(
      target.map((f) => f.offset),
      target.map((f) => f.offset).sort((a, b) => Number(a) - Number(b)),
    );
    assert.equal(
      target.at(-1)?.transform,
      "translate3d(0px,0px,0) scale(1) rotate(0deg)",
    );
  }
});
test("prevented damage is not amplified by printed attack and preferences tolerate invalid storage", () => {
  assert.equal(combatTimeline(99, 0).release, combatTimeline(99, 0).impact);
  assert.ok(combatTimeline(99, 1).release - combatTimeline(99, 1).impact > combatTimeline(1, 1).release - combatTimeline(1, 1).impact);
  assert.equal(parseCombatPreferences(null).intensity, "STRONG");
  assert.equal("quality" in parseCombatPreferences('{"quality":"LOW"}'), false);
  assert.equal(parseCombatPreferences("null").reducedMotion, false);
  assert.ok(impactMultiplier("STANDARD") < impactMultiplier("STRONG"));
  assert.ok(impactMultiplier("STRONG") < impactMultiplier("EXTREME"));
});
