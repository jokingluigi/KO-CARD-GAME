import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { startGame } from '../engine/turn-system';
import { executeAction } from '../actions/engine-actions';
import { applyBossStart, applyBossPhaseTransition } from './boss-mode';

const bossConfig = {
  bossId: 'boss-1',
  name: '테스트 보스',
  playerHealthBonus: 5,
  phases: [
    { name: '1페이즈', health: 40 },
    { name: '2페이즈', health: 25, clearBoard: true, goldPerTurn: 2 },
  ],
};

test('보스전 시작: 첫 페이즈 체력과 플레이어 체력 보너스가 들어간다', () => {
  const started = startGame(createInitialGameState(), () => 0.5);
  const boss = applyBossStart(started, bossConfig);
  assert.equal(boss.players[1]!.health, 40);
  assert.equal(boss.players[1]!.maxHealth, 40);
  assert.equal(boss.players[0]!.health, started.players[0]!.health + 5);
  assert.equal(boss.boss?.phaseIndex, 0);
});

test('보스가 쓰러지면 다음 페이즈로 넘어가고, 마지막 페이즈에서 쓰러지면 경기가 끝난다', () => {
  const started = applyBossStart(startGame(createInitialGameState(), () => 0.5), bossConfig);
  const first = executeAction(started, { type: 'SURRENDER', playerId: started.players[1]!.id });
  assert.equal(first.success, true);
  assert.equal(first.state.status, 'IN_PROGRESS', JSON.stringify({success:first.success,boss:Boolean(first.state.boss),phase:first.state.boss?.phaseIndex,loser:first.state.loserId,bossPlayer:first.state.boss?.playerId,startStatus:started.status,players:started.players.map(p=>p.id)}));
  assert.equal(first.state.boss?.phaseIndex, 1);
  assert.equal(first.state.players[1]!.health, 25);
  assert.equal(first.state.winnerId, null);
  const second = executeAction(first.state, { type: 'SURRENDER', playerId: first.state.players[1]!.id });
  assert.equal(second.state.status, 'FINISHED');
  assert.equal(second.state.winnerId, started.players[0]!.id);
});

test('내가 지면 페이즈와 상관없이 경기가 끝난다', () => {
  const started = applyBossStart(startGame(createInitialGameState(), () => 0.5), bossConfig);
  const lost = executeAction(started, { type: 'SURRENDER', playerId: started.players[0]!.id });
  assert.equal(lost.state.status, 'FINISHED');
  assert.equal(lost.state.winnerId, started.players[1]!.id);
});

test('보스전이 아니면 아무것도 바꾸지 않는다', () => {
  const started = startGame(createInitialGameState(), () => 0.5);
  const finished = { ...started, status: 'FINISHED' as const, loserId: started.players[1]!.id };
  assert.equal(applyBossPhaseTransition(started, finished), finished);
});
