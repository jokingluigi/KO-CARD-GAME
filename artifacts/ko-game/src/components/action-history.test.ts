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

test('턴/드로우/퀘스트 진행은 기존 이벤트에서 표시하며 상대 드로우 이름은 숨긴다', () => {
 const state=createInitialGameState();const id=state.players[1].deck[0].instanceId;
 const drawn={type:'CARD_DRAWN' as const,playerId:state.players[1].id,cardInstanceId:id};
 assert.equal(eventTitle(state,drawn,state.players[0].id),'카드 드로우');
 state.events=[{type:'TURN_STARTED',playerId:state.players[0].id},drawn,{type:'CHAMPION_QUEST_PROGRESS',playerId:state.players[0].id,amount:1},{type:'TURN_ENDED',playerId:state.players[0].id}];
 assert.equal(historyEvents(state).length,4);
 assert.match(eventTitle(state,state.events[0]),/턴 시작/);
 assert.match(eventTitle(state,state.events[2]),/피니셔 준비 진행/);
 assert.match(eventTitle(state,state.events[3]),/턴 종료/);
});

test('V22: 챔피언 능력 피해는 "알 수 없는 카드"가 아니라 챔피언·능력 이름으로 보인다', () => {
  const state = createInitialGameState();
  const owner = state.players[0]!;
  const champion = owner.champion!;
  const target = state.players[1]!.deck[0]!;
  state.players[1]!.board[0] = target;
  const title = eventTitle(state, {
    type: 'DAMAGE_DEALT', playerId: state.players[1]!.id,
    source: { type: 'CARD', cardInstanceId: `champion-${champion.id}` },
    sourceContext: { sourcePlayerId: owner.id, sourceActionType: 'USE_CHAMPION_ABILITY', sourceChampionDefinitionId: champion.id, sourceAbilityId: champion.ability.id },
    target: { type: 'CARD', cardInstanceId: target.instanceId }, amount: 1,
  }, owner.id);
  assert.doesNotMatch(title, /알 수 없는 카드/);
  assert.ok(title.startsWith(`${champion.name} 능력(${champion.ability.name})`), title);
});

test('V23: 같은 카드의 연속 피해는 공격·반격·효과로 구분하고 음수 체력은 초과 피해로 보여 준다', () => {
  const state = createInitialGameState();
  const a = state.players[0]!.deck[0]!; const d = state.players[1]!.deck[0]!;
  state.players[0]!.board[0] = a; state.players[1]!.board[0] = d;
  const base = { type: 'DAMAGE_DEALT' as const, source: { type: 'CARD' as const, cardInstanceId: d.instanceId }, target: { type: 'CARD' as const, cardInstanceId: a.instanceId }, amount: 1 };
  const counter = eventTitle(state, { ...base, before: 1, after: 0, sourceContext: { sourcePlayerId: state.players[1]!.id, sourceActionType: 'ATTACK', combatRole: 'DEFENDER' } }, state.players[0]!.id);
  const reaction = eventTitle(state, { ...base, before: 0, after: -1, sourceContext: { sourcePlayerId: state.players[1]!.id, sourceActionType: 'ATTACK' } }, state.players[0]!.id);
  assert.match(counter, /1 피해 · 반격 \(체력 1 → 0\)/);
  assert.match(reaction, /1 피해 · 효과 \(체력 0 → 0, 초과 피해 1\)/);
});
