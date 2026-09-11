import assert from 'node:assert/strict';
import test from 'node:test';

import { silenceCard } from './card-status';
import { attack } from './combat';
import { createInitialGameState } from './create-initial-game-state';
import { destroyCard } from './destroy-card';
import { drawCard } from './draw-card';
import {
  findDirectDeployedChampion,
  getPlayerSurvivalHealth,
} from './direct-champion';
import { useChampionAbility } from './champion-system';
import { startGame } from './turn-system';
import type { GameState } from '../types/game-state';
import { TEST_CHAMPION_TOKEN_DEFINITION } from '../cards/test-cards';
import { TEST_CHAMPIONS } from '../champions/test-champions';
import type { ChampionDefinition } from '../champions/types';

const fixedRandom = () => 0.5;

function deployDirectChampion(): GameState {
  const started = startGame(
    createInitialGameState([
      'test-champion-direct-deploy',
      'test-champion-no-quest',
    ], [TEST_CHAMPION_TOKEN_DEFINITION]),
    fixedRandom,
  );
  const result = useChampionAbility(started, 'player-1');
  assert.equal(result.success, true);
  return result.state;
}

function givePlayerTwoAttacker(state: GameState): GameState {
  const playerTwo = state.players[1];
  const attacker = {
    ...playerTwo.deck[0],
    boardSlot: 0 as const,
    enteredThisTurn: false,
    attacksUsedThisTurn: 0,
  };
  return {
    ...state,
    activePlayerId: 'player-2',
    players: state.players.map((player) =>
      player.id === 'player-2'
        ? {
            ...player,
            deck: player.deck.slice(1),
            board: [attacker, null, null, null],
          }
        : player,
    ),
  };
}

function linkedChampion(overrides: Partial<ChampionDefinition> = {}): ChampionDefinition {
  const base = TEST_CHAMPIONS.find((champion) => champion.id === 'test-champion-no-quest')!;
  return {
    ...base,
    id: 'test-linked-champion',
    championTokenDefinitionId: TEST_CHAMPION_TOKEN_DEFINITION.id,
    ability: {
      ...base.ability,
      effects: [{
        type: 'STRUCTURED',
        action: 'DEPLOY_CHAMPION_TOKEN',
      }],
    },
    ...overrides,
  };
}

test('챔피언 자신의 효과로만 직접 출전 상태를 만든다', () => {
  const state = deployDirectChampion();
  const card = findDirectDeployedChampion(state, 'player-1');

  assert.ok(card);
  assert.equal(card.isChampionToken, true);
  assert.equal(card.isDirectDeployedChampion, true);
  assert.equal(card.isSilenceImmune, true);
  assert.equal(card.isGenerated, true);
});

test('직접 출전 토큰은 전개 순간 Champion 현재 체력을 기본 최대 체력에 더한다', () => {
  const started = startGame(
    createInitialGameState([
      'test-champion-direct-deploy',
      'test-champion-no-quest',
    ], [TEST_CHAMPION_TOKEN_DEFINITION]),
    fixedRandom,
  );
  const damaged = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1' && player.champion
        ? {
            ...player,
            health: 7,
            champion: { ...player.champion, health: 7 },
          }
        : player,
    ),
  };
  const result = useChampionAbility(damaged, 'player-1');

  assert.equal(result.success, true);
  assert.equal(findDirectDeployedChampion(result.state, 'player-1')?.currentHealth, 27);
  assert.equal(findDirectDeployedChampion(result.state, 'player-1')?.maxHealth, 27);
  assert.equal(getPlayerSurvivalHealth(result.state, 'player-1'), 27);
});

test('직접 출전 챔피언은 침묵되지 않는다', () => {
  const state = deployDirectChampion();
  const card = findDirectDeployedChampion(state, 'player-1');
  assert.ok(card);

  const silenced = silenceCard(state, card.instanceId);
  assert.equal(
    findDirectDeployedChampion(silenced, 'player-1')?.isSilenced,
    false,
  );
});

test('직접 출전 챔피언은 효과로 DESTROY할 수 없다', () => {
  const state = deployDirectChampion();
  const card = findDirectDeployedChampion(state, 'player-1');
  assert.ok(card);

  const result = destroyCard(state, 'player-1', card.instanceId);
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'DIRECT_CHAMPION_CANNOT_BE_DESTROYED');
  assert.equal(result.state, state);
});

test('직접 출전 토큰은 필드 선수로 공격할 수 있고 Champion 본체는 공격할 수 없다', () => {
  const deployed = deployDirectChampion();
  const directChampion = findDirectDeployedChampion(deployed, 'player-1');
  assert.ok(directChampion);
  const ready = givePlayerTwoAttacker(deployed);
  const attacker = ready.players[1].board[0]!;
  const blocked = attack(ready, 'player-2', attacker.instanceId, {
    type: 'PLAYER',
    playerId: 'player-1',
  });
  assert.equal(blocked.success, false);

  const result = attack(ready, 'player-2', attacker.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-1',
    cardInstanceId: directChampion.instanceId,
  });

  assert.equal(result.success, true);
  assert.equal(result.state.players[0].health, 20);
  assert.equal(
    getPlayerSurvivalHealth(result.state, 'player-1'),
    directChampion.currentHealth - attacker.currentAttack,
  );
  const damageEvent = [...result.state.events]
    .reverse()
    .find((event) =>
      event.type === 'DAMAGE_DEALT' &&
      event.target.type === 'CARD' &&
      event.target.cardInstanceId === directChampion.instanceId,
    );
  assert.deepEqual(damageEvent?.target, {
    type: 'CARD',
    cardInstanceId: directChampion.instanceId,
  });
});

test('구조화 DEPLOY_CHAMPION_TOKEN은 현재 챔피언 연결을 사용하고 등장 효과를 실행한다', () => {
  const champion = linkedChampion({
    ability: {
      id: 'linked-deploy',
      name: '연결 토큰 전개',
      description: '챔피언을 소환합니다.',
      effects: [{
        type: 'STRUCTURED',
        action: 'DEPLOY_CHAMPION_TOKEN',
      }],
    },
  });
  const state = startGame(
    createInitialGameState(
      ['test-linked-champion', 'test-champion-no-quest'],
      [TEST_CHAMPION_TOKEN_DEFINITION],
      [champion, TEST_CHAMPIONS[1]!],
    ),
    fixedRandom,
  );
  const damaged = {
    ...state,
    players: state.players.map((player) =>
      player.id === 'player-1' && player.champion
        ? { ...player, health: 13, champion: { ...player.champion, health: 13 } }
        : player,
    ),
  };
  const result = useChampionAbility(damaged, 'player-1');
  assert.equal(result.success, true);
  const token = findDirectDeployedChampion(result.state, 'player-1');
  assert.ok(token);
  assert.equal(token.currentHealth, 33);
  assert.equal(token.maxHealth, 33);
});

test('구조화 Champion Token 전개는 연결이 없거나 잘못되면 비용을 지불하지 않고 실패한다', () => {
  const champion = linkedChampion({
    championTokenDefinitionId: null,
  });
  const state = startGame(
    createInitialGameState(
      ['test-linked-champion', 'test-champion-no-quest'],
      [TEST_CHAMPION_TOKEN_DEFINITION],
      [champion, TEST_CHAMPIONS[1]!],
    ),
    fixedRandom,
  );
  const result = useChampionAbility(state, 'player-1');
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.errorCode, 'CHAMPION_TOKEN_NOT_CONFIGURED');
  assert.equal(result.state.players[0].currentGold, 1);
  assert.equal(findDirectDeployedChampion(result.state, 'player-1'), null);
});

test('일반 피해로 직접 출전 카드가 RETIRE되면 즉시 패배한다', () => {
  const deployed = deployDirectChampion();
  const weakened = {
    ...deployed,
    players: deployed.players.map((player) =>
      player.id === 'player-1'
        ? {
            ...player,
            board: player.board.map((card) =>
              card?.isDirectDeployedChampion
                ? { ...card, currentHealth: 1 }
                : card,
            ) as typeof player.board,
          }
        : player,
    ),
  };
  const ready = givePlayerTwoAttacker(weakened);
  const attacker = ready.players[1].board[0]!;
  const directChampion = findDirectDeployedChampion(ready, 'player-1')!;
  const result = attack(ready, 'player-2', attacker.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-1',
    cardInstanceId: directChampion.instanceId,
  });

  assert.equal(result.success, true);
  assert.equal(result.state.status, 'FINISHED');
  assert.equal(result.state.loserId, 'player-1');
  assert.equal(result.state.winnerId, 'player-2');
  assert.equal(
    result.state.events.some(
      (event) =>
        event.type === 'CARD_RETIRED' &&
        event.cardInstanceId === directChampion.instanceId,
    ),
    true,
  );
});

test('피로 피해도 직접 출전 카드 체력과 패배 판정을 사용한다', () => {
  const deployed = deployDirectChampion();
  const exhausted = {
    ...deployed,
    players: deployed.players.map((player) =>
      player.id === 'player-1'
        ? {
            ...player,
            deck: [],
            board: player.board.map((card) =>
              card?.isDirectDeployedChampion
                ? { ...card, currentHealth: 1 }
                : card,
            ) as typeof player.board,
          }
        : player,
    ),
  };
  const result = drawCard(exhausted, 'player-1');

  assert.equal(result.status, 'FINISHED');
  assert.equal(result.loserId, 'player-1');
  assert.equal(findDirectDeployedChampion(result, 'player-1'), null);
  assert.equal(
    result.events.some((event) => event.type === 'CARD_RETIRED'),
    true,
  );
});