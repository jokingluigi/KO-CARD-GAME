import test from 'node:test';
import assert from 'node:assert/strict';
import { hitForce, hitImpulse } from './card-physics-model';

test('hit impulse points along the blow and scales with force', () => {
  const up = hitImpulse(0, -10, .5);
  assert.equal(up.pitch, -.5);
  assert.equal(up.yaw, 0);
  const side = hitImpulse(10, 0, .5);
  assert.ok(side.yaw > 0 && side.roll > 0 && side.pitch === 0);
  assert.deepEqual(hitImpulse(1, 0, -3), { pitch: 0, yaw: 0, roll: 0 });
});

test('bigger hits kick harder, blocked hits do not kick', () => {
  const forces = [1, 3, 6, 10].map(d => hitForce(d));
  for (let i = 1; i < forces.length; i++) assert.ok(forces[i]! > forces[i - 1]!);
  assert.ok(hitForce(12, true) > hitForce(12));
  assert.ok(hitForce(1, true) < hitForce(12), "a weak finishing poke stays small");
  assert.equal(hitForce(0), 0);
});
