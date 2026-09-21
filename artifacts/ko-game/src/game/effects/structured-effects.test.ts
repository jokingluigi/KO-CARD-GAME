import assert from 'node:assert/strict';
import test from 'node:test';

import { generateCard } from '../cards/generation';
import type { CardDefinition, CardInstance } from '../cards/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { drawCard } from '../engine/draw-card';
import { destroyCard } from '../engine/destroy-card';
import { enterField } from '../engine/enter-field';
import { attack } from '../engine/combat';
import { playWrestlerFromHand } from '../engine/play-wrestler';
import { endTurn } from '../engine/turn-system';
import { getDamageModifierBonus, resolveActiveAbility, selectEffectTarget } from './effect-engine';
import type { CardEffect } from './types';

function definition(id: string, effects: CardEffect[], cost = 1): CardDefinition {
  return {
    id,
    name: id,
    cardType: 'WRESTLER',
    cost,
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

test('선택한 선수에게 피해를 준 뒤 체력이 정확히 1이면 자신을 강화한다', () => {
  const source = instance('pandora', [
    structured(
      'DAMAGE',
      {
        zone: 'BOARD',
        owner: 'ENEMY',
        cardType: 'WRESTLER',
        selection: 'PLAYER_CHOICE',
        count: 1,
      },
      {
        amount: 1,
        conditionalBuff: { healthEquals: 1, attack: 2, health: 2 },
      },
    ),
  ]);
  const target = {
    ...instance('pandora-target'),
    boardSlot: 0 as const,
    currentHealth: 2,
    maxHealth: 2,
  };
  const state = createInitialGameState();
  state.players[1].board[0] = target;

  const pending = enterField(state, 'player-1', source, 1);
  assert.ok(pending.targetingState);
  const result = selectEffectTarget(pending, target.instanceId);

  assert.equal(result.players[1].board[0]?.currentHealth, 1);
  assert.equal(result.players[0].board[1]?.currentAttack, 3);
  assert.equal(result.players[0].board[1]?.currentHealth, 3);
  assert.equal(result.players[0].board[1]?.maxHealth, 3);
  assert.equal(result.targetingState, undefined);
});

test('콤보는 마지막으로 공격한 아군의 공격력을 자기 공격력에 더하고 턴 종료에 0으로 설정한다', () => {
  const selfTarget = { zone: 'BOARD' as const, owner: 'SELF' as const, selection: 'SELF' as const, count: 1 };
  const attacker = { ...instance('combo-attacker'), boardSlot: 0 as const, enteredThisTurn: false, currentAttack: 4 };
  const natomato = {
    ...instance('natomato', [
      structured('BUFF', selfTarget, { reference: 'LAST_ATTACKER', referenceStat: 'CURRENT_ATTACK' }),
      structured('SET_STATS', selfTarget, { attack: 0 }),
    ]),
    boardSlot: 1 as const,
    enteredThisTurn: false,
    currentAttack: 1,
    abilities: [
      {
        trigger: 'OTHER_ALLY_ATTACK' as const,
        effects: [structured('BUFF', selfTarget, { reference: 'LAST_ATTACKER', referenceStat: 'CURRENT_ATTACK' })],
      },
      {
        trigger: 'TURN_END' as const,
        effects: [structured('SET_STATS', selfTarget, { attack: 0 })],
      },
    ],
  };
  const defender = { ...instance('combo-defender'), boardSlot: 0 as const, currentAttack: 0, currentHealth: 10, maxHealth: 10 };
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.players[0].board = [attacker, natomato, null, null];
  state.players[1].board = [defender, null, null, null];

  const attacked = attack(state, 'player-1', attacker.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: defender.instanceId,
  });
  assert.equal(attacked.success, true);
  assert.equal(attacked.state.players[0].board[1]?.currentAttack, 5);

  const ended = endTurn(attacked.state, 'player-1');
  assert.equal(ended.success, true);
  assert.equal(ended.state.players[0].board[1]?.currentAttack, 0);
});

test('자신 공격 Trigger는 공격할 때마다 다음 턴 골드 보너스를 누적한다', () => {
  const attacker = {
    ...instance('boardba', [
      structured('ADD_NEXT_TURN_GOLD', undefined, { amount: 1 }),
    ]),
    boardSlot: 0 as const,
    enteredThisTurn: false,
    currentHealth: 3,
    maxHealth: 3,
    keywords: ['MULTI_STRIKE'] as const,
    abilities: [{
      trigger: 'SELF_ATTACK' as const,
      effects: [structured('ADD_NEXT_TURN_GOLD', undefined, { amount: 1 })],
    }],
  };
  const defender = {
    ...instance('boardba-target'),
    boardSlot: 0 as const,
    currentHealth: 10,
    maxHealth: 10,
  };
  const initial = createInitialGameState();
  initial.status = 'IN_PROGRESS';
  initial.activePlayerId = 'player-1';
  initial.players[0].board = [attacker, null, null, null];
  initial.players[1].board = [defender, null, null, null];

  const first = attack(initial, 'player-1', attacker.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: defender.instanceId,
  });
  assert.equal(first.success, true);
  assert.equal(first.state.players[0].nextTurnGoldBonus, 1);

  const second = attack(first.state, 'player-1', attacker.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: defender.instanceId,
  });
  assert.equal(second.success, true);
  assert.equal(second.state.players[0].nextTurnGoldBonus, 2);

  const opponentTurn = endTurn(second.state, 'player-1');
  assert.equal(opponentTurn.success, true);
  assert.equal(opponentTurn.state.players[0].nextTurnGoldBonus, 2);
  const nextOwnTurn = endTurn(opponentTurn.state, 'player-2');
  assert.equal(nextOwnTurn.success, true);
  assert.equal(nextOwnTurn.state.players[0].currentGold, 3);
  assert.equal(nextOwnTurn.state.players[0].nextTurnGoldBonus, 0);
});

test('자신 공격 Trigger는 다른 아군이나 상대 카드의 공격에는 발동하지 않는다', () => {
  const boardba = {
    ...instance('boardba-listener'),
    boardSlot: 1 as const,
    enteredThisTurn: false,
    currentHealth: 3,
    maxHealth: 3,
    abilities: [{
      trigger: 'SELF_ATTACK' as const,
      effects: [structured('ADD_NEXT_TURN_GOLD', undefined, { amount: 1 })],
    }],
  };
  const ally = {
    ...instance('other-ally'),
    boardSlot: 0 as const,
    enteredThisTurn: false,
    currentHealth: 3,
    maxHealth: 3,
  };
  const enemy = {
    ...instance('enemy-attacker'),
    playerId: 'player-2',
    boardSlot: 0 as const,
    enteredThisTurn: false,
    currentHealth: 3,
    maxHealth: 3,
  };

  const allyState = createInitialGameState();
  allyState.status = 'IN_PROGRESS';
  allyState.activePlayerId = 'player-1';
  allyState.players[0].board = [ally, boardba, null, null];
  allyState.players[1].board[0] = {
    ...instance('ally-target'),
    playerId: 'player-2',
    boardSlot: 0,
    currentHealth: 10,
    maxHealth: 10,
  };
  const allyAttack = attack(allyState, 'player-1', ally.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: allyState.players[1].board[0]!.instanceId,
  });
  assert.equal(allyAttack.success, true);
  assert.equal(allyAttack.state.players[0].nextTurnGoldBonus, 0);

  const enemyState = createInitialGameState();
  enemyState.status = 'IN_PROGRESS';
  enemyState.activePlayerId = 'player-2';
  enemyState.players[0].board[1] = boardba;
  enemyState.players[1].board[0] = enemy;
  const enemyAttack = attack(enemyState, 'player-2', enemy.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-1',
    cardInstanceId: boardba.instanceId,
  });
  assert.equal(enemyAttack.success, true);
  assert.equal(enemyAttack.state.players[0].nextTurnGoldBonus, 0);
});

test('예약된 체력 강화는 턴이 넘어가도 다음 손패 선수에게 한 번만 적용된다', () => {
  const source = instance('cleanup-source', [
    structured('QUEUE_EFFECT', undefined, {
      queuedTrigger: 'NEXT_ALLY_WRESTLER_PLAYED',
      queuedEffect: {
        action: 'BUFF',
        target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
        values: { attack: 0, health: 2 },
      },
    }),
  ]);
  const nextCard = { ...instance('cleanup-target'), currentCost: 0 };
  const initial = createInitialGameState();
  initial.status = 'IN_PROGRESS';
  initial.activePlayerId = 'player-1';
  initial.players[0].currentGold = 1;

  const queued = enterField(initial, 'player-1', source, 0);
  assert.equal(queued.pendingCardEffects.length, 1);

  const nextTurn = endTurn(queued, 'player-1');
  assert.equal(nextTurn.success, true);
  assert.equal(nextTurn.state.pendingCardEffects.length, 1);
  const samePlayerTurn = endTurn(nextTurn.state, 'player-2');
  assert.equal(samePlayerTurn.success, true);
  assert.equal(samePlayerTurn.state.activePlayerId, 'player-1');

  const withHand = {
    ...samePlayerTurn.state,
    players: samePlayerTurn.state.players.map((player) =>
      player.id === 'player-1'
        ? { ...player, currentGold: 1, hand: [nextCard] }
        : player,
    ),
  };
  const played = playWrestlerFromHand(withHand, 'player-1', nextCard.instanceId, 1);
  assert.equal(played.success, true);
  assert.equal(played.state.players[0].board[1]?.currentHealth, 3);
  assert.equal(played.state.players[0].board[1]?.maxHealth, 3);
  assert.equal(played.state.pendingCardEffects.length, 0);
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

test('액티브로 현재 공격력과 체력을 서로 교환한다', () => {
  const source = {
    ...instance('active-stat-swap', [
      structured(
        'SWAP_STATS',
        { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
      ),
    ]),
    currentAttack: 3,
    currentHealth: 7,
    maxHealth: 9,
  };
  const entered = enterField(createInitialGameState(), 'player-1', source, 0);
  const boardCard = entered.players[0].board[0];
  assert.ok(boardCard);

  const result = resolveActiveAbility(entered, 'player-1', boardCard);
  assert.equal(result.players[0].board[0]?.currentAttack, 7);
  assert.equal(result.players[0].board[0]?.currentHealth, 3);
  assert.equal(result.players[0].board[0]?.maxHealth, 9);
});

test('등장 시 자신의 양옆 빈 슬롯에 표준 무작위 선수를 각각 소환한다', () => {
  const source = instance('adjacent-summon-source', [
    structured('SUMMON', {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'ADJACENT_EMPTY_SLOTS',
      count: 2,
      randomScope: 'STANDARD',
      filter: { minCost: 3 },
    }),
  ]);
  const state = createInitialGameState();
  state.randomSeed = 11;
  state.cardPool = [
    definition('adjacent-low', [], 2),
    definition('adjacent-a', [], 3),
    definition('adjacent-b', [], 4),
  ];

  const result = enterField(state, 'player-1', source, 1);
  assert.equal(result.players[0].board[0]?.isGenerated, true);
  assert.equal(result.players[0].board[2]?.isGenerated, true);
  assert.ok((result.players[0].board[0]?.baseCost ?? 0) >= 3);
  assert.ok((result.players[0].board[2]?.baseCost ?? 0) >= 3);
  assert.equal(result.players[0].board[3], null);
});

test('인접 무작위 소환 결과를 같은 resolution에서 모두 참조해 도발을 부여한다', () => {
  const source = instance('adjacent-taunt-source', [
    structured('SUMMON', {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'ADJACENT_EMPTY_SLOTS',
      count: 2,
      randomScope: 'STANDARD',
    }),
    structured('ADD_KEYWORD', {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'SAME_TARGET',
      count: 2,
    }, { keyword: 'TAUNT' }),
  ]);
  const state = createInitialGameState();
  state.randomSeed = 21;
  state.cardPool = [
    definition('pool-wrestler-a', []),
    definition('pool-wrestler-b', []),
    { ...definition('pool-technique', []), cardType: 'TECHNIQUE' },
  ];

  const result = enterField(state, 'player-1', source, 1);
  const left = result.players[0].board[0];
  const right = result.players[0].board[2];
  assert.ok(left);
  assert.ok(right);
  assert.equal(left?.isGenerated, true);
  assert.equal(right?.isGenerated, true);
  assert.equal(left?.keywords.includes('TAUNT'), true);
  assert.equal(right?.keywords.includes('TAUNT'), true);
  assert.equal(result.players[0].board[1]?.instanceId, source.instanceId);
  assert.equal(result.players[0].board.filter(Boolean).length, 3);
  assert.equal(result.events.filter((event) => event.type === 'CARD_GENERATED').length, 2);
});

test('인접 슬롯마다 독립적으로 무작위 선택해 같은 definition도 허용한다', () => {
  const source = instance('duplicate-random-source', [
    structured('SUMMON', {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'ADJACENT_EMPTY_SLOTS',
      count: 2,
      randomScope: 'STANDARD',
    }),
  ]);
  const state = createInitialGameState();
  state.cardPool = [definition('only-wrestler', [])];
  const result = enterField(state, 'player-1', source, 1);
  assert.equal(result.players[0].board[0]?.definitionId, 'only-wrestler');
  assert.equal(result.players[0].board[2]?.definitionId, 'only-wrestler');
});

test('한쪽 인접 슬롯만 비었으면 그쪽만 소환하고 결과도 한 장만 참조한다', () => {
  const source = instance('one-side-source', [
    structured('SUMMON', {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'ADJACENT_EMPTY_SLOTS',
      count: 2,
      randomScope: 'STANDARD',
    }),
    structured('ADD_KEYWORD', {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'SAME_TARGET',
      count: 2,
    }, { keyword: 'TAUNT' }),
  ]);
  const state = createInitialGameState();
  state.cardPool = [definition('one-side-wrestler', [])];
  state.players[0].board[2] = { ...instance('right-blocker'), boardSlot: 2 };
  const result = enterField(state, 'player-1', source, 1);
  assert.equal(result.players[0].board[0]?.definitionId, 'one-side-wrestler');
  assert.equal(result.players[0].board[0]?.keywords.includes('TAUNT'), true);
  assert.equal(result.players[0].board[2]?.instanceId, 'right-blocker-instance');
  assert.equal(result.players[0].board.filter(Boolean).length, 3);
});

test('양쪽 인접 슬롯이 차 있으면 소환과 후속 키워드 부여를 안전하게 건너뛴다', () => {
  const source = instance('full-adjacent-source', [
    structured('SUMMON', {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'ADJACENT_EMPTY_SLOTS',
      count: 2,
      randomScope: 'STANDARD',
    }),
    structured('ADD_KEYWORD', {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'SAME_TARGET',
      count: 2,
    }, { keyword: 'TAUNT' }),
  ]);
  const state = createInitialGameState();
  state.cardPool = [definition('unused-wrestler', [])];
  state.players[0].board[0] = { ...instance('left-blocker'), boardSlot: 0 };
  state.players[0].board[2] = { ...instance('right-blocker'), boardSlot: 2 };
  const result = enterField(state, 'player-1', source, 1);
  assert.equal(result.players[0].board[0]?.instanceId, 'left-blocker-instance');
  assert.equal(result.players[0].board[2]?.instanceId, 'right-blocker-instance');
  assert.equal(result.events.some((event) => event.type === 'CARD_GENERATED'), false);
  assert.equal(result.targetingState, undefined);
});

test('보드 가장자리에서는 존재하는 한쪽 인접 슬롯만 검사한다', () => {
  const source = instance('edge-source', [
    structured('SUMMON', {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'ADJACENT_EMPTY_SLOTS',
      count: 2,
      randomScope: 'STANDARD',
    }),
  ]);
  const state = createInitialGameState();
  state.cardPool = [definition('edge-wrestler', [])];
  const result = enterField(state, 'player-1', source, 0);
  assert.equal(result.players[0].board[0]?.instanceId, source.instanceId);
  assert.equal(result.players[0].board[1]?.definitionId, 'edge-wrestler');
  assert.equal(result.players[0].board.filter(Boolean).length, 2);
});

test('무작위 선수 풀은 기술 카드를 제외하고 같은 seed에서 같은 결과를 낸다', () => {
  const run = (seed: number) => {
    const source = instance('deterministic-source', [
      structured('SUMMON', {
        zone: 'BOARD',
        owner: 'SELF',
        cardType: 'WRESTLER',
        selection: 'ADJACENT_EMPTY_SLOTS',
        count: 2,
        randomScope: 'STANDARD',
      }),
    ]);
    const state = createInitialGameState();
    state.randomSeed = seed;
    state.cardPool = [
      definition('deterministic-a', []),
      definition('deterministic-b', []),
      { ...definition('deterministic-technique', []), cardType: 'TECHNIQUE' },
    ];
    const result = enterField(state, 'player-1', source, 1);
    return [result.players[0].board[0]?.definitionId, result.players[0].board[2]?.definitionId];
  };
  assert.deepEqual(run(77), run(77));
  assert.equal(run(77).every((id) => id !== 'deterministic-technique'), true);
});

test('무작위 소환은 소환된 카드 자신의 ENTER_FIELD 효과를 재발동하지 않는다', () => {
  const summonedDefinition = {
    ...definition('no-enter-trigger', [
      structured('BUFF', { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 }, { attack: 5, health: 5 }),
    ]),
  };
  const source = instance('no-enter-source', [
    structured('SUMMON', {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection: 'ADJACENT_EMPTY_SLOTS',
      count: 1,
      randomScope: 'STANDARD',
    }),
  ]);
  const state = createInitialGameState();
  state.cardPool = [summonedDefinition];
  const result = enterField(state, 'player-1', source, 1);
  assert.equal(result.players[0].board[0]?.currentAttack, 1);
  assert.equal(result.players[0].board[0]?.currentHealth, 1);
});

test('필드에 있는 카드가 생성 카드의 전투 피해를 보정하고 퇴장하면 만료된다', () => {
  const aura = instance('generated-damage-aura', [
    structured('ADD_DAMAGE_MODIFIER', undefined, { amount: 1, damageSource: 'GENERATED' }),
  ]);
  const generatedAttacker = { ...instance('generated-attacker'), isGenerated: true, currentAttack: 2, enteredThisTurn: false };
  const defender = { ...instance('damage-defender'), currentHealth: 5, maxHealth: 5, boardSlot: 0 as const };
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  const withAura = enterField(state, 'player-1', aura, 1);
  withAura.players[0].board[0] = { ...generatedAttacker, boardSlot: 0 };
  withAura.players[1].board[0] = defender;

  assert.equal(getDamageModifierBonus(withAura, 'player-1', generatedAttacker), 1);
  const attacked = attack(withAura, 'player-1', generatedAttacker.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: defender.instanceId,
  });
  assert.equal(attacked.state.players[1].board[0]?.currentHealth, 2);
  const defenderDamage = attacked.state.events
    .filter((event) =>
      event.type === 'DAMAGE_DEALT' &&
      event.source?.type === 'CARD' &&
      event.source.cardInstanceId === generatedAttacker.instanceId &&
      event.target?.type === 'CARD' &&
      event.target.cardInstanceId === defender.instanceId,
    )
    .at(-1);
  assert.equal(defenderDamage?.type, 'DAMAGE_DEALT');
  assert.equal((defenderDamage as { amount?: number }).amount, 3);

  const removed = destroyCard(withAura, 'player-1', aura.instanceId);
  assert.equal(removed.success, true);
  assert.equal(getDamageModifierBonus(removed.state, 'player-1', generatedAttacker), 0);
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

test('명시적 CardDefinition ID SUMMON/GENERATE는 cardPool에서만 resolve하고 직접 전개 보호를 주지 않는다', () => {
  const championToken = {
    ...definition('champion-token-id', []),
    name: 'Champion Token',
    isToken: true,
    isChampionToken: true,
  };
  const summonSource = instance('explicit-summon-source', [
    structured('SUMMON', undefined, { definitionRef: { id: championToken.id }, count: 2 }),
  ]);
  const summoned = enterField(
    { ...createInitialGameState(), cardPool: [championToken] },
    'player-1',
    summonSource,
    0,
  );
  const summonedCards = summoned.players[0].board.filter((card) => card?.definitionId === championToken.id);
  assert.equal(summonedCards.length, 2);
  assert.equal(summonedCards.every((card) => !card?.isDirectDeployedChampion && !card?.isSilenceImmune), true);

  const generateSource = instance('explicit-generate-source', [
    structured('GENERATE', undefined, { definitionRef: { id: championToken.id }, destination: 'DECK', count: 2 }),
  ]);
  const generated = enterField(
    { ...createInitialGameState(), cardPool: [championToken] },
    'player-1',
    generateSource,
    0,
  );
  assert.equal(generated.players[0].deck.filter((card) => card.definitionId === championToken.id).length, 2);
  assert.equal(generated.players[0].hand.some((card) => card.definitionId === championToken.id), false);
  assert.equal(generated.players[0].deck.find((card) => card.definitionId === championToken.id)?.isDirectDeployedChampion, false);

  assert.throws(() => enterField(
    { ...createInitialGameState(), cardPool: [championToken] },
    'player-1',
    instance('legacy-name-source', [structured('SUMMON', undefined, { definitionRef: { name: championToken.name } })]),
    0,
  ));
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
  assert.equal(result.players[1].graveyard.some((entry) => entry.instanceId === target.instanceId), false);
  assert.ok(result.events.some((event) => event.type === 'CARD_DESTROYED'));
});

test('자신이 선택해 파괴한 선수의 현재 공격력을 토큰 자신에게 더한다', () => {
  const targetConfig = {
    zone: 'BOARD' as const,
    owner: 'SELF' as const,
    cardType: 'WRESTLER' as const,
    selection: 'PLAYER_CHOICE' as const,
    count: 1,
  };
  const source = instance('aggregate-destroy-source', [
    structured('SILENCE', targetConfig),
    structured('DESTROY', { ...targetConfig, selection: 'SAME_TARGET' }),
    structured('ADD_AGGREGATED_ATTACK', {
      zone: 'BOARD',
      owner: 'SELF',
      selection: 'SELF',
      count: 1,
    }, {
      aggregateStats: {
        source: 'LAST_DESTROYED_TARGETS',
        attack: 'CURRENT_ATTACK_SUM',
        health: 'CURRENT_HEALTH_SUM',
      },
    }),
  ]);
  const target = { ...instance('aggregate-destroy-target'), currentAttack: 4, boardSlot: 1 as const };
  const state = createInitialGameState();
  state.players[0].board[1] = target;

  const pending = enterField(state, 'player-1', source, 0);
  const result = selectEffectTarget(pending, target.instanceId);

  assert.equal(result.players[0].board[1], null);
  assert.equal(result.players[0].graveyard.some((entry) => entry.instanceId === target.instanceId), false);
  assert.equal(result.players[0].board[0]?.currentAttack, 2);
  assert.equal(result.targetingState, undefined);
});

test('리타이어된 선수도 같은 공격력 합산 경로를 사용한다', () => {
  const targetConfig = {
    zone: 'BOARD' as const,
    owner: 'SELF' as const,
    cardType: 'WRESTLER' as const,
    selection: 'PLAYER_CHOICE' as const,
    count: 1,
  };
  const source = instance('aggregate-retire-source', [
    structured('DAMAGE', targetConfig, { amount: 1 }),
    structured('ADD_AGGREGATED_ATTACK', {
      zone: 'BOARD',
      owner: 'SELF',
      selection: 'SELF',
      count: 1,
    }, {
      aggregateStats: {
        source: 'LAST_DESTROYED_TARGETS',
        attack: 'CURRENT_ATTACK_SUM',
        health: 'CURRENT_HEALTH_SUM',
      },
    }),
  ]);
  const target = { ...instance('aggregate-retire-target'), currentAttack: 3, currentHealth: 1, boardSlot: 1 as const };
  const state = createInitialGameState();
  state.players[0].board[1] = target;

  const result = selectEffectTarget(enterField(state, 'player-1', source, 0), target.instanceId);

  assert.equal(result.players[0].board[1], null);
  assert.equal(result.players[0].board[0]?.currentAttack, 4);
  assert.ok(result.events.some((event) => event.type === 'CARD_RETIRED'));
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

test('generic stat 변경은 비용·공격력·체력과 STAT_CHANGED history를 함께 기록한다', () => {
  const selfTarget = { zone: 'BOARD' as const, owner: 'SELF' as const, selection: 'SELF' as const, count: 1 };
  const source = {
    ...instance('generic-stat-source', [
      structured('MODIFY_STAT', selfTarget, { stat: 'COST', amount: -1 }),
      structured('MODIFY_STAT', selfTarget, { stat: 'ATTACK', amount: 2 }),
      structured('MODIFY_STAT', selfTarget, { stat: 'HEALTH', amount: 2 }),
    ]),
    currentHealth: 3,
    maxHealth: 3,
    baseHealth: 3,
    abilities: [
      {
        trigger: 'ENTER_FIELD' as const,
        effects: [
          structured('MODIFY_STAT', selfTarget, { stat: 'COST', amount: -1 }),
          structured('MODIFY_STAT', selfTarget, { stat: 'ATTACK', amount: 2 }),
          structured('MODIFY_STAT', selfTarget, { stat: 'HEALTH', amount: 2 }),
        ],
      },
      {
        trigger: 'STAT_CHANGED' as const,
        effects: [structured('BUFF', selfTarget, { attack: 1, health: 0 })],
      },
    ],
  };

  const result = enterField(createInitialGameState(), 'player-1', source, 0);
  const changed = result.players[0].board[0]!;
  assert.equal(changed.currentCost, 0);
  assert.equal(changed.currentAttack, 4);
  assert.equal(changed.currentHealth, 5);
  assert.equal(changed.maxHealth, 5);
  assert.ok(result.events.some((event) => event.type === 'STAT_CHANGED' && event.stat === 'cost' && event.delta === -1));
  assert.ok(result.events.some((event) => event.type === 'STAT_CHANGED' && event.stat === 'attack' && event.delta === 2));
  assert.ok(changed.statHistory?.some((entry) => entry.stat === 'attack' && entry.delta === 1));
});

test('generic stat duration은 이번 턴 종료 시 원래 수치로 되돌아간다', () => {
  const selfTarget = { zone: 'BOARD' as const, owner: 'SELF' as const, selection: 'SELF' as const, count: 1 };
  const source = {
    ...instance('temporary-stat-source', [
    structured('MODIFY_STAT', selfTarget, { stat: 'COST', amount: 1, duration: 'THIS_TURN' }),
    structured('MODIFY_STAT', selfTarget, { stat: 'ATTACK', amount: 2, duration: 'THIS_TURN' }),
    structured('MODIFY_STAT', selfTarget, { stat: 'HEALTH', amount: 2, duration: 'THIS_TURN' }),
    ]),
    currentHealth: 3,
    maxHealth: 3,
    baseHealth: 3,
  };

  const initial = createInitialGameState();
  initial.status = 'IN_PROGRESS';
  initial.activePlayerId = 'player-1';
  const entered = enterField(initial, 'player-1', source, 0);
  assert.equal(entered.players[0].board[0]?.currentCost, 2);
  assert.equal(entered.players[0].board[0]?.currentAttack, 3);
  assert.equal(entered.players[0].board[0]?.currentHealth, 5);

  const ended = endTurn(entered, 'player-1');
  assert.equal(ended.success, true);
  assert.equal(ended.state.players[0].board[0]?.currentCost, 1);
  assert.equal(ended.state.players[0].board[0]?.currentAttack, 1);
  assert.equal(ended.state.players[0].board[0]?.currentHealth, 3);
  assert.equal(ended.state.players[0].board[0]?.maxHealth, 3);
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

test('생성 상태는 DESTROY되어도 묘지로 이동하지 않는다', () => {
  const generated = { ...instance('generated-graveyard-target'), boardSlot: 0 as const };
  const state = createInitialGameState();
  state.players[0].board[0] = generated;

  const result = destroyCard(state, 'player-1', generated.instanceId);
  assert.equal(result.success, true);
  assert.equal(result.state.players[0].board[0], null);
  assert.equal(result.state.players[0].graveyard.some((entry) => entry.instanceId === generated.instanceId), false);
});

test('기존 덱 인스턴스와 새 생성 인스턴스를 구분한다', () => {
  const state = createInitialGameState();
  assert.equal(state.players[0].deck.every((card) => !card.isGenerated), true);
  assert.equal(instance('new-generated').isGenerated, true);
});