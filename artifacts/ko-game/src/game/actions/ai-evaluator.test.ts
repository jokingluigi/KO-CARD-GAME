import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { startGame } from '../engine/turn-system';
import { getLegalActions, executeAction } from './engine-actions';
import { aiInformationState, chooseBestAction } from './ai-evaluator';
import { generateCardInstance } from '../cards/generation';
import type { CardDefinition } from '../cards/types';

const card: CardDefinition = { id: 'ai-qa', name: 'QA', cardType: 'WRESTLER', cost: 1, attack: 3, health: 6, rulesText: '', keywords: [], abilities: [], isToken: false, isChampionToken: false };
function setup() {
  const initial = startGame(createInitialGameState(), () => 0.5);
  return { ...initial, players: initial.players.map((p, index) => ({ ...p, hand: [], board: index ? [null, null, null, null] as typeof p.board :
    [0, 1, 2, 3].map(slot => slot < 2 ? { ...generateCardInstance(card, { instanceId: `a:${slot}` }), boardSlot: slot as 0 | 1, enteredThisTurn: false } : null) as typeof p.board })) };
}
test('all AI profiles prefer immediate lethal over quest, summon and END_TURN', () => {
  const state = setup(); state.players[1]!.health = 3; state.players[1]!.champion!.health = 3;
  for (const difficulty of ['NORMAL', 'HARD', 'BOSS'] as const) {
    const chosen = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', difficulty);
    assert.equal(chosen.type, 'ATTACK');
    assert.equal(executeAction(state, chosen).state.winnerId, 'player-1');
  }
});
test('HARD/BOSS find same-turn multi-action lethal through real actions', () => {
  const state = setup(); state.players[1]!.health = 6; state.players[1]!.champion!.health = 6;
  for (const difficulty of ['HARD', 'BOSS'] as const) {
    const first = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', difficulty);
    const next = executeAction(state, first).state;
    const second = chooseBestAction(next, getLegalActions(next, 'player-1'), 'player-1', difficulty);
    assert.equal(executeAction(next, second).state.winnerId, 'player-1');
  }
});
test('changing hidden hands, deck identities, deck order and seed does not change the AI decision', () => {
  const state = setup();
  const altered = structuredClone(state);
  altered.randomSeed = 987654;
  altered.players[0]!.deck.reverse();
  altered.players[1]!.deck = altered.players[1]!.deck.map(c => ({ ...c, currentAttack: 100, abilities: [{ trigger: 'GAME_START', effects: [{ type: 'GAIN_GOLD', amount: 100 }] }] }));
  altered.players[1]!.hand = altered.players[1]!.hand.map(c => ({ ...c, currentCost: 0, currentAttack: 200 }));
  assert.deepEqual(aiInformationState(state, 'player-1'), aiInformationState(altered, 'player-1'));
  assert.deepEqual(chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', 'BOSS'), chooseBestAction(altered, getLegalActions(altered, 'player-1'), 'player-1', 'BOSS'));
});
test('healing target selection prefers missing health instead of wasting healing on full HP', () => {
  const state = setup();
  state.players[0]!.board[1]!.currentHealth = 1;
  const source = state.players[0]!.board[0]!;
  state.targetingState = { active: true, playerId: 'player-1', sourceInstanceId: source.instanceId, sourceCard: source,
    effects: [{ type: 'STRUCTURED', action: 'HEAL', target: { zone: 'BOARD', owner: 'SELF', selection: 'PLAYER_CHOICE', count: 1 }, values: { amount: 4 } }],
    effectIndex: 0, selectedTargetIds: [], lastTargetIds: [], validTargetIds: ['a:0', 'a:1'], minTargets: 1, maxTargets: 1, mandatory: true, cancelable: false };
  const selected = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1');
  assert.equal(selected.type, 'SELECT_EFFECT_TARGET');
  assert.equal('targetId' in selected ? selected.targetId : '', 'a:1');
});

test('all AI profiles avoid a losing trade when a safe face attack is available', () => {
  const state = setup(); state.players[0]!.board[1] = null; state.players[0]!.board[0]!.currentHealth = 2;
  state.players[1]!.board[0] = { ...generateCardInstance({ ...card, id: 'big', attack: 8, health: 8 }, { instanceId: 'enemy-big' }), boardSlot: 0, enteredThisTurn: false };
  for (const difficulty of ['NORMAL', 'HARD', 'BOSS'] as const) {
    const chosen = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', difficulty);
    assert.equal(chosen.type, 'ATTACK'); assert.equal(chosen.type === 'ATTACK' ? chosen.target.type : '', 'PLAYER');
    assert.equal(executeAction(state, chosen).state.players[0]!.board[0]!.currentHealth, 2);
  }
});
test('all AI profiles remove visible lethal threat instead of taking nonlethal face damage', () => {
  const state = setup(); state.players[0]!.board[1] = null; state.players[0]!.health = 8; state.players[0]!.champion!.health = 8;
  state.players[1]!.board[0] = { ...generateCardInstance({ ...card, id: 'threat', attack: 9, health: 2 }, { instanceId: 'enemy-threat' }), boardSlot: 0, enteredThisTurn: false };
  for (const difficulty of ['NORMAL', 'HARD', 'BOSS'] as const) {
    const chosen = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', difficulty);
    assert.equal(chosen.type, 'ATTACK'); assert.equal(chosen.type === 'ATTACK' ? chosen.target.type : '', 'WRESTLER');
    assert.equal(executeAction(state, chosen).state.players[1]!.board.filter(Boolean).length, 0);
  }
});

for (const removal of ['RETIRE', 'DESTROY'] as const) test(`${removal}: all AI profiles spend targeted removal on the strong visible threat`, () => {
  const state = setup();
  for (const [slot, attack, health] of [[0, 1, 1], [1, 12, 12]] as const)
    state.players[1]!.board[slot] = { ...generateCardInstance({ ...card, id: `enemy-${slot}`, attack, health }, { instanceId: `enemy:${slot}` }), boardSlot: slot, enteredThisTurn: false };
  const source = state.players[0]!.board[0]!;
  state.targetingState = { active: true, playerId: 'player-1', sourceInstanceId: source.instanceId, sourceCard: source,
    effects: [{ type: 'STRUCTURED', action: removal, target: { zone: 'BOARD', owner: 'OPPONENT', selection: 'PLAYER_CHOICE', count: 1 }, values: {} }],
    effectIndex: 0, selectedTargetIds: [], lastTargetIds: [], validTargetIds: ['enemy:0', 'enemy:1'], minTargets: 1, maxTargets: 1, mandatory: true, cancelable: false };
  for (const difficulty of ['NORMAL', 'HARD', 'BOSS'] as const) {
    const chosen = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', difficulty);
    assert.equal(chosen.type, 'SELECT_EFFECT_TARGET'); assert.equal('targetId' in chosen ? chosen.targetId : '', 'enemy:1');
    const result = executeAction(state, chosen); assert.ok(result.success); assert.equal(result.state.players[1]!.board[1], null);
  }
});
test('all AI profiles respect Tower field cap in actual legal actions', () => {
  const state = setup(); state.players[0]!.board[1] = null;
  state.players[0]!.hand = [generateCardInstance(card, { instanceId: 'restricted-hand' })]; state.players[0]!.currentGold = 10;
  state.tower = { playerId: 'player-1', relics: [{ id: 'cap', effectType: 'MAX_FIELD_ONE', values: { attack: 4, health: 4 } }] };
  for (const difficulty of ['NORMAL', 'HARD', 'BOSS'] as const) {
    const actions = getLegalActions(state, 'player-1'); assert.ok(actions.every(action => action.type !== 'PLAY_WRESTLER'));
    const chosen = chooseBestAction(state, actions, 'player-1', difficulty); assert.ok(actions.includes(chosen)); assert.ok(executeAction(state, chosen).success);
  }
});
