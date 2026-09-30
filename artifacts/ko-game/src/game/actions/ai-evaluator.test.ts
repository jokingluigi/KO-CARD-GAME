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
  const selected = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', 'HARD');
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

test('all AI profiles prefer the cheaper wrestler when board stats are identical', () => {
  const state = setup(); state.players[0]!.board = [null, null, null, null]; state.players[0]!.currentGold = 3;
  state.players[0]!.hand = [generateCardInstance({ ...card, cost: 3 }, { instanceId: 'expensive' }), generateCardInstance(card, { instanceId: 'efficient' })];
  for (const difficulty of ['NORMAL', 'HARD', 'BOSS'] as const) {
    const chosen = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', difficulty);
    assert.equal(chosen.type, 'PLAY_WRESTLER'); assert.equal('cardInstanceId' in chosen ? chosen.cardInstanceId : '', 'efficient');
    const result = executeAction(state, chosen); assert.ok(result.success); assert.equal(result.state.players[0]!.currentGold, 2);
  }
});
test('all AI profiles save expensive destruction when cheap damage already removes the weak enemy', () => {
  const state = setup(); state.players[0]!.board = [null, null, null, null]; state.players[0]!.currentGold = 3;
  state.players[1]!.board[0] = { ...generateCardInstance({ ...card, attack: 1, health: 1 }, { instanceId: 'weak-enemy' }), boardSlot: 0 };
  state.players[0]!.hand = [generateCardInstance({ ...card, id: 'destroy', cardType: 'TECHNIQUE', cost: 3, abilities: [{ trigger: 'ACTIVE', effects: [{ type: 'STRUCTURED', action: 'DESTROY', target: { zone: 'BOARD', owner: 'OPPONENT', selection: 'ALL' } }] }] }, { instanceId: 'strong-removal' }),
    generateCardInstance({ ...card, id: 'damage', cardType: 'TECHNIQUE', cost: 1, abilities: [{ trigger: 'ACTIVE', effects: [{ type: 'STRUCTURED', action: 'DAMAGE', target: { zone: 'BOARD', owner: 'OPPONENT', selection: 'ALL' }, values: { amount: 1 } }] }] }, { instanceId: 'small-removal' })];
  for (const difficulty of ['NORMAL', 'HARD', 'BOSS'] as const) {
    const chosen = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', difficulty);
    assert.equal(chosen.type, 'PLAY_TECHNIQUE'); assert.equal('cardInstanceId' in chosen ? chosen.cardInstanceId : '', 'small-removal');
    const result = executeAction(state, chosen); assert.ok(result.success); assert.equal(result.state.players[1]!.board[0], null);
    assert.ok(result.state.players[0]!.hand.some(card => card.instanceId === 'strong-removal'));
  }
});
test('all AI profiles value real draw with low hand instead of ending the turn', () => {
  const state = setup(); state.players[0]!.board = [null, null, null, null]; state.players[0]!.currentGold = 1;
  state.players[0]!.hand = [generateCardInstance({ ...card, id: 'draw', cardType: 'TECHNIQUE', abilities: [{ trigger: 'ACTIVE', effects: [{ type: 'STRUCTURED', action: 'DRAW', values: { amount: 2 } }] }] }, { instanceId: 'draw-card' })];
  for (const difficulty of ['NORMAL', 'HARD', 'BOSS'] as const) {
    const chosen = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', difficulty);
    assert.equal(chosen.type, 'PLAY_TECHNIQUE');
    const result = executeAction(state, chosen); assert.ok(result.success); assert.equal(result.state.players[0]!.hand.length, 2);
  }
});

test('all AI profiles complete an available champion quest through a real card play', () => {
  const state = setup(); state.players[0]!.currentGold = 1; state.players[0]!.champion!.questProgress = 1;
  state.players[0]!.hand = [generateCardInstance({ ...card, attack: 0, health: 1 }, { instanceId: 'quest-finisher' })];
  for (const difficulty of ['NORMAL', 'HARD', 'BOSS'] as const) {
    const chosen = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', difficulty);
    assert.equal(chosen.type, 'PLAY_WRESTLER');
    const result = executeAction(state, chosen); assert.ok(result.success);
    assert.equal(result.state.players[0]!.champion!.questCompleted, true); assert.equal(result.state.players[0]!.champion!.questProgress, 2);
    assert.ok(result.state.events.some(event => event.type === 'CHAMPION_QUEST_COMPLETED'));
  }
});
test('HARD/BOSS use an attack buff before combat to find same-turn lethal', () => {
  const state = setup(); state.players[0]!.board[1] = null; state.players[0]!.currentGold = 1;
  state.players[1]!.health = 5; state.players[1]!.champion!.health = 5;
  state.players[0]!.hand = [generateCardInstance({ ...card, id: 'buff', cardType: 'TECHNIQUE', abilities: [{ trigger: 'ACTIVE', effects: [{ type: 'STRUCTURED', action: 'BUFF', target: { zone: 'BOARD', owner: 'SELF', selection: 'ALL' }, values: { attack: 2 } }] }] }, { instanceId: 'lethal-buff' })];
  for (const difficulty of ['HARD', 'BOSS'] as const) {
    const first = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', difficulty); assert.equal(first.type, 'PLAY_TECHNIQUE');
    const buffed = executeAction(state, first); assert.ok(buffed.success);
    const second = chooseBestAction(buffed.state, getLegalActions(buffed.state, 'player-1'), 'player-1', difficulty);
    assert.equal(executeAction(buffed.state, second).state.winnerId, 'player-1');
  }
});

test('all AI profiles do not assume a fragile taunt blocks multiple visible lethal attackers', () => {
  const state = setup(); state.players[0]!.board[1] = null; state.players[0]!.board[0]!.keywords = ['TAUNT'];
  state.players[0]!.board[0]!.currentHealth = 1; state.players[0]!.health = 8; state.players[0]!.champion!.health = 8;
  for (const [slot, attack, health] of [[0, 1, 1], [1, 9, 2]] as const)
    state.players[1]!.board[slot] = { ...generateCardInstance({ ...card, attack, health }, { instanceId: `guard-enemy:${slot}` }), boardSlot: slot, enteredThisTurn: false };
  for (const difficulty of ['NORMAL', 'HARD', 'BOSS'] as const) {
    const chosen = chooseBestAction(state, getLegalActions(state, 'player-1'), 'player-1', difficulty);
    assert.equal(chosen.type, 'ATTACK'); assert.equal(chosen.type === 'ATTACK' && chosen.target.type === 'WRESTLER' ? chosen.target.cardInstanceId : '', 'guard-enemy:1');
  }
});
