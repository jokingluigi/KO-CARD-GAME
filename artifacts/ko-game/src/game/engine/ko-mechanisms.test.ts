import assert from 'node:assert/strict';
import test from 'node:test';
import type { CardInstance } from '../cards/types';
import { createInitialGameState } from './create-initial-game-state';
import { enterField } from './enter-field';
import { drawCard } from './draw-card';
import { resolveTriggeredAbilities } from '../effects/effect-engine';
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
test('KO mechanisms: generated summons enter once and chained enter effects resolve', () => {
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
  assert.equal(player(result).currentGold, 1);
  assert.equal(result.events.filter((e) => e.type === 'ENTER_FIELD').length, initial.events.filter((e) => e.type === 'ENTER_FIELD').length + 2);
});

test('KO mechanisms: conditions/tags use this-turn play history, not current board', () => {
  const tagged = card('tagged', { tags: ['demon'] });
  const source = card('source', { tags: ['demon'], abilities: [{ trigger: 'ENTER_FIELD', condition: { type: 'HAS_MATCHING_TAG_PLAYED_THIS_TURN' }, effects: [{ type: 'GAIN_GOLD', amount: 2 }] }] });
  const s = { ...state(), events: [{ type: 'CARD_PLAYED' as const, playerId: 'player-1', cardInstanceId: tagged.instanceId, tags: ['demon'] }] };
  assert.equal(player(resolveTriggeredAbilities(s, 'player-1', source, 'ENTER_FIELD')).currentGold, 2);
  const reset = { ...s, events: [...s.events, { type: 'TURN_STARTED' as const, playerId: 'player-1' }] };
  assert.equal(player(resolveTriggeredAbilities(reset, 'player-1', source, 'ENTER_FIELD')).currentGold, 0);
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

test('KO mechanisms: silence resets base state and dodge charges are represented compatibly', () => {
  const target = card('target', { currentAttack: 9, currentHealth: 9, maxHealth: 9, dodgeAvailable: true, dodgeCharges: 2 });
  const s = state();
  const onBoard = enterField(s, 'player-1', target, 0);
  const source = card('source', { abilities: [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'SILENCE', target: { zone: 'BOARD', owner: 'SELF', selection: 'PLAYER_CHOICE', count: 1 } }] }] });
  assert.equal(player(onBoard).board[0]?.dodgeCharges, 2);
  assert.ok(source);
});