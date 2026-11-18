import test from 'node:test';
import assert from 'node:assert/strict';
import { finisherDamage } from './finisher-scale';

test('a finishing blow is one tier up, and only a big one is a full finisher', () => {
  assert.deepEqual(finisherDamage(1, true), { damage: 3, top: false });
  assert.deepEqual(finisherDamage(4, true), { damage: 6, top: false });
  assert.deepEqual(finisherDamage(7, true), { damage: 10, top: false });
  assert.deepEqual(finisherDamage(12, true), { damage: 12, top: true });
  assert.deepEqual(finisherDamage(5, false), { damage: 5, top: false });
  assert.deepEqual(finisherDamage(0, true), { damage: 0, top: false });
});
