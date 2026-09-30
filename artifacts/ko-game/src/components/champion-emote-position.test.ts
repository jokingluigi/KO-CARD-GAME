import assert from 'node:assert/strict';
import test from 'node:test';
import { championEmotePosition } from './champion-emote-position';
for (const [width, height] of [[320, 640], [360, 740], [412, 915], [390, 844]]) test(`six-emote menu bounds remain inside ${width}x${height}`, () => {
  for (const left of [0, width / 2, width - 20]) for (const top of [0, height / 2, height - 20]) for (const measured of [158, 210]) {
    const position = championEmotePosition({ left, top }, { width, height }, measured);
    assert.ok(position.left >= 8); assert.ok(position.left + position.width <= width - 8);
    assert.ok(position.top >= 8); assert.ok(position.top + Math.min(measured, position.maxHeight) <= height - 8);
  }
});
test('zoomed visual viewport offsets and keyboard height constrain the entire scrollable menu', () => {
  const viewport = { width: 220, height: 140, offsetLeft: 45, offsetTop: 300 };
  const position = championEmotePosition({ left: 280, top: 600 }, viewport, 250);
  assert.ok(position.left >= 53); assert.ok(position.left + position.width <= 257);
  assert.ok(position.top >= 308); assert.ok(position.top + position.maxHeight <= 432); assert.ok(position.maxHeight < 250);
});
