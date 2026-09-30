import assert from 'node:assert/strict';
import test from 'node:test';
import { createTowerSandbox, parseTowerSandboxSetup, type TowerSandboxSetup } from './tower-sandbox';
import { TEST_CARD_DEFINITIONS } from '../game/cards/test-cards';
import { TEST_CHAMPIONS } from '../game/champions/test-champions';
import { executeAction, getLegalActions } from '../game/actions/engine-actions';
import { chooseBestAction } from '../game/actions/ai-evaluator';

const cards = TEST_CARD_DEFINITIONS.map((card, index) => ({ ...card, id: `qa-sandbox-${index}`, status: 'PUBLISHED' as const }));
const deck = Array.from({ length: 25 }, (_, index) => cards[index % cards.length]!.id);
const setup: TowerSandboxSetup = { floor: 4, seed: 'sandbox-seed', championId: TEST_CHAMPIONS[0]!.id, enemyChampionId: TEST_CHAMPIONS[1]!.id, playerDeck: deck, enemyDeck: [...deck] };
test('admin sandbox rejects incomplete decks, invalid floors and unavailable cards', () => {
  for (const invalid of [{ ...setup, floor: 0 }, { ...setup, floor: 17 }, { ...setup, floor: 1.5 }, { ...setup, playerDeck: deck.slice(1) }, { ...setup, seed: '' }])
    assert.throws(() => parseTowerSandboxSetup(invalid));
  assert.throws(() => createTowerSandbox({ ...setup, playerDeck: Array(25).fill('missing') }, cards, TEST_CHAMPIONS));
  assert.throws(() => createTowerSandbox(setup, cards.map(card => ({ ...card, status: 'DRAFT' })), TEST_CHAMPIONS));
});
test('sandbox reuses Tower initialization and completes without changing its selected deck', () => {
  const saved = JSON.stringify(setup);
  let state = createTowerSandbox(setup, cards, TEST_CHAMPIONS);
  assert.deepEqual(state, createTowerSandbox(JSON.parse(saved), cards, TEST_CHAMPIONS));
  for (const playerId of ['player-2', 'player-1']) {
    const result = executeAction(state, { type: 'MULLIGAN', playerId, cardInstanceIds: [] });
    assert.equal(result.success, true); state = result.state;
  }
  let steps = 0;
  while (state.status === 'IN_PROGRESS' && steps++ < 600) {
    const result = executeAction(state, chooseBestAction(state, getLegalActions(state, state.activePlayerId), state.activePlayerId));
    assert.equal(result.success, true); state = result.state;
  }
  assert.equal(state.status, 'FINISHED');
  assert.equal(JSON.stringify(setup), saved);
  assert.notDeepEqual(createTowerSandbox({ ...setup, seed: 'different-seed' }, cards, TEST_CHAMPIONS).players[0]!.deck,
    createTowerSandbox(setup, cards, TEST_CHAMPIONS).players[0]!.deck);
});
test('admin sandbox attaches chosen relic rules before battle and rejects unknown types', () => {
  assert.throws(() => createTowerSandbox({ ...setup, relicTypes: ['INVALID' as never] }, cards, TEST_CHAMPIONS));
  const state = createTowerSandbox({ ...setup, relicTypes: ['MAX_FIELD_ONE'] }, cards, TEST_CHAMPIONS);
  assert.equal(state.tower?.relics[0]?.effectType, 'MAX_FIELD_ONE');
  let ready = state;
  for (const playerId of ['player-1', 'player-2']) {
    const result = executeAction(ready, { type: 'MULLIGAN', playerId, cardInstanceIds: [] });
    assert.equal(result.success, true); ready = result.state;
  }
  const player = ready.players[0]!;
  ready = { ...ready, players: ready.players.map((p, i) => i === 0 ? { ...p, currentGold: 6 } : p) };
  const played = executeAction(ready, { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: player.hand[0]!.instanceId, boardSlot: 0 });
  assert.equal(played.success, true);
  assert.ok(getLegalActions(played.state, 'player-1').every(action => action.type !== 'PLAY_WRESTLER'));
});
