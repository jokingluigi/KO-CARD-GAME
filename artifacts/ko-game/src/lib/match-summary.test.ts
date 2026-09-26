import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGameState } from '../game/engine/create-initial-game-state';
import { matchEndReason, matchSummary } from './match-summary';

test('피해받은 플레이어가 아닌 실제 효과 출처에 피해를 기록한다', () => {
  const state = createInitialGameState();
  const [me, opponent] = state.players;
  assert.ok(me && opponent && me.champion);
  me.champion.questCompleted = true;
  state.events = [
    { type: 'CARD_PLAYED', playerId: me.id, cardInstanceId: 'my-card' },
    { type: 'CARD_PLAYED', playerId: opponent.id, cardInstanceId: 'their-card' },
    { type: 'DAMAGE_DEALT', playerId: opponent.id, target: { type: 'PLAYER', playerId: opponent.id }, amount: 4,
      sourceContext: { sourcePlayerId: me.id, sourceActionType: 'ATTACK' } },
    { type: 'DAMAGE_DEALT', playerId: me.id, target: { type: 'PLAYER', playerId: me.id }, amount: 2,
      sourceContext: { sourcePlayerId: opponent.id, sourceActionType: 'ATTACK' } },
    { type: 'DAMAGE_DEALT', playerId: me.id, reason: 'FATIGUE', amount: 3,
      source: { type: 'SYSTEM' }, target: { type: 'PLAYER', playerId: me.id } },
    { type: 'CHAMPION_QUEST_COMPLETED', playerId: me.id },
  ];
  const [mine, theirs] = matchSummary(state);
  assert.deepEqual([mine?.cardsPlayed, theirs?.cardsPlayed], [1, 1]);
  assert.deepEqual([mine?.damageDealt, theirs?.damageDealt], [4, 2]);
  assert.equal(mine?.questCompleted, true);
  assert.equal(theirs?.questCompleted, false);
});

test('일반 선수 퇴장을 챔피언 퇴장으로 오인하지 않고 마지막 패배 피해를 읽는다', () => {
  const state = createInitialGameState();
  state.loserId = state.players[0]!.id;
  state.events = [
    { type: 'CARD_RETIRED', playerId: state.players[1]!.id, reason: 'RETIRE', cardInstanceId: 'wrestler' },
    { type: 'DAMAGE_DEALT', playerId: state.players[0]!.id, target: { type: 'PLAYER', playerId: state.loserId }, reason: 'CARD_EFFECT', amount: 4 },
  ];
  assert.equal(matchEndReason(state, state.players[0]!.id), '카드 효과로 매치가 종료되었습니다.');
});
