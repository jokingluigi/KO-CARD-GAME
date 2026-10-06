import assert from "node:assert/strict";
import test from "node:test";
import {
  combatTimeline,
  attackFrames,
  attackBurstKind,
  vfxBudget,
  vfxParticles,
} from "./battle-vfx-model";
import {
  techniqueStageGeometry,
  techniqueRevealRect,
} from "./card-play-animation-utils";

for (const damage of [0, 1, 3, 5, 7, 12])
  test(`attack ${damage}: impact, hit stop and recovery fit the same clock`, () => {
    const time = combatTimeline(12, damage);
    assert.ok(
      time.impact < time.duration && time.release < time.duration * 0.82,
    );
    assert.equal(time.release > time.impact, damage > 0);
    const frames = attackFrames(110, -250, time);
    const offsets = frames.map((frame) => frame.offset as number);
    assert.deepEqual(
      offsets,
      [...offsets].sort((a, b) => a - b),
    );
    assert.equal(frames[3].transform, frames[4].transform);
    assert.equal(attackBurstKind({ damage }), damage ? "IMPACT" : "BLOCK");
  });
test("reduced motion has a short clock and no particles", () => {
  assert.deepEqual(combatTimeline(12, 12, true, true), {
    duration: 140,
    impact: 70,
    release: 70,
  });
  assert.equal(vfxBudget(false, true, 12).particles, 0);
  assert.ok(
    attackFrames(100, 200, combatTimeline(12, 12, false, true), true).every(
      (frame) => !String(frame.transform).includes("translate"),
    ),
  );
});
test("particle count and retina resolution are capped on mobile and desktop", () => {
  assert.ok(vfxBudget(true, false, 999).particles <= 20);
  assert.ok(vfxBudget(false, false, 999).particles <= 36);
  assert.equal(vfxBudget(true, false, 999).dpr, 1.5);
  const particles = vfxParticles("same-event", 36);
  assert.deepEqual(particles, vfxParticles("same-event", 36));
  assert.ok(particles.every((p) => Object.values(p).every(Number.isFinite)));
});
for (const [width, height] of [
  [320, 568],
  [390, 844],
  [844, 390],
  [1280, 720],
])
  test(`spell remains portrait and fully visible at ${width}×${height}`, () => {
    const source = techniqueRevealRect({
      left: 10,
      top: 10,
      width: 600,
      height: 50,
    });
    const geometry = techniqueStageGeometry(source, { width, height });
    assert.ok(geometry.left >= 19 && geometry.top >= 0);
    assert.ok(geometry.left + source.width * geometry.scale <= width - 19);
    assert.ok(geometry.top + source.height * geometry.scale <= height);
  });
