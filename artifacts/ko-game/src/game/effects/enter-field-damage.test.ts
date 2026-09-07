import assert from 'node:assert/strict';
import test from 'node:test';

import { generateCard } from '../cards/generation';
import type { CardDefinition } from '../cards/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { enterField } from '../engine/enter-field';

const damageWrestler: CardDefinition = {
  id: 'enter-field-damage-test',
  name: '등장 피해 테스트 선수',
  cardType: 'WRESTLER',
  cost: 1,
  attack: 1,
  health: 1,
  rulesText: '등장: 상대 챔피언에게 5 데미지를 줍니다.',
  isToken: false,
  isChampionToken: false,
  keywords: [],
  abilities: [
    {
      trigger: 'ENTER_FIELD',
      effects: [{ type: 'DAMAGE_OPPONENT_CHAMPION', amount: 5 }],
    },
  ],
};

test('등장 효과로 상대 챔피언에게 피해를 준다', () => {
  const state = createInitialGameState();
  const { card } = generateCard(damageWrestler, {
    instanceId: 'enter-field-damage-instance',
    playerId: 'player-1',
    source: { type: 'PLAYER', playerId: 'player-1' },
    reason: 'TEST',
  });

  const result = enterField(state, 'player-1', card, 0);

  assert.equal(result.players[1].health, 15);
  assert.equal(result.players[1].champion?.health, 15);
  assert.ok(
    result.events.some(
      (event) =>
        event.type === 'DAMAGE_DEALT' &&
        event.cardInstanceId === card.instanceId &&
        event.amount === 5 &&
        event.target?.type === 'PLAYER' &&
        event.target.playerId === 'player-2',
    ),
  );
});