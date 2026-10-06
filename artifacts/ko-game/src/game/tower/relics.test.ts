import assert from 'node:assert/strict';
import test from 'node:test';
import type { CardDefinition } from '../cards/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { startGame } from '../engine/turn-system';
import { executeAction, getLegalActions } from '../actions/engine-actions';
import { generateCardInstance } from '../cards/generation';
import { applyEffect } from '../effects/effect-engine';
import { TEST_CHAMPIONS } from '../champions/test-champions';
import { applyRelicHealthPenalty, type TowerBattleContext } from './relics';
import { endTurn } from '../engine/turn-system';

const vanilla: CardDefinition = { id: 'qa-vanilla', name: 'QA', cardType: 'WRESTLER', cost: 1, attack: 2, health: 3, rulesText: '', keywords: [], abilities: [], isToken: false, isChampionToken: false };
function setup(relics?: TowerBattleContext['relics']) {
  const deck = Array(25).fill(vanilla.id);
  const initial = startGame(createInitialGameState([TEST_CHAMPIONS[1]!.id, TEST_CHAMPIONS[1]!.id], [vanilla], TEST_CHAMPIONS, [deck, deck], { randomSeed: 1 }), () => 0.5);
  return { ...initial, ...(relics ? { tower: { playerId: 'player-1', relics } } : {}), players: initial.players.map(player => ({ ...player, currentGold: 6 })) };
}
const one = { id: 'one', effectType: 'MAX_FIELD_ONE' as const, values: {} };
const two = { id: 'two', effectType: 'MAX_FIELD_TWO' as const, values: {} };
test('왕의 자리 applies entry stats and rejects second play in real legal actions before paying', () => {
  const state = setup([one]);
  const result = executeAction(state, { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: state.players[0]!.hand[0]!.instanceId, boardSlot: 0 });
  assert.equal(result.success, true);
  const card = result.state.players[0]!.board[0]!;
  assert.equal(card.currentAttack, 6); assert.equal(card.currentHealth, 7);
  assert.ok(getLegalActions(result.state, 'player-1').every(action => action.type !== 'PLAY_WRESTLER'));
  const rejected = executeAction(result.state, { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: result.state.players[0]!.hand[0]!.instanceId, boardSlot: 1 });
  assert.equal(rejected.success, false); assert.deepEqual(rejected.state, result.state);
});
test('소수 정예 caps effect summons and combines with the stricter one-slot relic', () => {
  for (const relics of [[two], [one, two]]) {
    const state = setup(relics);
    const source = state.players[0]!.hand[0]!;
    const result = applyEffect(state, 'player-1', source, { type: 'STRUCTURED', action: 'SUMMON', values: { definition: vanilla, count: 4 } });
    const field = result.players[0]!.board.filter(Boolean);
    assert.equal(field.length, relics.length === 1 ? 2 : 1);
    assert.equal(field[0]!.currentAttack, relics.length === 1 ? 4 : 8);
  }
});
test('field restriction never consumes a blocked hand summon or graveyard revival', () => {
  const initial = setup([one]);
  const played = executeAction(initial, { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: initial.players[0]!.hand[0]!.instanceId, boardSlot: 0 });
  assert.equal(played.success, true);
  const source = played.state.players[0]!.board[0]!;
  const fromHand = applyEffect(played.state, 'player-1', source, { type: 'STRUCTURED', action: 'SUMMON_FROM_HAND', values: { definitionRef: { id: vanilla.id } } });
  assert.deepEqual(fromHand.players[0]!.hand, played.state.players[0]!.hand);
  const dead = generateCardInstance(vanilla, { instanceId: 'dead' });
  const state = { ...fromHand, players: fromHand.players.map((p, i) => i === 0 ? { ...p, graveyard: [dead] } : p) };
  const revived = applyEffect(state, 'player-1', source, { type: 'STRUCTURED', action: 'REVIVE', target: { zone: 'GRAVEYARD', owner: 'SELF', selection: 'ALL', count: 1 } });
  assert.deepEqual(revived.players[0]!.graveyard, [dead]);
});
test('absent Tower context preserves four slots and normal card stats', () => {
  const state = setup();
  const result = applyEffect(state, 'player-1', state.players[0]!.hand[0]!, { type: 'STRUCTURED', action: 'SUMMON', values: { definition: vanilla, count: 4 } });
  assert.equal(result.players[0]!.board.filter(Boolean).length, 4);
  assert.equal(result.players[0]!.board[0]!.currentAttack, 2);
  assert.equal(result.players[0]!.board[0]!.currentHealth, 3);
});
test('relic health penalties centrally stop at one without mutating the input', () => {
  const card = generateCardInstance(vanilla, { instanceId: 'hp' });
  assert.equal(applyRelicHealthPenalty({ ...card, currentHealth: 1 }, 10).currentHealth, 1);
  assert.equal(applyRelicHealthPenalty(card, 10).currentHealth, 1);
  assert.equal(card.currentHealth, 3);
  assert.throws(() => applyRelicHealthPenalty(card, Infinity));
});
test('입장권 discount makes the first play legal and enforces its turn summon limit', () => {
  const initial = setup([{ id: 'ticket', effectType: 'FIRST_SUMMON_COST_DOWN_LIMIT', values: {} }]);
  const state = { ...initial, players: initial.players.map((p, i) => i === 0 ? { ...p, currentGold: 0 } : p) };
  const cardId = state.players[0]!.hand[0]!.instanceId;
  assert.ok(getLegalActions(state, 'player-1').some(action => action.type === 'PLAY_WRESTLER'));
  const played = executeAction(state, { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: cardId, boardSlot: 0 });
  assert.equal(played.success, true); assert.equal(played.state.players[0]!.currentGold, 0);
  assert.ok(getLegalActions(played.state, 'player-1').every(action => action.type !== 'PLAY_WRESTLER'));
  const ended = endTurn(played.state, 'player-1'); assert.equal(ended.success, true);
  const back = endTurn(ended.state, 'player-2'); assert.equal(back.success, true);
  assert.ok(getLegalActions(back.state, 'player-1').some(action => action.type === 'PLAY_WRESTLER'));
});
test('선봉장의 깃발 buffs only first entry and expires at turn end', () => {
  const state = setup([{ id: 'flag', effectType: 'FIRST_SUMMON_TEMP_ATK', values: {} }]);
  const first = executeAction(state, { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: state.players[0]!.hand[0]!.instanceId, boardSlot: 0 });
  const second = executeAction(first.state, { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: first.state.players[0]!.hand[0]!.instanceId, boardSlot: 1 });
  assert.equal(second.state.players[0]!.board[0]!.currentAttack, 5);
  assert.equal(second.state.players[0]!.board[1]!.currentAttack, 2);
  const ended = endTurn(second.state, 'player-1');
  assert.equal(ended.success, true); assert.equal(ended.state.players[0]!.board[0]!.currentAttack, 2);
});
test('폭주 티켓 blocks a Rush attack; active obeys entry cooldown and is usable next own turn', () => {
  const initial = setup([{ id: 'rush-ticket', effectType: 'FIRST_SUMMON_COST_DOWN_NO_ATTACK', values: {} }]);
  const rush = { ...initial.players[0]!.hand[0]!, keywords: ['RUSH' as const], abilities: [{ trigger: 'ACTIVE' as const, effects: [{ type: 'GAIN_GOLD' as const, amount: 1 }] }] };
  const state = { ...initial, players: initial.players.map((p, i) => i === 0 ? { ...p, hand: [rush, ...p.hand.slice(1)] } : p) };
  const played = executeAction(state, { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: rush.instanceId, boardSlot: 0 });
  assert.equal(played.success, true); assert.equal(played.state.players[0]!.currentGold, 6);
  const attack = executeAction(played.state, { type: 'ATTACK', playerId: 'player-1', attackerInstanceId: rush.instanceId, target: { type: 'PLAYER', playerId: 'player-2' } });
  assert.equal(attack.success, false);
  assert.ok(getLegalActions(played.state, 'player-1').every(action => action.type !== 'ATTACK'));
  const action = { type: 'USE_ACTIVE' as const, playerId: 'player-1', cardInstanceId: rush.instanceId };
  assert.equal(executeAction(played.state, action).success, false);
  const opponent = endTurn(played.state, 'player-1'); assert.ok(opponent.success);
  const ready = endTurn(opponent.state, 'player-2'); assert.ok(ready.success);
  const active = executeAction(ready.state, action);
  assert.equal(active.success, true); assert.equal(active.state.players[0]!.currentGold, ready.state.players[0]!.currentGold + 1);
});
test('first-entry temporary attack also expires when summoned during the opponent turn', () => {
  const initial = setup([{ id: 'flag', effectType: 'FIRST_SUMMON_TEMP_ATK', values: {} }]);
  const next = endTurn(initial, 'player-1'); assert.equal(next.success, true);
  const summoned = applyEffect(next.state, 'player-1', next.state.players[0]!.hand[0]!, { type: 'STRUCTURED', action: 'SUMMON', values: { definition: vanilla, count: 1 } });
  assert.equal(summoned.players[0]!.board[0]!.currentAttack, 5);
  const ended = endTurn(summoned, 'player-2'); assert.equal(ended.success, true);
  assert.equal(ended.state.players[0]!.board[0]!.currentAttack, 2);
});
test('turn-end summons do not carry this-turn relic attack into the next turn', () => {
  const initial = setup([{ id: 'flag', effectType: 'FIRST_SUMMON_TEMP_ATK', values: {} }]);
  const source = { ...generateCardInstance(vanilla, { instanceId: 'turn-end-source' }), boardSlot: 0 as const,
    abilities: [{ trigger: 'TURN_END' as const, effects: [{ type: 'STRUCTURED' as const, action: 'SUMMON' as const, values: { definition: vanilla, count: 1 } }] }] };
  const state = { ...initial, players: initial.players.map((player, index) => index === 0 ? { ...player, board: [source, null, null, null] as typeof player.board } : player) };
  const ended = endTurn(state, 'player-1'); assert.equal(ended.success, true);
  assert.equal(ended.state.players[0]!.board.filter(Boolean).length, 2);
  assert.equal(ended.state.players[0]!.board[1]!.currentAttack, 2);
});
test('빈자리의 왕관 applies first-entry buff and prohibits additional summons for that turn', () => {
  const state = setup([{ id: 'empty', effectType: 'EMPTY_FIELD_FIRST_SUMMON_BUFF', values: {} }]);
  const played = executeAction(state, { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: state.players[0]!.hand[0]!.instanceId, boardSlot: 0 });
  assert.equal(played.success, true); assert.equal(played.state.players[0]!.board[0]!.currentAttack, 5);
  assert.equal(played.state.players[0]!.board[0]!.currentHealth, 6);
  const summoned = applyEffect(played.state, 'player-1', played.state.players[0]!.board[0]!, { type: 'STRUCTURED', action: 'SUMMON', values: { definition: vanilla, count: 3 } });
  assert.equal(summoned.players[0]!.board.filter(Boolean).length, 1);
});
