import assert from 'node:assert/strict';
import test from 'node:test';

import { silenceCard } from './card-status';
import { attack } from './combat';
import { createInitialGameState } from './create-initial-game-state';
import { destroyCard } from './destroy-card';
import { drawCard } from './draw-card';
import { enterField } from './enter-field';
import {
  findDirectDeployedChampion,
  getPlayerSurvivalHealth,
} from './direct-champion';
import { useChampionAbility } from './champion-system';
import { startGame } from './turn-system';
import type { GameState } from '../types/game-state';
import { generateCard } from '../cards/generation';
import type { CardDefinition, CardInstance } from '../cards/types';
import { TEST_CHAMPION_TOKEN_DEFINITION } from '../cards/test-cards';
import { TEST_CHAMPIONS } from '../champions/test-champions';
import type { ChampionDefinition } from '../champions/types';
import { directDeployChampionToken } from './champion-token';
import { MAX_HAND_SIZE } from '../rules/constants';

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

function linkedChampionState(): GameState {
  return startGame(
    createInitialGameState(
      ['test-linked-champion', 'test-champion-no-quest'],
      [TEST_CHAMPION_TOKEN_DEFINITION],
      [linkedChampion(), TEST_CHAMPIONS[1]!],
    ),
    fixedRandom,
  );
}

function withFullBoard(state: GameState, hand: CardInstance[]): GameState {
  const player = state.players[0];
  const board = player.deck.slice(0, 4).map((card, index) => ({
    ...card,
    boardSlot: index as 0 | 1 | 2 | 3,
  })) as [CardInstance, CardInstance, CardInstance, CardInstance];
  return {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === 'player-1'
        ? { ...candidate, deck: candidate.deck.slice(4), hand, board }
        : candidate,
    ),
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
  assert.equal(card.currentCost, 0);
});

test('필드가 가득 찬 Champion Token은 손패로 보존된다', () => {
  const state = linkedChampionState();
  const fullBoard = withFullBoard(state, []);
  const result = directDeployChampionToken(
    fullBoard,
    'player-1',
    'test-linked-champion',
    TEST_CHAMPION_TOKEN_DEFINITION.id,
  );
  const token = result.players[0].hand.at(-1);

  assert.ok(token);
  assert.equal(token.isDirectDeployedChampion, true);
  assert.equal(token.isSilenceImmune, true);
  assert.equal(token.boardSlot, null);
  assert.equal(result.players[0].board.every(Boolean), true);
});

test('필드와 손패가 가득 찬 Champion Token은 덱 맨 위에 보존되고 빈자리가 생기면 뽑힌다', () => {
  const state = linkedChampionState();
  const sourceCard = state.players[0].hand[0]!;
  const fullHand = Array.from({ length: MAX_HAND_SIZE }, (_, index) => ({
    ...sourceCard,
    instanceId: `full-hand-${index}`,
  }));
  const fullBoard = withFullBoard(state, fullHand);
  const stored = directDeployChampionToken(
    fullBoard,
    'player-1',
    'test-linked-champion',
    TEST_CHAMPION_TOKEN_DEFINITION.id,
  );

  const storedToken = stored.players[0].deck[0];
  assert.equal(storedToken?.isDirectDeployedChampion, true);
  const withHandSpace = {
    ...stored,
    players: stored.players.map((player) =>
      player.id === 'player-1' ? { ...player, hand: player.hand.slice(1) } : player,
    ),
  };
  const drawn = drawCard(withHandSpace, 'player-1');

  assert.equal(drawn.players[0].hand.some((card) => card.isDirectDeployedChampion), true);
  assert.equal(drawn.players[0].deck[0]?.isDirectDeployedChampion, false);
});

test('직접 출전 토큰은 Champion 현재 체력을 합산하지 않고 카드 기본 체력으로 전개한다', () => {
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
  assert.equal(findDirectDeployedChampion(result.state, 'player-1')?.currentHealth, 20);
  assert.equal(findDirectDeployedChampion(result.state, 'player-1')?.maxHealth, 20);
  assert.equal(getPlayerSurvivalHealth(result.state, 'player-1'), 20);
  assert.equal(result.state.players[0].health, 7);
  assert.equal(result.state.players[0].champion?.health, 7);
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
  assert.equal(token.currentHealth, 20);
  assert.equal(token.maxHealth, 20);
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

test('일반 피해로 직접 출전 토큰이 RETIRE되어도 플레이어는 패배하지 않는다', () => {
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
  assert.equal(result.state.status, 'IN_PROGRESS');
  assert.equal(result.state.loserId, null);
  assert.equal(result.state.winnerId, null);
  assert.equal(findDirectDeployedChampion(result.state, 'player-1'), null);
  assert.equal(result.state.players[0].graveyard.some((entry) => entry.instanceId === directChampion.instanceId), true);
  assert.equal(
    result.state.events.some(
      (event) =>
        event.type === 'CARD_RETIRED' &&
        event.cardInstanceId === directChampion.instanceId,
    ),
    true,
  );
});

test('피로 피해로 직접 출전 토큰이 RETIRE되어도 플레이어는 패배하지 않는다', () => {
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

  assert.equal(result.status, 'IN_PROGRESS');
  assert.equal(result.loserId, null);
  assert.equal(result.winnerId, null);
  assert.equal(findDirectDeployedChampion(result, 'player-1'), null);
  assert.equal(
    result.events.some((event) => event.type === 'CARD_RETIRED'),
    true,
  );
});

test('효과 피해로 직접 출전 토큰이 RETIRE되어도 플레이어는 패배하지 않는다', () => {
  const deployed = deployDirectChampion();
  const sourceDefinition: CardDefinition = {
    id: 'lethal-effect-source',
    name: 'lethal-effect-source',
    cardType: 'WRESTLER',
    cost: 1,
    attack: 1,
    health: 1,
    rulesText: '',
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [{
      trigger: 'ENTER_FIELD',
      effects: [{
        type: 'STRUCTURED',
        action: 'DAMAGE',
        target: {
          zone: 'BOARD',
          owner: 'ENEMY',
          cardType: 'WRESTLER',
          selection: 'ALL',
          count: 20,
        },
        values: { amount: 99 },
      }],
    }],
  };
  const source = generateCard(sourceDefinition, {
    instanceId: 'lethal-effect-source',
    playerId: 'player-2',
    source: { type: 'PLAYER', playerId: 'player-2' },
    reason: 'TEST',
  }).card;

  const result = enterField(deployed, 'player-2', source, 0);

  assert.equal(result.status, 'IN_PROGRESS');
  assert.equal(result.players[0].health, 20);
  assert.equal(result.players[0].champion?.health, 20);
  assert.equal(findDirectDeployedChampion(result, 'player-1'), null);
  assert.equal(result.players[0].graveyard.some((card) => card.isDirectDeployedChampion), true);
});