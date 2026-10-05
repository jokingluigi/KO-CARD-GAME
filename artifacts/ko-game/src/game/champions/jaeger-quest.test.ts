import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { processChampionQuestEvents } from './quests';

test('eight-generation quest ignores techniques and enemy cards, completes at eight and rewards once', () => {
  let state = createInitialGameState();
  state.events = [];
  const champion = state.players[0].champion!;
  state.players[0].champion = { ...champion, questProgress: 0, questCompleted: false, quest: {
    id: 'jaeger-quest', name: '용병술 훈련', description: '선수 카드를 8번 생성한다.(손패,덱,필드)',
    trackedEvent: 'CARD_GENERATED', cardType: 'WRESTLER', requiredProgress: 8,
    reward: { type: 'UPGRADE_ABILITY', effects: [] },
  } };
  const generate = (playerId: string, cardType: 'WRESTLER' | 'TECHNIQUE') => {
    const next = { ...state, events: [...state.events, {
      type: 'CARD_GENERATED' as const, playerId, cardType, cardInstanceId: `generated-${state.events.length}`,
    }] };
    state = processChampionQuestEvents(state, next);
  };
  generate('player-2', 'WRESTLER');
  generate('player-1', 'TECHNIQUE');
  assert.equal(state.players[0].champion!.questProgress, 0);
  for (let count = 1; count <= 8; count++) {
    generate('player-1', 'WRESTLER');
    assert.equal(state.players[0].champion!.questProgress, count);
    assert.equal(state.players[0].champion!.questCompleted, count === 8);
  }
  generate('player-1', 'WRESTLER');
  assert.equal(state.players[0].champion!.questProgress, 8);
  assert.equal(state.events.filter(event => event.type === 'CHAMPION_QUEST_COMPLETED' && event.playerId === 'player-1').length, 1);
});
