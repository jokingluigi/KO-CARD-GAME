import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGameState } from './create-initial-game-state';
import { surrender } from './surrender';

function inProgressState() {
  return {
    ...createInitialGameState(),
    status: 'IN_PROGRESS' as const,
    activePlayerId: 'player-1',
  };
}

test('항복한 플레이어는 패배하고 상대는 승리한다', () => {
  const initial = inProgressState();
  const result = surrender(initial, 'player-1');

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.state.status, 'FINISHED');
  assert.equal(result.state.activePlayerId, null);
  assert.equal(result.state.winnerId, 'player-2');
  assert.equal(result.state.loserId, 'player-1');
  assert.equal(result.state.events.at(-1)?.type, 'SURRENDER');
  assert.equal(result.state.events.at(-1)?.playerId, 'player-1');
});

test('종료된 게임에서는 항복할 수 없다', () => {
  const initial = {
    ...inProgressState(),
    status: 'FINISHED' as const,
    winnerId: 'player-1',
    loserId: 'player-2',
  };
  const result = surrender(initial, 'player-1');

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.errorCode, 'GAME_NOT_IN_PROGRESS');
});

test('존재하지 않는 플레이어는 상대 대신 항복할 수 없다', () => {
  const result = surrender(inProgressState(), 'intruder');

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.errorCode, 'INVALID_PLAYER');
});