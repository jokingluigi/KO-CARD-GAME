import assert from 'node:assert/strict';
import test from 'node:test';

import { generateCard } from '../cards/generation';
import type { CardDefinition } from '../cards/types';
import { createInitialGameState } from './create-initial-game-state';
import { playTechniqueFromHand } from './play-technique';

test('using a saved ENTER_FIELD technique resolves its effect and progresses a technique quest', () => {
  const definition: CardDefinition = {
    id: 'legacy-technique', name: '기존 주문', cardType: 'TECHNIQUE', cost: 1,
    attack: 0, health: 0, rulesText: '사용 시 골드 +2', isToken: false,
    isChampionToken: false, keywords: [], abilities: [
      { trigger: 'ENTER_FIELD', effects: [{ type: 'GAIN_GOLD', amount: 2 }] },
    ],
  };
  const technique = generateCard(definition, {
    instanceId: 'technique-1', playerId: 'player-1',
    source: { type: 'PLAYER', playerId: 'player-1' }, reason: 'TEST',
  }).card;
  const initial = createInitialGameState();
  const state = {
    ...initial, status: 'IN_PROGRESS' as const, activePlayerId: 'player-1',
    players: initial.players.map((player) => player.id === 'player-1' ? {
      ...player, currentGold: 3, hand: [technique],
      champion: {
        ...player.champion!, questProgress: 0, questCompleted: false,
        quest: { id: 'technique-quest', name: '주문 퀘스트', description: '',
          trackedEvent: 'CARD_PLAYED' as const, cardType: 'TECHNIQUE' as const,
          requiredProgress: 1, reward: { type: 'GAIN_GOLD' as const, amount: 0 } },
      },
    } : player),
  };
  const result = playTechniqueFromHand(state, 'player-1', technique.instanceId);
  assert.equal(result.success, true);
  assert.equal(result.state.players[0]?.currentGold, 4);
  assert.equal(result.state.players[0]?.hand.length, 0);
  assert.equal(result.state.players[0]?.champion?.questProgress, 1);
  assert.equal(result.state.players[0]?.champion?.questCompleted, true);
});
