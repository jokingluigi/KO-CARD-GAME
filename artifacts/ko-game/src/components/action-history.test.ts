import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGameState } from '../game/engine/create-initial-game-state';
import { TEST_CARD_DEFINITIONS } from '../game/cards/test-cards';
import { eventTitle, historyEvents } from './action-history-utils';

test('피해 기록은 공격자, 대상, 실제 피해량을 보여준다', () => {
  const state = createInitialGameState();
  const attackingCard = state.players[0]!.deck[0]!;
  const defendingCard = state.players[1]!.deck[0]!;
  state.players[0]!.board[0] = attackingCard;
  state.players[1]!.board[0] = defendingCard;
  const title = eventTitle(state, {
    type: 'DAMAGE_DEALT', playerId: state.players[1]!.id,
    source: { type: 'CARD', cardInstanceId: attackingCard.instanceId },
    target: { type: 'CARD', cardInstanceId: defendingCard.instanceId },
    amount: 3,
  }, state.players[0]!.id);
  assert.match(title, /→.*3 피해/);
});

test('퀘스트 보상과 대상 챔피언은 화면 플레이어 기준으로 표시한다', () => {
  const state = createInitialGameState();
  const player = state.players[0]!;
  assert.ok(player.champion?.quest);
  player.champion.quest.rewardText = '좀비 토큰을 전개합니다.';
  assert.match(eventTitle(state, { type: 'CHAMPION_QUEST_COMPLETED', playerId: player.id }, state.players[1]!.id), /좀비 토큰을 전개합니다/);
  assert.equal(eventTitle(state, { type: 'DAMAGE_DEALT', target: { type: 'PLAYER', playerId: player.id }, amount: 2 }, state.players[1]!.id), '효과 → 상대 챔피언: 2 피해');
});

test('변신 기록은 원래 카드와 변신 후 카드의 이름을 구분하고 전체 기록을 열 수 있다', () => {
  const state = createInitialGameState();
  const original = state.players[0]!.deck[0]!;
  const next = TEST_CARD_DEFINITIONS.find((entry) => entry.id !== original.definitionId)!;
  state.cardPool = TEST_CARD_DEFINITIONS;
  const originalName = TEST_CARD_DEFINITIONS.find((entry) => entry.id === original.definitionId)!.name;
  const nextName = next.name;
  const event = { type: 'CARD_TRANSFORMED' as const, cardInstanceId: original.instanceId,
    target: { type: 'CARD' as const, cardInstanceId: original.instanceId }, reason: next.id,
    tags: [`FROM:${original.definitionId}`] };
  assert.equal(eventTitle(state, event), `${originalName} → ${nextName} 변신`);
  state.events = Array.from({ length: 15 }, () => event);
  assert.equal(historyEvents(state).length, 12);
  assert.equal(historyEvents(state, Number.POSITIVE_INFINITY).length, 15);
});
