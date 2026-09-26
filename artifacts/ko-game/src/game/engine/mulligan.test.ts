import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGameState } from './create-initial-game-state';
import { endTurn, startGame } from './turn-system';
import { executeAction, getLegalActions } from '../actions/engine-actions';

test('opening exchange replaces only selected cards without draw triggers or revealing the hand', () => {
  const started = startGame(createInitialGameState(), () => 0.5);
  const player = started.players[0]!;
  const selected = player.hand[1]!.instanceId;
  const nextCard = player.deck[0]!.instanceId;
  const initialDraws = started.events.filter((event) => event.type === 'CARD_DRAWN').length;
  const result = executeAction(started, { type: 'MULLIGAN', playerId: player.id, cardInstanceIds: [selected] });
  assert.equal(result.success, true);
  const updated = result.state.players[0]!;
  assert.equal(updated.hand.length, player.hand.length);
  assert.ok(updated.hand.some((card) => card.instanceId === nextCard));
  assert.ok(!updated.hand.some((card) => card.instanceId === selected));
  assert.equal(updated.deck.at(-1)?.instanceId, selected);
  assert.equal(result.state.events.filter((event) => event.type === 'CARD_DRAWN').length, initialDraws);
  assert.equal(result.state.events.at(-1)?.amount, 1);
  assert.ok(!getLegalActions(result.state, player.id).some((action) => action.type === 'MULLIGAN'));
});

test('opening exchange validates ownership, duplicates and first-turn timing', () => {
  const started = startGame(createInitialGameState(), () => 0.5);
  const id = started.players[0]!.hand[0]!.instanceId;
  assert.equal(executeAction(started, { type: 'MULLIGAN', playerId: 'player-1', cardInstanceIds: [id, id] }).success, false);
  assert.equal(executeAction(started, { type: 'MULLIGAN', playerId: 'player-1', cardInstanceIds: ['missing'] }).success, false);
  assert.equal(executeAction(started, { type: 'MULLIGAN', playerId: 'player-2', cardInstanceIds: [] }).success, false);
  const afterTurn = endTurn(started, 'player-1');
  assert.equal(afterTurn.success, true);
  assert.equal(executeAction(afterTurn.state, { type: 'MULLIGAN', playerId: 'player-2', cardInstanceIds: [] }).success, true);
  assert.equal(executeAction(afterTurn.state, { type: 'MULLIGAN', playerId: 'player-1', cardInstanceIds: [] }).success, false);
});
