import test from 'node:test';
import assert from 'node:assert/strict';
import { createSwing, stepSwing, swingAtRest, swingTarget, swingTransform, SWING_LIMITS } from './card-swing-physics';

test('moving the card makes it lean with the motion, within limits', () => {
  const right = swingTarget(2, 0), up = swingTarget(0, -2);
  assert.ok(right.yaw > 0 && right.roll > 0 && right.pitch === 0);
  assert.ok(up.pitch < 0 && up.yaw === 0);
  const wild = swingTarget(50, -50);
  assert.equal(wild.yaw, SWING_LIMITS.yaw);
  assert.equal(wild.pitch, -SWING_LIMITS.pitch);
  assert.deepEqual(swingTarget(NaN, Infinity), { pitch: 0, yaw: 0, roll: 0 });
});

test('a sudden stop overshoots, wobbles, then settles flat', () => {
  let state = createSwing();
  for (let t = 0; t < 400; t += 16) state = stepSwing(state, swingTarget(1.5, 0), 16);
  assert.ok(state.yaw.angle > 15, 'leaning while moving');
  let crossed = 0, previous = state.yaw.angle;
  for (let t = 0; t < 3000; t += 16) {
    state = stepSwing(state, { pitch: 0, yaw: 0, roll: 0 }, 16);
    if (Math.sign(state.yaw.angle) !== Math.sign(previous) && Math.abs(state.yaw.angle) > .05) crossed++;
    previous = state.yaw.angle;
  }
  assert.ok(crossed >= 1, 'swings past flat at least once');
  assert.ok(swingAtRest(state), 'comes to rest');
});

test('springs stay stable on slow or bad frames', () => {
  let state = createSwing();
  for (let i = 0; i < 50; i++) state = stepSwing(state, swingTarget(3, -3), 1000);
  for (const axis of [state.pitch, state.yaw, state.roll]) assert.ok(Number.isFinite(axis.angle) && Math.abs(axis.angle) <= 40);
  assert.deepEqual(stepSwing(createSwing(), swingTarget(1, 1), NaN), createSwing());
});

test('flat card produces an identity-looking transform', () => {
  const { transform, shadowX, shadowY } = swingTransform(createSwing());
  assert.equal(transform, 'perspective(900px) rotateX(0.00deg) rotateY(0.00deg) rotate(0.00deg)');
  assert.equal(shadowX === 0 || Object.is(shadowX, -0), true);
  assert.equal(shadowY, 0);
});
