import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateInspectorPosition, getNumericChanges } from './alt-inspector';
import type { CardInstance } from '../game/cards/types';

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

test('카드 수치 변경은 기본값 대비 before/after와 delta를 만든다', () => {
  const card = {
    instanceId: 'history-card',
    definitionId: 'missing-definition',
    cardType: 'WRESTLER',
    currentCost: 2,
    baseCost: 3,
    currentAttack: 5,
    baseAttack: 3,
    currentHealth: 1,
    maxHealth: 4,
    baseHealth: 2,
    boardSlot: 0,
    enteredThisTurn: false,
    attacksUsedThisTurn: 0,
    isGenerated: false,
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [],
    isSilenced: false,
    isSilenceImmune: false,
    dodgeAvailable: false,
    dodgeCharges: 0,
    isStunned: false,
    activeUsedThisTurn: false,
    isDirectDeployedChampion: false,
  } satisfies CardInstance;

  const changes = getNumericChanges(card);
  assert.deepEqual(
    changes.map(({ stat, before, after, delta }) => ({ stat, before, after, delta })),
    [
      { stat: 'cost', before: 3, after: 2, delta: -1 },
      { stat: 'attack', before: 3, after: 5, delta: 2 },
      { stat: 'maxHealth', before: 2, after: 4, delta: 2 },
      { stat: 'currentHealth', before: 4, after: 1, delta: -3 },
    ],
  );
});