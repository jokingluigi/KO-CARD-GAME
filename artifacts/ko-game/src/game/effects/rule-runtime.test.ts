import assert from 'node:assert/strict';
import test from 'node:test';

import { generateCard } from '../cards/generation';
import type { CardAbility, CardDefinition, CardEffect } from './types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { attack } from '../engine/combat';
import { enterField } from '../engine/enter-field';
import {
  applyEffect,
  resolveDueDelayedEffects,
  resolveRegisteredRuleListeners,
} from './effect-engine';

function card(
  id: string,
  abilities: CardAbility[] = [],
  overrides: Partial<CardDefinition> = {},
) {
  const definition: CardDefinition = {
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
    abilities,
    ...overrides,
  };
  return generateCard(definition, {
    instanceId: `${id}-instance`,
    playerId: 'player-1',
    source: { type: 'PLAYER', playerId: 'player-1' },
    reason: 'TEST',
  }).card;
}

function structured(
  action: Extract<CardEffect, { type: 'STRUCTURED' }>['action'],
  values?: Extract<CardEffect, { type: 'STRUCTURED' }>['values'],
): CardEffect {
  return { type: 'STRUCTURED', action, values };
}

test('delayed rules execute at the bounded schedule and remain serializable', () => {
  const source = card('delayed-source', [{
    trigger: 'ENTER_FIELD',
    effects: [structured('REGISTER_DELAYED', {
      delayed: {
        kind: 'END_OF_CURRENT_TURN',
        effect: {
          action: 'BUFF',
          target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
          values: { attack: 1, health: 1 },
        },
      },
    }) as Extract<CardEffect, { type: 'STRUCTURED' }>],
  }]);
  const entered = enterField(createInitialGameState(), 'player-1', source, 0);
  assert.equal(entered.pendingDelayedEffects.length, 1);
  assert.equal(typeof JSON.stringify(entered.pendingDelayedEffects), 'string');
  const resolved = resolveDueDelayedEffects(entered, 'TURN_END', 'player-1');
  assert.equal(resolved.pendingDelayedEffects.length, 0);
  assert.equal(resolved.players[0].board[0]?.currentAttack, 2);
  assert.equal(resolved.players[0].board[0]?.currentHealth, 2);
});

test('generic listeners skip the event that registered them and fire on the next match', () => {
  const source = { ...card('listener-source'), boardSlot: 0 as const };
  const target = { ...card('listener-target'), boardSlot: 1 as const };
  let state = createInitialGameState();
  state.players[0].board[0] = source;
  state.players[0].board[1] = target;
  state.events = [{} as never];
  state = applyEffect(state, 'player-1', source, structured('REGISTER_LISTENER', {
    listener: {
      trigger: 'CARD_PLAYED',
      owner: 'SELF',
      cardType: 'WRESTLER',
      uses: 1,
      effect: {
        action: 'BUFF',
        target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
        values: { attack: 1 },
      },
    },
  }));
  assert.equal(state.pendingRuleListeners.length, 1);
  const afterRegistrationEvent = resolveRegisteredRuleListeners(
    state,
    'CARD_PLAYED',
    'player-1',
    source.instanceId,
    'WRESTLER',
  );
  assert.equal(afterRegistrationEvent.players[0].board[0]?.currentAttack, 1);
  const afterNextEvent = resolveRegisteredRuleListeners(
    { ...afterRegistrationEvent, events: [...afterRegistrationEvent.events, {} as never] },
    'CARD_PLAYED',
    'player-1',
    target.instanceId,
    'WRESTLER',
  );
  assert.equal(afterNextEvent.pendingRuleListeners.length, 0);
  assert.equal(afterNextEvent.players[0].board[1]?.currentAttack, 2);
});

test('before-damage replacement prevents lethal combat damage without leaving the card', () => {
  const attacker = { ...card('attacker', [], { attack: 2, health: 2 }), boardSlot: 0 as const, enteredThisTurn: false };
  const defender = {
    ...card('damage-shield', [{
      trigger: 'BEFORE_DAMAGE',
      effects: [structured('PREVENT_DAMAGE', { prevention: { uses: 1 } }) as Extract<CardEffect, { type: 'STRUCTURED' }>],
    }], { health: 1 }),
    boardSlot: 0 as const,
  };
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.turn = 1;
  state.players[0].board[0] = attacker;
  state.players[1].board[0] = defender;
  const result = attack(state, 'player-1', attacker.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: defender.instanceId,
  });
  assert.equal(result.success, true);
  assert.equal(result.state.players[1].board[0]?.instanceId, defender.instanceId);
  assert.equal(result.state.players[1].board[0]?.currentHealth, 1);
});

test('before-retire replacement changes lethal state to one health', () => {
  const attacker = { ...card('attacker-retire', [], { attack: 2, health: 2 }), boardSlot: 0 as const, enteredThisTurn: false };
  const defender = {
    ...card('retire-shield', [{
      trigger: 'BEFORE_RETIRE',
      effects: [structured('PREVENT_RETIRE', { prevention: { uses: 1, setHealth: 1 } }) as Extract<CardEffect, { type: 'STRUCTURED' }>],
    }], { health: 1 }),
    boardSlot: 0 as const,
  };
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.turn = 1;
  state.players[0].board[0] = attacker;
  state.players[1].board[0] = defender;
  const result = attack(state, 'player-1', attacker.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: defender.instanceId,
  });
  assert.equal(result.success, true);
  assert.equal(result.state.players[1].board[0]?.instanceId, defender.instanceId);
  assert.equal(result.state.players[1].board[0]?.currentHealth, 1);
  assert.equal(result.state.players[1].graveyard.some((entry) => entry.instanceId === defender.instanceId), false);
});

test('card-effect damage uses the same prevention and replacement pipeline as combat', () => {
  const source = card('effect-source');
  const defender = {
    ...card('effect-target', [{
      trigger: 'BEFORE_DAMAGE',
      effects: [structured('PREVENT_DAMAGE', { prevention: { uses: 1 } }) as Extract<CardEffect, { type: 'STRUCTURED' }>],
    }], { health: 1 }),
    boardSlot: 0 as const,
  };
  const state = createInitialGameState();
  state.players[1].board[0] = defender;
  const result = applyEffect(state, 'player-1', source, {
    type: 'STRUCTURED',
    action: 'DAMAGE',
    target: { zone: 'BOARD', owner: 'ENEMY', selection: 'SELF', count: 1 },
    values: { amount: 2 },
  });
  assert.equal(result.players[1].board[0]?.instanceId, defender.instanceId);
  assert.equal(result.players[1].board[0]?.currentHealth, 1);
});