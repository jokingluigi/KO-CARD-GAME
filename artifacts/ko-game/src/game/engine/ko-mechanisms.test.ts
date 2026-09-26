import assert from 'node:assert/strict';
import test from 'node:test';
import type { CardInstance } from '../cards/types';
import { createInitialGameState } from './create-initial-game-state';
import { enterField } from './enter-field';
import { playWrestlerFromHand } from './play-wrestler';
import { drawCard } from './draw-card';
import { resolveTriggeredAbilities, selectEffectTarget } from '../effects/effect-engine';
import { canSelectAsAttacker } from './combat';
import { silenceCard, setCardStunned } from './card-status';

const card = (id: string, overrides: Partial<CardInstance> = {}): CardInstance => ({
  instanceId: id, definitionId: id, cardType: 'WRESTLER', currentCost: 1, baseCost: 1,
  currentAttack: 1, baseAttack: 1, currentHealth: 3, baseHealth: 3, maxHealth: 3,
  boardSlot: null, enteredThisTurn: false, attacksUsedThisTurn: 0, isGenerated: false,
  isToken: false, isChampionToken: false, keywords: [], abilities: [], tags: [],
  isSilenced: false, isSilenceImmune: false, dodgeAvailable: false, dodgeCharges: 0,
  isStunned: false, activeUsedThisTurn: false, isDirectDeployedChampion: false, capturedCards: [], ...overrides,
});
const state = () => ({ ...createInitialGameState(), status: 'IN_PROGRESS' as const, activePlayerId: 'player-1' });
const player = (s: ReturnType<typeof state>, id = 'player-1') => s.players.find((p) => p.id === id)!;
test('absorbing a retired ally adds attack to attack and health to health separately', () => {
  const selfTarget = { zone: 'BOARD' as const, owner: 'SELF' as const, selection: 'SELF' as const, count: 1 };
  const source = card('absorber', { currentAttack: 2, currentHealth: 4, maxHealth: 4,
    abilities: [{ trigger: 'ENTER_FIELD', effects: [
      { type: 'STRUCTURED', action: 'RETIRE', target: { zone: 'BOARD', owner: 'SELF', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1 }, values: { captureStats: true } },
      { type: 'STRUCTURED', action: 'BUFF', target: selfTarget, values: { attack: 0, health: 0, reference: 'LAST_TARGET', referenceStat: 'CURRENT_ATTACK' } },
      { type: 'STRUCTURED', action: 'BUFF', target: selfTarget, values: { attack: 0, health: 0, reference: 'LAST_TARGET', referenceStat: 'CURRENT_HEALTH' } },
    ] }],
  });
  const ally = card('ally', { boardSlot: 1, currentAttack: 3, currentHealth: 5, maxHealth: 5 });
  const initial = state();
  initial.players[0]!.board = [null, ally, null, null];
  const pending = enterField(initial, 'player-1', source, 0);
  assert.equal(pending.targetingState?.active, true);
  const chosen = selectEffectTarget(pending, ally.instanceId);
  const result = player(chosen).board[0]!;
  assert.equal(player(chosen).board[1], null);
  assert.equal(result.currentAttack, 5);
  assert.equal(result.currentHealth, 9);
  assert.equal(result.maxHealth, 9);
});
test('fourth board slot resolves entry and ally-entry effects', () => {
  const listener = card('listener', { boardSlot: 0, abilities: [{ trigger: 'CARD_ENTERED', effects: [{ type: 'GAIN_GOLD', amount: 2 }] }] });
  const fourth = card('fourth', { abilities: [{ trigger: 'ENTER_FIELD', effects: [{ type: 'GAIN_GOLD', amount: 1 }] }] });
  const initial = state();
  const filled = { ...initial, players: initial.players.map((p) => p.id === 'player-1'
    ? { ...p, board: [listener, card('second', { boardSlot: 1, abilities: listener.abilities }), card('third', { boardSlot: 2, abilities: listener.abilities }), null] as typeof p.board }
    : p) };
  const result = enterField(filled, 'player-1', fourth, 3);
  assert.equal(player(result).board[3]?.instanceId, fourth.instanceId);
  assert.equal(player(result).currentGold, player(filled).currentGold + 7);
});
test('the fourth field entry in sequence still resolves its own effect', () => {
  let next = state();
  for (let index = 0; index < 4; index += 1) {
    const entrant = card(`entrant-${index}`, { abilities: [{ trigger: 'ENTER_FIELD', effects: [{ type: 'GAIN_GOLD', amount: 1 }] }] });
    next = enterField(next, 'player-1', entrant, index as 0 | 1 | 2 | 3);
    assert.equal(player(next).currentGold, index + 1, `entry ${index + 1} should resolve`);
  }
});
test('the fourth played wrestler fires its effect through the match action', () => {
  const hand = Array.from({ length: 4 }, (_, index) => card(`hand-${index}`, {
    abilities: [{ trigger: 'ENTER_FIELD', effects: [{ type: 'GAIN_GOLD', amount: 2 }] }],
  }));
  const initial = state();
  let next = { ...initial, players: initial.players.map((p) => p.id === 'player-1'
    ? { ...p, hand, currentGold: 10 }
    : p) };
  for (let index = 0; index < 4; index += 1) {
    const result = playWrestlerFromHand(next, 'player-1', hand[index]!.instanceId, index as 0 | 1 | 2 | 3);
    assert.equal(result.success, true);
    next = result.state;
    assert.equal(player(next).currentGold, 10 + index + 1);
  }
});
test('KO mechanisms: generated summons enter without replaying the summoned card entry effect', () => {
  const b = card('b', { abilities: [{ trigger: 'ENTER_FIELD', effects: [{ type: 'GAIN_GOLD', amount: 1 }] }] });
  const a = card('a', { abilities: [{
    trigger: 'ENTER_FIELD',
    effects: [{
      type: 'STRUCTURED', action: 'SUMMON',
      values: { definition: { id: 'b', name: 'B', cardType: 'WRESTLER', cost: 1, attack: 1, health: 3, rulesText: '', isToken: false, isChampionToken: false, keywords: [], abilities: b.abilities } },
    }],
  }] });
  const initial = state();
  const result = enterField(initial, 'player-1', a, 0);
  assert.equal(player(result).board.filter(Boolean).length, player(initial).board.filter(Boolean).length + 2);
  assert.equal(player(result).currentGold, 0);
  assert.equal(result.events.filter((e) => e.type === 'ENTER_FIELD').length, initial.events.filter((e) => e.type === 'ENTER_FIELD').length + 2);
});

test('KO mechanisms: REVIVE moves the existing graveyard instance, restores health, and skips entry effects', () => {
  const revived = card('revived', {
    currentHealth: 0,
    baseHealth: 4,
    maxHealth: 4,
    abilities: [{ trigger: 'ENTER_FIELD', effects: [{ type: 'GAIN_GOLD', amount: 9 }] }],
  });
  const source = card('reviver', {
    abilities: [{
      trigger: 'ENTER_FIELD',
      effects: [{
        type: 'STRUCTURED',
        action: 'REVIVE',
        target: {
          zone: 'GRAVEYARD',
          owner: 'SELF',
          cardType: 'WRESTLER',
          selection: 'RANDOM',
          count: 1,
        },
      }],
    }],
  });
  const initial = {
    ...state(),
    players: state().players.map((player) => player.id === 'player-1'
      ? { ...player, graveyard: [{ ...revived, boardSlot: null }] }
      : player),
  };
  const result = enterField(initial, 'player-1', source, 0);
  const revivedOnBoard = player(result).board.find((entry) => entry?.instanceId === revived.instanceId);
  assert.equal(revivedOnBoard?.currentHealth, 4);
  assert.equal(revivedOnBoard?.isGenerated, false);
  assert.equal(player(result).graveyard.some((entry) => entry.instanceId === revived.instanceId), false);
  assert.equal(player(result).currentGold, 0);
  assert.equal(result.events.some((event) => event.type === 'CARD_GENERATED' && event.cardInstanceId === revived.instanceId), false);
  const reviveEvent = result.events.find((event) => event.type === 'ENTER_FIELD' && event.cardInstanceId === revived.instanceId);
  assert.equal(reviveEvent?.entryCause, 'REVIVE');
});

test('KO mechanisms: prepare occurs before deterministic overdraw removal', () => {
  const drawn = card('drawn', { abilities: [{ trigger: 'CARD_DRAWN', effects: [{ type: 'GAIN_GOLD', amount: 1 }] }] });
  const s = state();
  const result = drawCard({ ...s, players: s.players.map((p) => p.id === 'player-1' ? { ...p, hand: Array.from({ length: 7 }, (_, i) => card(`h${i}`)), deck: [drawn] } : p) }, 'player-1');
  assert.equal(player(result).currentGold, 1);
  assert.equal(player(result).removedFromGame[0].instanceId, 'drawn');
  const types = result.events.map((e) => e.type);
  assert.ok(types.indexOf('CARD_DRAWN') < types.indexOf('GOLD_CHANGED'));
  assert.ok(types.indexOf('GOLD_CHANGED') < types.indexOf('CARD_REMOVED'));
});

test('KO mechanisms: SUMMON/GENERATE require serializable definitions and switch selects current side', () => {
  const source = card('source', { boardSlot: 2 });
  assert.throws(() => resolveTriggeredAbilities(state(), 'player-1', card('bad', { abilities: [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'SUMMON' }] }] }), 'ENTER_FIELD'));
  const switched = resolveTriggeredAbilities(state(), 'player-1', { ...source, abilities: [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'SWITCH_EFFECT_BRANCH', values: { leftEffects: [{ type: 'GAIN_GOLD', amount: 1 }], rightEffects: [{ type: 'GAIN_GOLD', amount: 2 }] } }] }] }, 'ENTER_FIELD');
  assert.equal(player(switched).currentGold, 2);
});

test('KO mechanisms: 발단 destroys generated board cards, sums current stats, and taunts the summoned zombie', () => {
  const zombieDefinition = {
    id: 'zombie-token',
    name: '좀비',
    cardType: 'WRESTLER' as const,
    cost: 0,
    attack: 1,
    health: 1,
    rulesText: '으에에엙',
    isToken: true,
    isChampionToken: false,
    keywords: [] as const,
    abilities: [],
  };
  const source = card('발단', {
    abilities: [{
      trigger: 'ENTER_FIELD',
      effects: [
        {
          type: 'STRUCTURED',
          action: 'DESTROY',
          target: { zone: 'BOARD', owner: 'SELF', selection: 'ALL', count: 20, filter: { isGenerated: true } },
        },
        {
          type: 'STRUCTURED',
          action: 'SUMMON',
          values: {
            definition: zombieDefinition,
            aggregateStats: {
              source: 'LAST_DESTROYED_TARGETS',
              attack: 'CURRENT_ATTACK_SUM',
              health: 'CURRENT_HEALTH_SUM',
            },
          },
        },
        {
          type: 'STRUCTURED',
          action: 'ADD_KEYWORD',
          target: { zone: 'BOARD', owner: 'SELF', selection: 'SAME_TARGET', count: 1 },
          values: { keyword: 'TAUNT' },
        },
      ],
    }],
  });
  const generatedA = card('generated-a', { isGenerated: true, currentAttack: 2, currentHealth: 4, maxHealth: 6 });
  const generatedB = card('generated-b', { isGenerated: true, currentAttack: 5, currentHealth: 3, maxHealth: 3 });
  const directChampion = card('direct-champion', { isGenerated: true, isDirectDeployedChampion: true, currentAttack: 99, currentHealth: 99 });
  let initial = state();
  initial = enterField(initial, 'player-1', generatedA, 0);
  initial = enterField(initial, 'player-1', generatedB, 1);
  initial = enterField(initial, 'player-1', directChampion, 3);
  const result = enterField(initial, 'player-1', source, 2);
  const owner = player(result);
  const zombie = owner.board.find((entry) => entry?.definitionId === 'zombie-token');
  assert.equal(owner.graveyard.some((entry) => entry.instanceId === generatedA.instanceId), false);
  assert.equal(owner.graveyard.some((entry) => entry.instanceId === generatedB.instanceId), false);
  assert.equal(owner.board[3]?.instanceId, directChampion.instanceId);
  assert.equal(zombie?.currentAttack, 7);
  assert.equal(zombie?.currentHealth, 7);
  assert.deepEqual(zombie?.keywords, ['TAUNT']);
});

test('KO mechanisms: an aggregate summon uses zero stats when no generated board cards exist', () => {
  const source = card('empty-발단', {
    abilities: [{
      trigger: 'ENTER_FIELD',
      effects: [
        {
          type: 'STRUCTURED',
          action: 'DESTROY',
          target: { zone: 'BOARD', owner: 'SELF', selection: 'ALL', count: 20, filter: { isGenerated: true } },
        },
        {
          type: 'STRUCTURED',
          action: 'SUMMON',
          values: {
            definition: { id: 'empty-zombie', name: '좀비', cardType: 'WRESTLER', cost: 0, attack: 1, health: 1, rulesText: '', isToken: true, isChampionToken: false, keywords: [], abilities: [] },
            aggregateStats: { source: 'LAST_DESTROYED_TARGETS', attack: 'CURRENT_ATTACK_SUM', health: 'CURRENT_HEALTH_SUM' },
          },
        },
      ],
    }],
  });
  const result = enterField(state(), 'player-1', source, 0);
  const zombie = player(result).board.find((entry) => entry?.definitionId === 'empty-zombie');
  assert.equal(zombie, undefined);
  assert.equal(player(result).graveyard.some((entry) => entry.definitionId === 'empty-zombie'), true);
});

test('KO mechanisms: silence resets base state and dodge charges are represented compatibly', () => {
  const target = card('target', { currentAttack: 9, currentHealth: 9, maxHealth: 9, dodgeAvailable: true, dodgeCharges: 2 });
  const s = state();
  const onBoard = enterField(s, 'player-1', target, 0);
  const source = card('source', { abilities: [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'SILENCE', target: { zone: 'BOARD', owner: 'SELF', selection: 'PLAYER_CHOICE', count: 1 } }] }] });
  assert.equal(player(onBoard).board[0]?.dodgeCharges, 2);
  assert.ok(source);
});
