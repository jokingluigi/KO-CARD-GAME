import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCardInstance } from '../cards/generation';
import type { CardDefinition } from '../cards/types';
import type { CardEffect } from '../effects/types';
import { applyEffect, getValidTargets, hasMandatoryPlayerChoice, selectEffectTarget } from '../effects/effect-engine';
import { createInitialGameState } from './create-initial-game-state';
import { executeAction } from '../actions/engine-actions';
import { isChampionProtectedByToken } from './direct-champion';
import { drawCard } from './draw-card';
import { fusionTargets } from './fusion';

const definition = (id: string, extra: Partial<CardDefinition> = {}): CardDefinition => ({
  id, name: id, cost: 1, attack: 4, health: 8, cardType: 'WRESTLER',
  rulesText: '', keywords: [], abilities: [], isToken: false, isChampionToken: false, ...extra,
});
function setup(extra: Partial<CardDefinition> = {}) {
  const source = definition('source'), target = definition('protected', extra);
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS'; state.activePlayerId = 'player-1'; state.turn = 3;
  state.cardPool = [source, target];
  state.players[0].board[0] = { ...generateCardInstance(source, { instanceId: 'source' }), boardSlot: 0, enteredThisTurn: false };
  state.players[1].board[0] = { ...generateCardInstance(target, { instanceId: 'protected' }), boardSlot: 0, enteredOnTurn: state.turn, entryDefenseActive: true };
  return state;
}
const target = { zone: 'BOARD' as const, owner: 'ENEMY' as const, selection: 'PLAYER_CHOICE' as const, count: 1 };

for (const action of ['DAMAGE', 'DESTROY', 'RETIRE', 'REMOVE_FROM_GAME', 'SILENCE', 'MOVE_TO_HAND', 'BUFF'] as const) {
  test(`entry defense excludes manual ${action} and rejects forged direct execution`, () => {
    const state = setup({ keywords: ['DEFENSE'] });
    const source = state.players[0].board[0]!;
    const effect: CardEffect = { type: 'STRUCTURED', action, target, values: { amount: 4, attack: 2, health: 2 } };
    assert.deepEqual(getValidTargets(state, 'player-1', source, effect), []);
    const result = applyEffect(state, 'player-1', source, effect, ['protected']);
    assert.deepEqual(result.players, state.players);
    state.players[1].board[0]!.entryDefenseActive = false;
    assert.deepEqual(getValidTargets(state, 'player-1', source, effect), ['protected']);
  });
}

test('entry defense blocks attacks and area/random damage without consuming dodge', () => {
  const state = setup({ keywords: ['DEFENSE', 'DODGE'] });
  assert.equal(executeAction(state, { type: 'ATTACK', playerId: 'player-1', attackerInstanceId: 'source', target: { type: 'WRESTLER', playerId: 'player-2', cardInstanceId: 'protected' } }).success, false);
  for (const selection of ['ALL', 'RANDOM'] as const) {
    const result = applyEffect(state, 'player-1', state.players[0].board[0]!, { type: 'STRUCTURED', action: 'DAMAGE', target: { ...target, selection }, values: { amount: 100 } });
    assert.equal(result.players[1].board[0]!.currentHealth, 8);
    assert.equal(result.players[1].board[0]!.dodgeCharges, 1);
  }
});

test('manual SCRIPT selectors exclude defense and cannot open an impossible mandatory choice', () => {
  const state = setup({ keywords: ['DEFENSE'] });
  const source = { ...state.players[0].board[0]!, cardType: 'TECHNIQUE' as const };
  const script: CardEffect = { type: 'SCRIPT', script: { version: 'SCRIPT_V1', trigger: 'ENTER_FIELD', steps: [
    { type: 'SELECT', id: 'victim', target },
    { type: 'EFFECT', effect: { action: 'DESTROY', target: { ...target, selection: 'SAME_TARGET', resultId: 'victim' } } },
  ] } };
  assert.equal(hasMandatoryPlayerChoice(state, 'player-1', source, [script]), true);
  const result = applyEffect(state, 'player-1', source, script);
  assert.equal(result.targetingState?.active ?? false, false);
  assert.ok(result.players[1].board[0]);
  assert.deepEqual(selectEffectTarget(result, 'protected').players, result.players);
});

test('defense only protects a field card; hand and graveyard copies remain selectable', () => {
  for (const zone of ['HAND', 'GRAVEYARD'] as const) {
    const state = setup({ keywords: ['DEFENSE'] });
    const card = state.players[1].board[0]!;
    state.players[1].board[0] = null;
    state.players[1][zone === 'HAND' ? 'hand' : 'graveyard'] = [card];
    const effect: CardEffect = { type: 'STRUCTURED', action: 'MOVE_TO_DECK', target: { ...target, zone } };
    assert.deepEqual(getValidTargets(state, 'player-1', state.players[0].board[0]!, effect), ['protected']);
  }
});

test('defense also prevents manual ally fusion selection', () => {
  const state = setup({ keywords: ['DEFENSE'] });
  state.players[0].board[1] = { ...state.players[1].board[0]!, boardSlot: 1 };
  state.players[1].board[0] = null;
  assert.deepEqual(fusionTargets(state, 'player-1', 'source'), []);
  state.players[0].board[1]!.entryDefenseActive = false;
  assert.deepEqual(fusionTargets(state, 'player-1', 'source'), ['protected']);
});

test('quest-exclusive champion token protects only its owner from attacks, effect and fatigue damage', () => {
  const state = setup({ isToken: true, isChampionToken: true });
  state.players[1].board[0]!.questExclusive = true;
  const health = state.players[1].health;
  assert.equal(isChampionProtectedByToken(state, 'player-2'), true);
  assert.equal(isChampionProtectedByToken(state, 'player-1'), false);
  assert.equal(executeAction(state, { type: 'ATTACK', playerId: 'player-1', attackerInstanceId: 'source', target: { type: 'CHAMPION', playerId: 'player-2' } }).success, false);
  for (const effect of [
    { type: 'DAMAGE_OPPONENT_CHAMPION', amount: 100 },
    { type: 'STRUCTURED', action: 'DAMAGE', target: { zone: 'PLAYER', owner: 'ENEMY', selection: 'SELF', count: 1 }, values: { amount: 100 } },
    { type: 'STRUCTURED', action: 'DAMAGE', target: { zone: 'CHARACTER', owner: 'ALL', selection: 'ALL', count: 10 }, values: { amount: 4 } },
  ] satisfies CardEffect[]) {
    assert.equal(applyEffect(state, 'player-1', state.players[0].board[0]!, effect).players[1].health, health);
  }
  state.players[1].deck = [];
  assert.equal(drawCard(state, 'player-2').players[1].health, health);
  const removed = applyEffect(state, 'player-1', state.players[0].board[0]!, { type: 'STRUCTURED', action: 'DESTROY', target }, ['protected']);
  assert.equal(isChampionProtectedByToken(removed, 'player-2'), false);
  assert.equal(drawCard(removed, 'player-2').players[1].health, health - 1);
});

test('champion token in hand or graveyard grants no champion protection', () => {
  const state = setup({ isToken: true, isChampionToken: true });
  const token = state.players[1].board[0]!;
  state.players[1].board[0] = null;
  state.players[1].hand = [token]; state.players[1].graveyard = [{ ...token, instanceId: 'grave-token' }];
  assert.equal(isChampionProtectedByToken(state, 'player-2'), false);
});

test('real spell selection rejects a defended target and resolves against another legal field card', () => {
  const state = setup({ keywords: ['DEFENSE'] });
  const other = generateCardInstance(definition('other'), { instanceId: 'other' });
  state.players[1].board[1] = { ...other, boardSlot: 1 };
  const spellDefinition = definition('spell', { cardType: 'TECHNIQUE', attack: 0, health: 0, abilities: [{ trigger: 'ACTIVE', effects: [{ type: 'STRUCTURED', action: 'DESTROY', target }] }] });
  state.cardPool!.push(spellDefinition);
  state.players[0].hand = [generateCardInstance(spellDefinition, { instanceId: 'spell' })];
  state.players[0].currentGold = 3;
  const played = executeAction(state, { type: 'PLAY_TECHNIQUE', playerId: 'player-1', cardInstanceId: 'spell' });
  assert.ok(played.success);
  assert.deepEqual(played.state.targetingState?.validTargetIds, ['other']);
  const forged = executeAction(played.state, { type: 'SELECT_EFFECT_TARGET', playerId: 'player-1', targetId: 'protected' });
  assert.equal(forged.success, false);
  const selected = executeAction(played.state, { type: 'SELECT_EFFECT_TARGET', playerId: 'player-1', targetId: 'other' });
  assert.ok(selected.success);
  assert.ok(selected.state.players[1].board[0]);
  assert.equal(selected.state.players[1].board[1], null);
  assert.equal(selected.state.targetingState?.active ?? false, false);
});

test('automatic SAME_TARGET follow-ups may grant another keyword after granting defense', () => {
  const state = setup();
  const source = state.players[0].board[0]!;
  const defended = applyEffect(state, 'player-1', source, { type: 'STRUCTURED', action: 'ADD_KEYWORD', target: { ...target, selection: 'SAME_TARGET' }, values: { keyword: 'DEFENSE' } }, ['protected']);
  const result = applyEffect(defended, 'player-1', source, { type: 'STRUCTURED', action: 'ADD_KEYWORD', target: { ...target, selection: 'SAME_TARGET' }, values: { keyword: 'TAUNT' } }, ['protected']);
  assert.ok(result.players[1].board[0]!.keywords.includes('DEFENSE'));
  assert.ok(result.players[1].board[0]!.keywords.includes('TAUNT'));
});

for (const action of ['DESTROY', 'RETIRE', 'REMOVE_FROM_GAME', 'VANISH'] as const) {
  for (const selection of ['ALL', 'RANDOM', 'SAME_TARGET', 'SELF'] as const) {
    test(`entry defense prevents ${selection} ${action}, including removal events and rewards`, () => {
      const state = setup({ keywords: ['DEFENSE'] });
      const defended = state.players[1].board[0]!;
      const effect: CardEffect = { type: 'STRUCTURED', action, target: { ...target, owner: selection === 'SELF' ? 'SELF' : 'ENEMY', selection } };
      const source = selection === 'SELF' ? defended : state.players[0].board[0]!;
      const playerId = selection === 'SELF' ? 'player-2' : 'player-1';
      const blocked = applyEffect(state, playerId, source, effect, ['protected']);
      assert.deepEqual(blocked.players, state.players);
      assert.deepEqual(blocked.events, state.events);
      state.players[1].board[0]!.entryDefenseActive = false;
      const removed = applyEffect(state, playerId, source, effect, ['protected']);
      assert.equal(removed.players[1].board[0], null);
    });
  }
}

test('area destruction still removes unprotected cards and leaves defended cards intact', () => {
  const state = setup({ keywords: ['DEFENSE'] });
  state.players[1].board[1] = { ...generateCardInstance(definition('ordinary'), { instanceId: 'ordinary' }), boardSlot: 1 };
  const result = applyEffect(state, 'player-1', state.players[0].board[0]!, { type: 'STRUCTURED', action: 'DESTROY', target: { ...target, selection: 'ALL' } });
  assert.ok(result.players[1].board[0]);
  assert.equal(result.players[1].board[1], null);
  assert.deepEqual(result.events.filter(event => event.type === 'CARD_DESTROYED').map(event => event.cardInstanceId), ['ordinary']);
});

test('defense survives the summon turn and opponent turn, then expires at the next owner turn start', () => {
  const state = setup({ keywords: ['DEFENSE'] });
  state.activePlayerId = 'player-2';
  const effect: CardEffect = { type: 'STRUCTURED', action: 'DESTROY', target: { ...target, selection: 'ALL' } };
  const ended = executeAction(state, { type: 'END_TURN', playerId: 'player-2' });
  assert.ok(ended.success);
  assert.equal(ended.state.activePlayerId, 'player-1');
  assert.ok(applyEffect(ended.state, 'player-1', ended.state.players[0].board[0]!, effect).players[1].board[0]);
  const resumed = executeAction(ended.state, { type: 'END_TURN', playerId: 'player-1' });
  assert.ok(resumed.success);
  assert.equal(resumed.state.activePlayerId, 'player-2');
  assert.equal(resumed.state.players[1].board[0]!.entryDefenseActive, false);
  assert.equal(applyEffect(resumed.state, 'player-1', resumed.state.players[0].board[0]!, effect).players[1].board[0], null);
});

test('random removal uses the seeded choice once and does not reroll a defended hit', () => {
  let defendedHits = 0, ordinaryHits = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const state = setup({ keywords: ['DEFENSE'] });
    state.randomSeed = seed;
    state.players[1].board[1] = { ...generateCardInstance(definition('ordinary'), { instanceId: 'ordinary' }), boardSlot: 1 };
    const unprotected = structuredClone(state);
    unprotected.players[1].board[0]!.entryDefenseActive = false;
    const effect: CardEffect = { type: 'STRUCTURED', action: 'DESTROY', target: { ...target, selection: 'RANDOM' } };
    const baseline = applyEffect(unprotected, 'player-1', unprotected.players[0].board[0]!, effect);
    const result = applyEffect(state, 'player-1', state.players[0].board[0]!, effect);
    if (!baseline.players[1].board[0]) {
      defendedHits++;
      assert.deepEqual(result.players[1].board, state.players[1].board);
      assert.equal(result.events.filter(event => event.type === 'CARD_DESTROYED').length, 0);
    } else {
      ordinaryHits++;
      assert.ok(result.players[1].board[0]);
      assert.equal(result.players[1].board[1], null);
    }
  }
  assert.ok(defendedHits > 0 && ordinaryHits > 0);
});
