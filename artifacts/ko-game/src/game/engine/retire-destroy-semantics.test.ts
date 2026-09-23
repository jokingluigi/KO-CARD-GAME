import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardAbility, CardDefinition, CardEffect, CardInstance } from '../cards/types';
import { grantCardText } from '../cards/granted-text';
import { generateCard } from '../cards/generation';
import { createInitialGameState } from './create-initial-game-state';
import { destroyCard } from './destroy-card';
import { attack } from './combat';
import { silenceCard } from './card-status';
import {
  applyEffect,
  resolveStateBasedDeaths,
} from '../effects/effect-engine';
import type { GameState } from '../types/game-state';

type StructuredEffect = Extract<CardEffect, { type: 'STRUCTURED' }>;
type StructuredTarget = NonNullable<StructuredEffect['target']>;
type StructuredValues = StructuredEffect['values'];

function structured(
  action: StructuredEffect['action'],
  target?: StructuredTarget,
  values?: StructuredValues,
): CardEffect {
  return {
    type: 'STRUCTURED',
    action,
    ...(target ? { target } : {}),
    ...(values ? { values } : {}),
  } as CardEffect;
}

function leaveDrawAbility(): CardAbility {
  return {
    trigger: 'LEAVE_FIELD',
    effects: [structured('DRAW', undefined, { amount: 1 })],
  };
}

function definition(
  id: string,
  abilities: CardAbility[] = [],
  stats: { attack?: number; health?: number } = {},
): CardDefinition {
  return {
    id,
    name: id,
    cardType: 'WRESTLER',
    cost: 1,
    attack: stats.attack ?? 1,
    health: stats.health ?? 1,
    rulesText: '',
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities,
  };
}

function card(
  id: string,
  abilities: CardAbility[] = [],
  stats: { attack?: number; health?: number } = {},
): CardInstance {
  const generated = generateCard(definition(id, abilities, stats), {
    instanceId: id,
    playerId: 'player-1',
    source: { type: 'PLAYER', playerId: 'player-1' },
    reason: 'RETIRE_DESTROY_TEST',
  });
  return generated.card;
}

function stateWithBoard(
  cards: Array<{ playerId: string; card: CardInstance; slot: 0 | 1 | 2 | 3 }>,
): GameState {
  const initial = createInitialGameState();
  return {
    ...initial,
    status: 'IN_PROGRESS',
    activePlayerId: 'player-1',
    turn: 1,
    players: initial.players.map((player) => ({
      ...player,
      board: cards.reduce(
        (board, entry) => entry.playerId === player.id
          ? Object.assign([...board], { [entry.slot]: { ...entry.card, boardSlot: entry.slot } })
          : board,
        [...player.board] as typeof player.board,
      ),
    })),
  };
}

function countEvents(state: GameState, type: 'CARD_RETIRED' | 'CARD_DESTROYED' | 'CARD_REMOVED', cardInstanceId: string) {
  return state.events.filter((event) => event.type === type && event.cardInstanceId === cardInstanceId).length;
}

function drawDeck(state: GameState, playerId: string): GameState {
  return {
    ...state,
    players: state.players.map((player) => player.id === playerId
      ? { ...player, deck: [card(`${playerId}-drawn`)] }
      : player),
  };
}

test('combat lethal retires to graveyard and fires LEAVE_FIELD exactly once', () => {
  const attacker = { ...card('combat-attacker', [], { attack: 2, health: 2 }), boardSlot: 0 as const };
  const defender = { ...card('combat-defender', [leaveDrawAbility()], { health: 1 }), boardSlot: 0 as const };
  const initial = drawDeck(stateWithBoard([
    { playerId: 'player-1', card: attacker, slot: 0 },
    { playerId: 'player-2', card: defender, slot: 0 },
  ]), 'player-2');

  const result = attack(initial, 'player-1', attacker.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: defender.instanceId,
  });

  assert.equal(result.success, true);
  const state = result.state;
  assert.equal(state.players[1].board[0], null);
  assert.equal(state.players[1].graveyard.at(-1)?.instanceId, defender.instanceId);
  assert.equal(state.players[1].hand.length, 1);
  assert.equal(countEvents(state, 'CARD_RETIRED', defender.instanceId), 1);
  assert.equal(countEvents(state, 'CARD_DESTROYED', defender.instanceId), 0);
});

test('effect damage lethal uses the same RETIRE and LEAVE_FIELD semantics', () => {
  const source = card('effect-damage-source');
  const target = card('effect-damage-target', [leaveDrawAbility()], { health: 1 });
  const initial = drawDeck(stateWithBoard([
    { playerId: 'player-1', card: source, slot: 0 },
    { playerId: 'player-2', card: target, slot: 0 },
  ]), 'player-2');

  const state = applyEffect(initial, 'player-1', source, structured('DAMAGE', {
    zone: 'BOARD',
    owner: 'ENEMY',
    cardType: 'WRESTLER',
    selection: 'TOP',
    count: 1,
  }, { amount: 1 }));

  assert.equal(state.players[1].board[0], null);
  assert.equal(state.players[1].graveyard.at(-1)?.instanceId, target.instanceId);
  assert.equal(state.players[1].hand.length, 1);
  assert.equal(countEvents(state, 'CARD_RETIRED', target.instanceId), 1);
});

test('self damage lethal retires the source instead of destroying it', () => {
  const source = card('self-damage-source', [leaveDrawAbility()], { health: 1 });
  const initial = drawDeck(stateWithBoard([
    { playerId: 'player-1', card: source, slot: 0 },
  ]), 'player-1');

  const state = applyEffect(initial, 'player-1', source, structured('DAMAGE', {
    zone: 'BOARD',
    owner: 'SELF',
    selection: 'SELF',
    count: 1,
  }, { amount: 1 }));

  assert.equal(state.players[0].board[0], null);
  assert.equal(state.players[0].graveyard.at(-1)?.instanceId, source.instanceId);
  assert.equal(state.players[0].hand.length, 1);
  assert.equal(countEvents(state, 'CARD_RETIRED', source.instanceId), 1);
  assert.equal(countEvents(state, 'CARD_DESTROYED', source.instanceId), 0);
});

test('direct RETIRE sends the card to graveyard and fires its leave effect once', () => {
  const source = card('retire-source');
  const target = card('direct-retire-target', [leaveDrawAbility()]);
  const initial = drawDeck(stateWithBoard([
    { playerId: 'player-1', card: source, slot: 0 },
    { playerId: 'player-2', card: target, slot: 0 },
  ]), 'player-2');

  const state = applyEffect(initial, 'player-1', source, structured('RETIRE', {
    zone: 'BOARD',
    owner: 'ENEMY',
    selection: 'TOP',
    count: 1,
  }));

  assert.equal(state.players[1].board[0], null);
  assert.equal(state.players[1].graveyard.at(-1)?.instanceId, target.instanceId);
  assert.equal(state.players[1].hand.length, 1);
  assert.equal(countEvents(state, 'CARD_RETIRED', target.instanceId), 1);
});

test('DESTROY removes from the match without graveyard or RETIRE effects', () => {
  const source = card('destroy-source');
  const target = card('destroy-target', [leaveDrawAbility()]);
  const initial = drawDeck(stateWithBoard([
    { playerId: 'player-1', card: source, slot: 0 },
    { playerId: 'player-2', card: target, slot: 0 },
  ]), 'player-2');

  const state = applyEffect(initial, 'player-1', source, structured('DESTROY', {
    zone: 'BOARD',
    owner: 'ENEMY',
    selection: 'TOP',
    count: 1,
  }));

  assert.equal(state.players[1].board[0], null);
  assert.equal(state.players[1].graveyard.some((entry) => entry.instanceId === target.instanceId), false);
  assert.equal(state.players[1].removedFromGame.some((entry) => entry.instanceId === target.instanceId), false);
  assert.equal(state.players[1].hand.length, 0);
  assert.equal(countEvents(state, 'CARD_DESTROYED', target.instanceId), 1);
  assert.equal(countEvents(state, 'CARD_RETIRED', target.instanceId), 0);
});

test('REMOVE_FROM_GAME has no graveyard or RETIRE side effects', () => {
  const source = card('remove-source');
  const target = card('remove-target', [leaveDrawAbility()]);
  const initial = drawDeck(stateWithBoard([
    { playerId: 'player-1', card: source, slot: 0 },
    { playerId: 'player-2', card: target, slot: 0 },
  ]), 'player-2');

  const state = applyEffect(initial, 'player-1', source, structured('REMOVE_FROM_GAME', {
    zone: 'BOARD',
    owner: 'ENEMY',
    selection: 'TOP',
    count: 1,
  }));

  assert.equal(state.players[1].board[0], null);
  assert.equal(state.players[1].graveyard.some((entry) => entry.instanceId === target.instanceId), false);
  assert.equal(state.players[1].removedFromGame.at(-1)?.instanceId, target.instanceId);
  assert.equal(state.players[1].hand.length, 0);
  assert.equal(countEvents(state, 'CARD_REMOVED', target.instanceId), 1);
  assert.equal(countEvents(state, 'CARD_RETIRED', target.instanceId), 0);
});

test('simultaneous combat lethal retires both cards and fires both leave effects', () => {
  const attacker = card('simultaneous-attacker', [leaveDrawAbility()], { attack: 2, health: 1 });
  const defender = card('simultaneous-defender', [leaveDrawAbility()], { attack: 2, health: 1 });
  const initial = drawDeck(drawDeck(stateWithBoard([
    { playerId: 'player-1', card: attacker, slot: 0 },
    { playerId: 'player-2', card: defender, slot: 0 },
  ]), 'player-1'), 'player-2');

  const result = attack(initial, 'player-1', attacker.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: defender.instanceId,
  });

  assert.equal(result.success, true);
  const state = result.state;
  assert.equal(state.players[0].graveyard.at(-1)?.instanceId, attacker.instanceId);
  assert.equal(state.players[1].graveyard.at(-1)?.instanceId, defender.instanceId);
  assert.equal(state.players[0].hand.length, 1);
  assert.equal(state.players[1].hand.length, 1);
  assert.equal(countEvents(state, 'CARD_RETIRED', attacker.instanceId), 1);
  assert.equal(countEvents(state, 'CARD_RETIRED', defender.instanceId), 1);
});

test('SILENCE removes a RETIRE effect before state-based lethal resolution', () => {
  const source = card('silence-source');
  const target = card('silenced-target', [leaveDrawAbility()]);
  let initial = drawDeck(stateWithBoard([
    { playerId: 'player-1', card: source, slot: 0 },
    { playerId: 'player-2', card: target, slot: 0 },
  ]), 'player-2');
  initial = silenceCard(initial, target.instanceId);
  initial = {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-2'
      ? { ...player, board: player.board.map((entry) => entry?.instanceId === target.instanceId ? { ...entry, currentHealth: 0 } : entry) as typeof player.board }
      : player),
  };

  const state = resolveStateBasedDeaths(initial);

  assert.equal(state.players[1].graveyard.at(-1)?.instanceId, target.instanceId);
  assert.equal(state.players[1].hand.length, 0);
  assert.equal(countEvents(state, 'CARD_RETIRED', target.instanceId), 1);
});

test('granted RETIRE text survives lethal resolution but not DESTROY', () => {
  const donor = definition('retire-donor', [leaveDrawAbility()]);
  const vanilla = grantCardText(card('granted-vanilla'), donor);
  const initial = drawDeck(stateWithBoard([
    { playerId: 'player-1', card: vanilla, slot: 0 },
  ]), 'player-1');
  const lethal = {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-1'
      ? { ...player, board: player.board.map((entry) => entry?.instanceId === vanilla.instanceId ? { ...entry, currentHealth: 0 } : entry) as typeof player.board }
      : player),
  };

  const retired = resolveStateBasedDeaths(lethal);
  assert.equal(retired.players[0].graveyard.at(-1)?.instanceId, vanilla.instanceId);
  assert.equal(retired.players[0].hand.length, 1);
  assert.equal(countEvents(retired, 'CARD_RETIRED', vanilla.instanceId), 1);

  const destroyState = drawDeck(stateWithBoard([
    { playerId: 'player-1', card: vanilla, slot: 0 },
  ]), 'player-1');
  const destroyed = destroyCard(destroyState, 'player-1', vanilla.instanceId);
  assert.equal(destroyed.success, true);
  assert.equal(destroyed.state.players[0].graveyard.some((entry) => entry.instanceId === vanilla.instanceId), false);
  assert.equal(destroyed.state.players[0].hand.length, 0);
  assert.equal(countEvents(destroyed.state, 'CARD_RETIRED', vanilla.instanceId), 0);
});

test('retire event and graveyard state survive JSON round-trip without replaying effects', () => {
  const target = card('serializable-target', [leaveDrawAbility()]);
  const initial = drawDeck(stateWithBoard([
    { playerId: 'player-1', card: target, slot: 0 },
  ]), 'player-1');
  const lethal = {
    ...initial,
    players: initial.players.map((player) => player.id === 'player-1'
      ? { ...player, board: player.board.map((entry) => entry?.instanceId === target.instanceId ? { ...entry, currentHealth: 0 } : entry) as typeof player.board }
      : player),
  };

  const retired = resolveStateBasedDeaths(lethal);
  const restored = JSON.parse(JSON.stringify(retired)) as GameState;
  const replayAttempt = resolveStateBasedDeaths(restored);

  assert.equal(replayAttempt.players[0].graveyard.length, 1);
  assert.equal(replayAttempt.players[0].hand.length, 1);
  assert.equal(countEvents(replayAttempt, 'CARD_RETIRED', target.instanceId), 1);
  assert.equal(replayAttempt.events.filter((event) => event.type === 'CARD_DRAWN').length, 1);
});