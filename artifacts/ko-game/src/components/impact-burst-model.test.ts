import test from 'node:test';
import assert from 'node:assert/strict';
import { crackShapes, damageSplashPath, impactBurstProfile, impactBurstTier, shudderFrames } from './impact-burst-model';

test('no burst without real damage', () => {
  assert.equal(impactBurstTier(0), null);
  assert.equal(impactBurstTier(NaN), null);
  assert.equal(impactBurstProfile(0, true), null);
});

test('more damage never looks weaker', () => {
  const order = [1, 3, 6, 10].map(d => impactBurstProfile(d)!);
  order.push(impactBurstProfile(12, true)!);
  for (let i = 1; i < order.length; i++) {
    for (const key of ['flashSize', 'dust', 'debris', 'sparks', 'speed', 'cracks', 'shake', 'screenFlash', 'whiteout', 'badgeSize', 'life'] as const) {
      assert.ok(order[i][key] >= order[i - 1][key], `${key} ${order[i].tier} >= ${order[i - 1].tier}`);
    }
  }
});

test('a 1-damage poke is small but still visible', () => {
  const light = impactBurstProfile(1)!;
  assert.ok(light.flashSize >= 100 && light.dust >= 4 && light.shake > 0 && light.whiteout >= 2 && light.badgeSize >= 56);
});

test('tiers are far apart: a finisher dwarfs a poke', () => {
  const light = impactBurstProfile(1)!, finisher = impactBurstProfile(12, true)!;
  assert.equal(impactBurstProfile(1, true)!.cracks, 0, "a 1-damage finishing blow does not crack the board");
  assert.ok(finisher.flashSize >= light.flashSize * 4);
  assert.ok(finisher.dust >= light.dust * 8 && finisher.debris >= light.debris * 10);
  assert.ok(finisher.shake >= light.shake * 6 && finisher.badgeSize >= light.badgeSize * 2.2);
});

test('only heavy hits crack the board', () => {
  assert.equal(impactBurstProfile(5)!.cracks, 0);
  assert.ok(impactBurstProfile(6)!.cracks > 0);
});

test('preferences only turn the effect down', () => {
  const full = impactBurstProfile(6)!;
  const low = impactBurstProfile(6, false, { quality: 'LOW', flash: 0 })!;
  assert.ok(low.dust < full.dust && low.screenFlash === 0 && low.whiteout === 1);
  const reduced = impactBurstProfile(10, false, { reduced: true })!;
  assert.equal(reduced.dust + reduced.debris + reduced.sparks + reduced.cracks + reduced.shake + reduced.screenFlash, 0);
  assert.ok(impactBurstProfile(6, false, { viewportMin: 360 })!.flashSize < full.flashSize);
});

test('shudder alternates, decays and ends at rest', () => {
  const frames = shudderFrames(8);
  assert.equal(frames.at(-1), '0px 0px');
  const xs = frames.slice(0, -1).map(f => parseFloat(f));
  for (let i = 1; i < xs.length; i++) {
    assert.ok(Math.sign(xs[i]) !== Math.sign(xs[i - 1]));
    assert.ok(Math.abs(xs[i]) < Math.abs(xs[i - 1]));
  }
  assert.deepEqual(shudderFrames(0), ['0px 0px', '0px 0px']);
});

test('damage splash outline is closed, stable and bounded', () => {
  const d = damageSplashPath(50, 4);
  assert.equal(d, damageSplashPath(50, 4));
  assert.ok(d.startsWith('M') && d.endsWith('Z'));
  assert.equal((d.match(/Q/g) ?? []).length, 11);
  const numbers = d.replace(/[MQZ]/g, ' ').trim().split(/[\s,]+/).map(Number);
  for (let i = 0; i < numbers.length; i += 2) assert.ok(Math.hypot(numbers[i]!, numbers[i + 1]!) <= 50.5);
});

test('cracks radiate all around the hit, stay within reach and taper', () => {
  const shapes = crackShapes(0, 0, 6, 200, 12, 3);
  assert.ok(shapes.length >= 6);
  const mains = shapes.filter(shape => Math.hypot(...shape.outline[0]!) < 8);
  assert.equal(mains.length, 6);
  const quadrants = new Set(mains.map(shape => { const [tx, ty] = shape.edge.at(-1)!; return `${tx > 0}${ty > 0}`; }));
  assert.ok(quadrants.size >= 3, 'spread in several directions');
  for (const shape of shapes) {
    for (const [px, py] of shape.outline) assert.ok(Math.hypot(px, py) <= 260);
    const n = shape.edge.length, outline = shape.outline;
    const widthAt = (i: number) => Math.hypot(outline[i]![0] - outline[outline.length - 1 - i]![0], outline[i]![1] - outline[outline.length - 1 - i]![1]);
    assert.ok(widthAt(0) > widthAt(n - 1), 'wider at the root than the tip');
  }
  assert.deepEqual(crackShapes(0, 0, 4, 100, 6, 9), crackShapes(0, 0, 4, 100, 6, 9));
  assert.equal(crackShapes(0, 0, 0, 100, 6).length, 0);
});
