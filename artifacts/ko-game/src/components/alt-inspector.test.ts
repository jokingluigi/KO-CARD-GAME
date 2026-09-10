import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateInspectorPosition } from './alt-inspector';

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  right: left + width,
  top,
  bottom: top + height,
});

test('상단 카드는 아래쪽에 표시한다', () => {
  const position = calculateInspectorPosition(rect(120, 24, 80, 100), { width: 280, height: 200 }, 1920, 927);
  assert.deepEqual(position, { left: 210, top: 134 });
});

test('하단 손패는 패널을 카드 위쪽으로 올린다', () => {
  const position = calculateInspectorPosition(rect(120, 780, 80, 120), { width: 280, height: 220 }, 1920, 927);
  assert.equal(position.top, 550);
  assert.equal(position.left, 210);
});

test('좌우 끝 카드는 패널을 viewport 안으로 clamp한다', () => {
  const leftEdge = calculateInspectorPosition(rect(0, 300, 60, 100), { width: 280, height: 200 }, 390, 844);
  const rightEdge = calculateInspectorPosition(rect(350, 300, 40, 100), { width: 280, height: 200 }, 390, 844);

  assert.equal(leftEdge.left, 70);
  assert.equal(rightEdge.left, 60);
  assert.ok(leftEdge.left >= 12);
  assert.ok(rightEdge.left + 280 <= 378);
});

test('긴 패널도 viewport 여백 안에서 clamp한다', () => {
  const position = calculateInspectorPosition(rect(160, 400, 60, 80), { width: 420, height: 1200 }, 390, 844);
  assert.deepEqual(position, { left: 12, top: 12 });
});