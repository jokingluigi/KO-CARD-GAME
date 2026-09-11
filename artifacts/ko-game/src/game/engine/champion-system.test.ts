import assert from 'node:assert/strict';
import test from 'node:test';

import { processChampionQuestEvents } from '../champions/quests';
import { createInitialGameState } from './create-initial-game-state';
import {
  canUseChampionAbility,
  useChampionAbility,
} from './champion-system';
import { startGame } from './turn-system';
import { setRuntimeCardDefinitions, TEST_CHAMPION_TOKEN_DEFINITION } from '../cards/test-cards';

const fixedRandom = () => 0.5;

test('게임 시작 상태에서 각 플레이어가 선택한 챔피언을 가진다', () => {
  const state = createInitialGameState([
    'test-champion-no-quest',
    'test-champion-quest',
  ]);

  assert.equal(state.players[0].champion?.id, 'test-champion-no-quest');
  assert.equal(state.players[0].champion?.health, 20);
  assert.equal(state.players[1].champion?.id, 'test-champion-quest');
  assert.equal(state.players[1].champion?.questProgress, 0);
});

test('퀘스트가 없는 챔피언도 정상적으로 생성된다', () => {
  const champion = createInitialGameState([
    'test-champion-no-quest',
    'test-champion-no-quest',
  ]).players[0].champion;

  assert.ok(champion);
  assert.equal(champion.quest, null);
  assert.equal(champion.upgradedAbility, null);
});

test('챔피언 능력은 비용을 지불하고 직접 사용한다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  assert.equal(canUseChampionAbility(started, 'player-1'), true);

  const result = useChampionAbility(started, 'player-1');
  assert.equal(result.success, true);
  assert.equal(result.state.players[0].currentGold, 1);
  assert.equal(
    result.state.events.some(
      (event) => event.type === 'CHAMPION_ABILITY_USED',
    ),
    true,
  );
});

test('골드가 부족하면 챔피언 능력을 사용할 수 없다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const noGold = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1' ? { ...player, currentGold: 0 } : player,
    ),
  };
  const result = useChampionAbility(noGold, 'player-1');

  assert.equal(result.success, false);
  assert.equal(result.state, noGold);
});

test('퀘스트는 지정된 게임 이벤트를 감지해 진행되고 완료된다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const firstEventState = {
    ...started,
    events: [
      ...started.events,
      { type: 'CARD_PLAYED' as const, playerId: 'player-1' },
    ],
  };
  const first = processChampionQuestEvents(started, firstEventState);
  assert.equal(first.players[0].champion?.questProgress, 1);
  assert.equal(first.players[0].champion?.questCompleted, false);

  const secondEventState = {
    ...first,
    events: [
      ...first.events,
      { type: 'CARD_PLAYED' as const, playerId: 'player-1' },
    ],
  };
  const completed = processChampionQuestEvents(first, secondEventState);
  assert.equal(completed.players[0].champion?.questProgress, 2);
  assert.equal(completed.players[0].champion?.questCompleted, true);
});

test('퀘스트 완료 후 강화된 챔피언 능력을 사용한다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const completed = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1' && player.champion
        ? {
            ...player,
            champion: { ...player.champion, questCompleted: true },
          }
        : player,
    ),
  };
  const result = useChampionAbility(completed, 'player-1');

  assert.equal(result.success, true);
  assert.equal(result.state.players[0].currentGold, 2);
  assert.equal(
    [...result.state.events].reverse().find(
      (event) => event.type === 'CHAMPION_ABILITY_USED',
    )?.reason,
    'test-gain-gold-upgraded',
  );
});

test('DB 기반 강화 능력은 기본 능력과 다른 비용을 사용할 수 있다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const completed = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1' && player.champion?.upgradedAbility
        ? {
            ...player,
            currentGold: 1,
            champion: {
              ...player.champion,
              questCompleted: true,
              upgradedAbility: { ...player.champion.upgradedAbility, cost: 1 },
            },
          }
        : player,
    ),
  };
  const result = useChampionAbility(completed, 'player-1');
  assert.equal(result.success, true);
  assert.equal(result.state.players[0].currentGold, 2);
});

test('퀘스트 완료 보상으로 특별 보상을 지급할 수 있다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const rewardState = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1' && player.champion?.quest
        ? {
            ...player,
            champion: {
              ...player.champion,
              questProgress: 1,
              quest: {
                ...player.champion.quest,
                reward: { type: 'GAIN_GOLD' as const, amount: 3 },
              },
            },
          }
        : player,
    ),
  };
  const withEvent = {
    ...rewardState,
    events: [
      ...rewardState.events,
      { type: 'CARD_PLAYED' as const, playerId: 'player-1' },
    ],
  };
  const completed = processChampionQuestEvents(rewardState, withEvent);

  assert.equal(completed.players[0].currentGold, 4);
  assert.equal(completed.players[0].champion?.questCompleted, true);
});

test('퀘스트 완료 시 연결된 Champion Token을 직접 전개하고 ENTER_FIELD를 실행한다', () => {
  setRuntimeCardDefinitions([{
    ...TEST_CHAMPION_TOKEN_DEFINITION,
    abilities: [{ trigger: 'ENTER_FIELD', effects: [{ type: 'GAIN_GOLD', amount: 1 }] }],
  }]);
  const started = startGame(createInitialGameState(
    undefined,
    [{
      ...TEST_CHAMPION_TOKEN_DEFINITION,
      abilities: [{ trigger: 'ENTER_FIELD', effects: [{ type: 'GAIN_GOLD', amount: 1 }] }],
    }],
  ), fixedRandom);
  const rewardState = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1' && player.champion?.quest
        ? {
            ...player,
            champion: {
              ...player.champion,
              questProgress: player.champion.quest.requiredProgress - 1,
              quest: {
                ...player.champion.quest,
                reward: {
                  type: 'DIRECT_DEPLOY_CHAMPION_TOKEN' as const,
                  cardDefinitionId: TEST_CHAMPION_TOKEN_DEFINITION.id,
                },
              },
            },
          }
        : player,
    ),
  };
  const completed = processChampionQuestEvents(rewardState, {
    ...rewardState,
    events: [...rewardState.events, { type: 'CARD_PLAYED' as const, playerId: 'player-1' }],
  });
  const token = completed.players[0].board.find((card) => card?.isChampionToken);

  assert.equal(token?.definitionId, TEST_CHAMPION_TOKEN_DEFINITION.id);
  assert.equal(token?.isDirectDeployedChampion, true);
  assert.equal(completed.players[0].currentGold, 2);
  assert.ok(completed.events.some((event) => event.reason === 'CHAMPION_QUEST_REWARD'));
});