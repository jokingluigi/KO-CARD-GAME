import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialGameState } from './create-initial-game-state';
import { destroyCard } from './destroy-card';

test('일반 DESTROY는 카드 파괴 이벤트만 기록하고 카드를 묘지로 보내지 않는다', () => {
  const initial = createInitialGameState();
  const card = {
    ...initial.players[0].deck[0],
    boardSlot: 0 as const,
    enteredThisTurn: false,
  };
  const state = {
    ...initial,
    status: 'IN_PROGRESS' as const,
    activePlayerId: 'player-1',
    players: initial.players.map((player) =>
      player.id === 'player-1'
        ? {
            ...player,
            deck: player.deck.slice(1),
            board: [card, null, null, null] as typeof player.board,
          }
        : player,
    ),
  };

  const result = destroyCard(state, 'player-1', card.instanceId);

  assert.equal(result.success, true);
  assert.equal(result.state.players[0].board[0], null);
  assert.equal(result.state.players[0].graveyard.some((entry) => entry.instanceId === card.instanceId), false);
  assert.deepEqual(
    result.state.events.find(
      (event) =>
        event.type === 'CARD_DESTROYED' &&
        event.cardInstanceId === card.instanceId,
    ),
    {
      type: 'CARD_DESTROYED',
      playerId: 'player-1',
      cardInstanceId: card.instanceId,
      source: { type: 'SYSTEM' },
      target: { type: 'CARD', cardInstanceId: card.instanceId },
      reason: 'DESTROY',
      boardSlot: 0,
    },
  );
  assert.equal(
    result.state.events.some(
      (event) =>
        event.cardInstanceId === card.instanceId &&
        (event.type === 'CARD_RETIRED' || event.type === 'CARD_REMOVED'),
    ),
    false,
  );
});