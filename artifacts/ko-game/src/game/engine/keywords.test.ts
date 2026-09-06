import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActionResult } from '../actions/types';
import { generateCardInstance } from '../cards/generation';
import { KEYWORD_TEST_CARD_DEFINITIONS } from '../cards/test-cards';
import type { CardDefinition, CardInstance } from '../cards/types';
import { getActiveAbility } from '../effects/effect-engine';
import type { CardKeyword } from '../effects/types';
import type { GameState } from '../types/game-state';
import { silenceCard, setCardStunned, useActiveAbility } from './card-status';
import { attack } from './combat';
import { createInitialGameState } from './create-initial-game-state';
import { enterField } from './enter-field';
import { startGame } from './turn-system';

const fixedRandom = () => 0.5;

function definition(id: string) {
  const card = KEYWORD_TEST_CARD_DEFINITIONS.find(
    (candidate) => candidate.id === id,
  );
  assert.ok(card);
  return card;
}

function card(
  id: string,
  options: {
    definition?: CardDefinition;
    keywords?: CardKeyword[];
    enteredThisTurn?: boolean;
    attack?: number;
    health?: number;
  } = {},
): CardInstance {
  const cardDefinition =
    options.definition ?? definition('test-rush');
  return {
    ...generateCardInstance(cardDefinition, { instanceId: id }),
    keywords: options.keywords ?? [...cardDefinition.keywords],
    enteredThisTurn: options.enteredThisTurn ?? false,
    currentAttack: options.attack ?? cardDefinition.attack,
    currentHealth: options.health ?? cardDefinition.health,
    maxHealth: options.health ?? cardDefinition.health,
  };
}

function combatState(
  playerOneCards: CardInstance[],
  playerTwoCards: CardInstance[] = [],
): GameState {
  const started = startGame(createInitialGameState(), fixedRandom);
  return {
    ...started,
    players: started.players.map((player) => ({
      ...player,
      board: Array.from({ length: 4 }, (_, index) => {
        const candidate =
          player.id === 'player-1'
            ? playerOneCards[index]
            : playerTwoCards[index];
        return candidate
          ? { ...candidate, boardSlot: index as 0 | 1 | 2 | 3 }
          : null;
      }) as typeof player.board,
    })),
  };
}

function successState(result: ActionResult): GameState {
  assert.equal(result.success, true);
  return result.state;
}

test('러쉬는 소환된 턴에 선수와 상대 플레이어를 공격할 수 있다', () => {
  const playerAttack = attack(
    combatState([
      card('rush', { keywords: ['RUSH'], enteredThisTurn: true }),
    ]),
    'player-1',
    'rush',
    { type: 'PLAYER', playerId: 'player-2' },
  );
  assert.equal(playerAttack.success, true);

  const wrestlerAttack = attack(
    combatState(
      [card('rush', { keywords: ['RUSH'], enteredThisTurn: true })],
      [card('target', { keywords: [] })],
    ),
    'player-1',
    'rush',
    {
      type: 'WRESTLER',
      playerId: 'player-2',
      cardInstanceId: 'target',
    },
  );
  assert.equal(wrestlerAttack.success, true);
});

test('기습은 소환된 턴에 선수만 공격할 수 있다', () => {
  const initial = combatState(
    [card('surprise', { keywords: ['SURPRISE'], enteredThisTurn: true })],
    [card('target', { keywords: [] })],
  );
  assert.equal(
    attack(initial, 'player-1', 'surprise', {
      type: 'PLAYER',
      playerId: 'player-2',
    }).success,
    false,
  );
  assert.equal(
    attack(initial, 'player-1', 'surprise', {
      type: 'WRESTLER',
      playerId: 'player-2',
      cardInstanceId: 'target',
    }).success,
    true,
  );
});

test('도발 선수가 있으면 도발 선수만 공격할 수 있다', () => {
  const initial = combatState(
    [card('attacker', { keywords: [] })],
    [
      card('taunt', { keywords: ['TAUNT'] }),
      card('normal', { keywords: [] }),
    ],
  );
  assert.equal(
    attack(initial, 'player-1', 'attacker', {
      type: 'PLAYER',
      playerId: 'player-2',
    }).success,
    false,
  );
  assert.equal(
    attack(initial, 'player-1', 'attacker', {
      type: 'WRESTLER',
      playerId: 'player-2',
      cardInstanceId: 'normal',
    }).success,
    false,
  );
  assert.equal(
    attack(initial, 'player-1', 'attacker', {
      type: 'WRESTLER',
      playerId: 'player-2',
      cardInstanceId: 'taunt',
    }).success,
    true,
  );
});

test('회피는 처음 받는 피해를 무효화한 뒤 사라진다', () => {
  const first = successState(
    attack(
      combatState(
        [
          card('first', { keywords: [], attack: 1 }),
          card('second', { keywords: [], attack: 1 }),
        ],
        [
          {
            ...card('dodge', { keywords: ['DODGE'], health: 3 }),
            dodgeAvailable: true,
          },
        ],
      ),
      'player-1',
      'first',
      {
        type: 'WRESTLER',
        playerId: 'player-2',
        cardInstanceId: 'dodge',
      },
    ),
  );
  assert.equal(first.players[1].board[0]?.currentHealth, 3);
  assert.equal(first.players[1].board[0]?.dodgeAvailable, false);
  const preventedDamage = [...first.events].reverse().find(
    (event) =>
      event.type === 'DAMAGE_DEALT' &&
      event.target?.type === 'CARD' &&
      event.target.cardInstanceId === 'dodge',
  );
  assert.equal(preventedDamage?.amount, 0);

  const second = successState(
    attack(first, 'player-1', 'second', {
      type: 'WRESTLER',
      playerId: 'player-2',
      cardInstanceId: 'dodge',
    }),
  );
  assert.equal(second.players[1].board[0]?.currentHealth, 2);
});

test('기절한 선수는 공격할 수 없다', () => {
  const initial = setCardStunned(
    combatState([card('stunned', { keywords: [] })]),
    'stunned',
    true,
  );
  assert.equal(
    attack(initial, 'player-1', 'stunned', {
      type: 'PLAYER',
      playerId: 'player-2',
    }).success,
    false,
  );
});

test('연타 선수만 한 턴에 두 번 공격할 수 있다', () => {
  const initial = combatState([
    card('multi', { keywords: ['MULTI_STRIKE'] }),
  ]);
  const first = successState(
    attack(initial, 'player-1', 'multi', {
      type: 'PLAYER',
      playerId: 'player-2',
    }),
  );
  const second = successState(
    attack(first, 'player-1', 'multi', {
      type: 'PLAYER',
      playerId: 'player-2',
    }),
  );
  assert.equal(
    attack(second, 'player-1', 'multi', {
      type: 'PLAYER',
      playerId: 'player-2',
    }).success,
    false,
  );
});

test('침묵은 키워드와 능력을 막지만 침묵 면역은 보존한다', () => {
  const abilityCard = card('ability', {
    definition: definition('test-trigger-active'),
    enteredThisTurn: true,
  });
  const rushedAbility = { ...abilityCard, keywords: ['RUSH'] as CardKeyword[] };
  const initial = combatState([rushedAbility]);
  const silenced = silenceCard(initial, 'ability');
  const silencedCard = silenced.players[0].board[0];
  assert.ok(silencedCard);
  assert.equal(getActiveAbility(silencedCard), undefined);
  assert.equal(
    attack(silenced, 'player-1', 'ability', {
      type: 'PLAYER',
      playerId: 'player-2',
    }).success,
    false,
  );

  const immuneState = combatState([
    { ...rushedAbility, isSilenceImmune: true },
  ]);
  assert.equal(
    silenceCard(immuneState, 'ability').players[0].board[0]?.isSilenced,
    false,
  );
});

test('등장과 포지션 효과는 ENTER_FIELD 처리에서 실행된다', () => {
  const started = startGame(createInitialGameState(), fixedRandom);
  const effectCard = card('trigger', {
    definition: definition('test-trigger-active'),
  });
  const state = enterField(started, 'player-1', effectCard, 0);

  assert.equal(state.players[0].currentGold, 2);
  assert.equal(state.players[0].board[0]?.currentAttack, 2);
});

test('퇴장 효과는 지정된 필드 이탈 조건에 반응한다', () => {
  const initial = combatState(
    [card('leaver', {
      definition: definition('test-trigger-active'),
      health: 1,
    })],
    [card('attacker', { keywords: [], attack: 2 })],
  );
  const opponentTurn = {
    ...initial,
    activePlayerId: 'player-2',
  };
  const state = successState(
    attack(opponentTurn, 'player-2', 'attacker', {
      type: 'WRESTLER',
      playerId: 'player-1',
      cardInstanceId: 'leaver',
    }),
  );

  assert.equal(state.players[0].board[0], null);
  assert.equal(state.players[0].currentGold, 2);
});

test('액티브 효과는 직접 실행하며 한 턴에 한 번만 사용할 수 있다', () => {
  const initial = combatState([
    card('active', { definition: definition('test-trigger-active') }),
  ]);
  const used = successState(useActiveAbility(initial, 'player-1', 'active'));

  assert.equal(used.players[0].currentGold, 2);
  assert.equal(used.players[0].board[0]?.activeUsedThisTurn, true);
  assert.equal(
    useActiveAbility(used, 'player-1', 'active').success,
    false,
  );
});