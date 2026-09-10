import assert from 'node:assert/strict';
import test from 'node:test';

import { generateCard } from '../cards/generation';
import type { CardDefinition, CardInstance } from '../cards/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { drawCard } from '../engine/draw-card';
import { destroyCard } from '../engine/destroy-card';
import { enterField } from '../engine/enter-field';
import { selectEffectTarget } from './effect-engine';
import type { CardEffect } from './types';

function definition(id: string, effects: CardEffect[]): CardDefinition {
  return {
    id,
    name: id,
    cardType: 'WRESTLER',
    cost: 1,
    attack: 1,
    health: 1,
    rulesText: '',
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [{ trigger: 'ENTER_FIELD', effects }],
  };
}

function poolCard(
  id: string,
  flags: { isToken?: boolean; isChampionToken?: boolean } = {},
): CardInstance {
  return generateCard({
    ...definition(id, []),
    isToken: flags.isToken ?? false,
    isChampionToken: flags.isChampionToken ?? false,
  }, {
    instanceId: id,
    playerId: 'player-1',
    source: { type: 'PLAYER', playerId: 'player-1' },
    reason: 'TEST_RANDOM_POOL',
  }).card;
}

function instance(id: string, effects: CardEffect[] = []): CardInstance {
  return generateCard(definition(id, effects), {
    instanceId: `${id}-instance`,
    playerId: 'player-1',
    source: { type: 'PLAYER', playerId: 'player-1' },
    reason: 'TEST',
  }).card;
}

function structured(
  action: Extract<CardEffect, { type: 'STRUCTURED' }>['action'],
  target: Extract<CardEffect, { type: 'STRUCTURED' }>['target'],
  values?: Extract<CardEffect, { type: 'STRUCTURED' }>['values'],
): CardEffect {
  return { type: 'STRUCTURED', action, target, values };
}

test('등장 시 자신에게 +2/+2를 부여한다', () => {
  const source = instance('self-buff', [
    structured(
      'BUFF',
      { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
      { attack: 2, health: 2 },
    ),
  ]);
  const result = enterField(createInitialGameState(), 'player-1', source, 0);
  assert.equal(result.players[0].board[0]?.currentAttack, 3);
  assert.equal(result.players[0].board[0]?.currentHealth, 3);
  assert.equal(result.players[0].board[0]?.maxHealth, 3);
});

test('기본 1/1 카드의 현재 공격과 체력을 2배로 변경한다', () => {
  const source = instance('self-multiplier-basic', [
    structured(
      'BUFF',
      { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
      { attackMultiplier: 2, healthMultiplier: 2 },
    ),
  ]);
  const result = enterField(createInitialGameState(), 'player-1', source, 0);
  assert.equal(result.players[0].board[0]?.currentAttack, 2);
  assert.equal(result.players[0].board[0]?.currentHealth, 2);
  assert.equal(result.players[0].board[0]?.maxHealth, 2);
});

test('이미 3/4인 카드의 현재 공격과 체력을 2배로 변경한다', () => {
  const source = {
    ...instance('self-multiplier-buffed', [
      structured(
        'BUFF',
        { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
        { attackMultiplier: 2, healthMultiplier: 2 },
      ),
    ]),
    currentAttack: 3,
    currentHealth: 4,
    maxHealth: 4,
  };
  const result = enterField(createInitialGameState(), 'player-1', source, 0);
  assert.equal(result.players[0].board[0]?.currentAttack, 6);
  assert.equal(result.players[0].board[0]?.currentHealth, 8);
  assert.equal(result.players[0].board[0]?.maxHealth, 8);
});

test('선택한 손패 선수 한 장에게 +1/+1을 부여한다', () => {
  const source = instance('hand-choice-source', [
    structured(
      'BUFF',
      {
        zone: 'HAND',
        owner: 'SELF',
        cardType: 'WRESTLER',
        selection: 'PLAYER_CHOICE',
        count: 1,
      },
      { attack: 1, health: 1 },
    ),
  ]);
  const target = instance('hand-choice-target');
  const state = createInitialGameState();
  state.players[0].hand = [target];

  const pending = enterField(state, 'player-1', source, 0);
  assert.deepEqual(pending.targetingState?.validTargetIds, [target.instanceId]);
  assert.equal(pending.players[0].hand[0]?.currentAttack, 1);
  const result = selectEffectTarget(pending, target.instanceId);
  assert.equal(result.players[0].hand[0]?.currentAttack, 2);
  assert.equal(result.players[0].hand[0]?.currentHealth, 2);
});

test('선택한 적 선수에게 피해를 주고 체력이 소진되면 리타이어시킨다', () => {
  const source = instance('damage-source', [
    structured(
      'DAMAGE',
      {
        zone: 'BOARD',
        owner: 'ENEMY',
        cardType: 'WRESTLER',
        selection: 'PLAYER_CHOICE',
        count: 1,
      },
      { amount: 2 },
    ),
  ]);
  const target = instance('damage-target');
  const state = createInitialGameState();
  state.players[1].board[0] = { ...target, boardSlot: 0 };

  const pending = enterField(state, 'player-1', source, 0);
  assert.equal(pending.players[1].board[0]?.currentHealth, 1);
  const result = selectEffectTarget(pending, target.instanceId);
  assert.equal(result.players[1].board[0], null);
  assert.equal(result.players[1].graveyard.at(-1)?.instanceId, target.instanceId);
  assert.ok(result.events.some((event) => event.type === 'DAMAGE_DEALT'));
  assert.ok(result.events.some((event) => event.type === 'CARD_RETIRED'));
});

test('손패의 무작위 선수 카드 중 최대 3장에게 +1/+1을 부여한다', () => {
  const source = instance('random-hand-source', [
    structured(
      'BUFF',
      {
        zone: 'HAND',
        owner: 'SELF',
        cardType: 'WRESTLER',
        selection: 'RANDOM',
        count: 3,
      },
      { attack: 1, health: 1 },
    ),
  ]);
  const state = createInitialGameState();
  state.players[0].hand = [0, 1, 2, 3].map((index) =>
    instance(`random-target-${index}`),
  );

  const result = enterField(state, 'player-1', source, 0);
  assert.equal(
    result.players[0].hand.filter((card) => card.currentAttack === 2).length,
    3,
  );
});

test('표준 RANDOM은 일반 카드만 선택하고 Token과 Champion Token을 제외한다', () => {
  const source = instance('standard-random-source', [
    structured('BUFF', {
      zone: 'HAND',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'RANDOM',
      count: 3,
      randomScope: 'STANDARD',
    }, { attack: 1, health: 1 }),
  ]);
  const state = createInitialGameState();
  state.randomSeed = 17;
  state.players[0].hand = [
    poolCard('standard-normal'),
    poolCard('standard-token', { isToken: true }),
    poolCard('standard-champion-token', { isToken: true, isChampionToken: true }),
  ];

  const result = enterField(state, 'player-1', source, 0);
  assert.equal(result.players[0].hand[0]?.currentAttack, 2);
  assert.equal(result.players[0].hand[1]?.currentAttack, 1);
  assert.equal(result.players[0].hand[2]?.currentAttack, 1);
});

test('FULL_RANDOM은 일반 카드, Token, Champion Token을 모두 선택 후보로 허용한다', () => {
  const source = instance('full-random-source', [
    structured('BUFF', {
      zone: 'HAND',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'RANDOM',
      count: 3,
      randomScope: 'FULL',
    }, { attack: 1, health: 1 }),
  ]);
  const state = createInitialGameState();
  state.randomSeed = 17;
  state.players[0].hand = [
    poolCard('full-normal'),
    poolCard('full-token', { isToken: true }),
    poolCard('full-champion-token', { isToken: true, isChampionToken: true }),
  ];

  const result = enterField(state, 'player-1', source, 0);
  assert.equal(result.players[0].hand.every((card) => card.currentAttack === 2), true);
  const championToken = result.players[0].hand.find((card) => card.isChampionToken);
  assert.equal(championToken?.isDirectDeployedChampion, false);
  assert.equal(championToken?.isSilenceImmune, false);
});

test('FULL_RANDOM GENERATE로 나온 Champion Token은 직접 전개 보호를 얻지 않는다', () => {
  const source = instance('full-random-generate-source', [
    structured('GENERATE', {
      zones: ['HAND', 'DECK', 'BOARD'],
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'RANDOM',
      count: 3,
      randomScope: 'FULL',
    }),
  ]);
  const state = createInitialGameState();
  state.randomSeed = 29;
  state.cardPool = [
    definition('generated-normal', []),
    { ...definition('generated-token', []), isToken: true },
    { ...definition('generated-champion-token', []), isToken: true, isChampionToken: true },
  ];

  const result = enterField(state, 'player-1', source, 0);
  assert.equal(result.players[0].hand.length, 3);
  const championToken = result.players[0].hand.find((card) => card.isChampionToken);
  assert.ok(championToken);
  assert.equal(championToken.isDirectDeployedChampion, false);
  assert.equal(championToken.isSilenceImmune, false);
});

test('같은 GameState와 Action, Seed의 RANDOM 결과는 deterministic하다', () => {
  const resolve = () => {
    const source = instance('seeded-random-source', [
      structured('BUFF', {
        zone: 'HAND',
        owner: 'SELF',
        cardType: 'WRESTLER',
        selection: 'RANDOM',
        count: 1,
        randomScope: 'FULL',
      }, { attack: 1, health: 1 }),
    ]);
    const state = createInitialGameState();
    state.randomSeed = 12345;
    state.players[0].hand = [
      poolCard('seed-a'),
      poolCard('seed-b', { isToken: true }),
      poolCard('seed-c', { isToken: true, isChampionToken: true }),
    ];
    return enterField(state, 'player-1', source, 0).players[0].hand
      .map((card) => [card.instanceId, card.currentAttack]);
  };

  assert.deepEqual(resolve(), resolve());
});

test('선택한 적 선수를 침묵시킨 뒤 같은 대상을 파괴한다', () => {
  const targetConfig = {
    zone: 'BOARD' as const,
    owner: 'ENEMY' as const,
    cardType: 'WRESTLER' as const,
    selection: 'PLAYER_CHOICE' as const,
    count: 1,
  };
  const source = instance('silence-destroy-source', [
    structured('SILENCE', targetConfig),
    structured('DESTROY', { ...targetConfig, selection: 'SAME_TARGET' }),
  ]);
  const target = instance('silence-destroy-target');
  const state = createInitialGameState();
  state.players[1].board[0] = { ...target, boardSlot: 0 };

  const pending = enterField(state, 'player-1', source, 0);
  assert.ok(pending.targetingState);
  const result = selectEffectTarget(pending, target.instanceId);
  assert.equal(result.players[1].board[0], null);
  assert.equal(result.players[1].graveyard.at(-1)?.isSilenced, true);
  assert.ok(result.events.some((event) => event.type === 'CARD_DESTROYED'));
});

test('구조화 DRAW는 기존 drawCard 규칙과 이벤트를 사용한다', () => {
  const source = instance('draw-source', [
    structured('DRAW', undefined, { amount: 1 }),
  ]);
  const drawTarget = instance('deck-card');
  const state = createInitialGameState();
  state.players[0].deck = [drawTarget];
  const result = enterField(state, 'player-1', source, 0);
  assert.equal(result.players[0].hand.some((card) => card.instanceId === drawTarget.instanceId), true);
  assert.ok(result.events.some((event) => event.type === 'CARD_DRAWN'));
});

test('구조화 키워드 부여는 카드 키워드만 안전하게 변경한다', () => {
  const source = instance('keyword-source', [
    structured('ADD_KEYWORD', { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 }, { keyword: 'RUSH' }),
  ]);
  const result = enterField(createInitialGameState(), 'player-1', source, 0);
  assert.ok(result.players[0].board[0]?.keywords.includes('RUSH'));
});

test('구조화 회피 부여는 첫 효과 피해를 무효화하고 소모한다', () => {
  const source = instance('dodge-source', [
    structured('ADD_KEYWORD', { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 }, { keyword: 'DODGE' }),
    structured('DAMAGE', { zone: 'BOARD', owner: 'ENEMY', selection: 'PLAYER_CHOICE', count: 1 }, { amount: 1 }),
  ]);
  const target = instance('dodge-target');
  const state = createInitialGameState();
  state.players[1].board[0] = { ...target, boardSlot: 0, keywords: ['DODGE'], dodgeAvailable: true };
  const pending = enterField(state, 'player-1', source, 0);
  const result = selectEffectTarget(pending, target.instanceId);
  assert.equal(result.players[1].board[0]?.currentHealth, 1);
  assert.equal(result.players[1].board[0]?.dodgeAvailable, false);
  assert.equal(result.events.at(-1)?.type, 'DAMAGE_DEALT');
});

test('다음 턴 골드, 비용과 기절 구조화 효과를 적용한다', () => {
  const source = instance('status-source', [
    structured('ADD_NEXT_TURN_GOLD', undefined, { amount: 2 }),
    structured('REDUCE_COST', { zone: 'HAND', owner: 'SELF', selection: 'PLAYER_CHOICE', count: 1 }, { amount: 4 }),
    structured('STUN', { zone: 'BOARD', owner: 'ENEMY', selection: 'PLAYER_CHOICE', count: 1 }),
  ]);
  const hand = instance('cost-target');
  const enemy = instance('stun-target');
  const state = createInitialGameState();
  state.players[0].hand = [hand];
  state.players[1].board[0] = { ...enemy, boardSlot: 0 };
  const pending = enterField(state, 'player-1', source, 0);
  const afterHand = selectEffectTarget(pending, hand.instanceId);
  const result = selectEffectTarget(afterHand, enemy.instanceId);
  assert.equal(result.players[0].nextTurnGoldBonus, 2);
  assert.equal(result.players[0].hand[0]?.currentCost, 0);
  assert.equal(result.players[1].board[0]?.isStunned, true);
});

test('생성된 카드만 손패·덱·필드의 공통 범위에서 필터링한다', () => {
  const source = instance('generated-filter-source', [
    structured(
      'BUFF',
      {
        zones: ['HAND', 'DECK', 'BOARD'],
        owner: 'SELF',
        cardType: 'WRESTLER',
        filter: { isGenerated: true },
        selection: 'ALL',
        count: 20,
      },
      { attack: 1, health: 1 },
    ),
  ]);
  const generatedDeck = instance('generated-deck-target');
  const regularDeck = { ...instance('regular-deck-target'), isGenerated: false };
  const generatedHand = instance('generated-hand-target');
  const regularHand = { ...instance('regular-hand-target'), isGenerated: false };
  const generatedBoard = { ...instance('generated-board-target'), boardSlot: 1 as const };
  const regularBoard = { ...instance('regular-board-target'), boardSlot: 2 as const, isGenerated: false };
  const state = createInitialGameState();
  state.players[0].deck = [generatedDeck, regularDeck];
  state.players[0].hand = [generatedHand, regularHand];
  state.players[0].board[1] = generatedBoard;
  state.players[0].board[2] = regularBoard;

  const result = enterField(state, 'player-1', source, 0);
  assert.equal(result.players[0].deck[0]?.currentAttack, 2);
  assert.equal(result.players[0].deck[1]?.currentAttack, 1);
  assert.equal(result.players[0].hand[0]?.currentHealth, 2);
  assert.equal(result.players[0].hand[1]?.currentHealth, 1);
  assert.equal(result.players[0].board[1]?.currentAttack, 2);
  assert.equal(result.players[0].board[2]?.currentAttack, 1);
});

test('생성 상태는 덱에서 손패와 필드로 이동해도 유지한다', () => {
  const generated = instance('generated-move-target');
  const state = createInitialGameState();
  state.players[0].deck = [generated];
  const drawn = drawCard(state, 'player-1');
  assert.equal(drawn.players[0].hand[0]?.isGenerated, true);

  const entered = enterField(drawn, 'player-1', drawn.players[0].hand[0]!, 0);
  assert.equal(entered.players[0].board[0]?.isGenerated, true);
});

test('생성 상태는 필드에서 묘지로 이동해도 유지한다', () => {
  const generated = { ...instance('generated-graveyard-target'), boardSlot: 0 as const };
  const state = createInitialGameState();
  state.players[0].board[0] = generated;

  const result = destroyCard(state, 'player-1', generated.instanceId);
  assert.equal(result.success, true);
  assert.equal(result.state.players[0].board[0], null);
  assert.equal(result.state.players[0].graveyard.at(-1)?.isGenerated, true);
});

test('기존 덱 인스턴스와 새 생성 인스턴스를 구분한다', () => {
  const state = createInitialGameState();
  assert.equal(state.players[0].deck.every((card) => !card.isGenerated), true);
  assert.equal(instance('new-generated').isGenerated, true);
});