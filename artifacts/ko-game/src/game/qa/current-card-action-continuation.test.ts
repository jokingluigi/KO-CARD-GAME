import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { chooseBestAction } from '../actions/ai-evaluator';
import { executeAction, getLegalActions } from '../actions/engine-actions';
import { cardRecordToDefinition, type PublishedCardRecord } from '../cards/published-cards';
import { prepareAdminCardTest } from '../engine/admin-card-test';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { enterField } from '../engine/enter-field';
import type { GameState } from '../types/game-state';

const records = JSON.parse(readFileSync(new URL('./fixtures/cards-2026-10-04.json', import.meta.url), 'utf8')) as PublishedCardRecord[];
const definitions = records.map(cardRecordToDefinition);

function checkState(state: GameState) {
  for (const player of state.players) {
    assert.ok(Number.isFinite(player.health));
    assert.ok(Number.isFinite(player.currentGold));
    for (const card of [...player.hand, ...player.deck, ...player.graveyard, ...player.board.filter(card => card !== null)]) {
      for (const value of [card.currentAttack, card.currentHealth, card.maxHealth, card.currentCost]) {
        assert.ok(Number.isFinite(value), `${card.name}: finite runtime stats`);
      }
    }
  }
  if (state.targetingState?.active) assert.ok(state.targetingState.validTargetIds.length, 'pending choice must have a legal target');
}

// Unlike the single-use test, continue real turns and AI choices after the card
// resolves. Serialize between actions to exercise the online-state boundary.
for (const definition of definitions) test(`current card continues through AI actions and turn triggers: ${definition.name}`, () => {
  const base = createInitialGameState();
  base.cardPool = definitions;
  base.status = 'IN_PROGRESS';
  base.activePlayerId = 'player-1';
  base.turn = 3;
  let state = prepareAdminCardTest(base, definition);
  const card = state.players[0]!.hand[0]!;
  if (definition.isChampionToken) {
    state.players[0]!.hand.shift();
    state = enterField(state, 'player-1', card, 0, undefined, undefined, 'CHAMPION_DEPLOY');
  } else if (!['DEATH', '지뢰닷!!!'].includes(definition.contentRule ?? '')) {
    const result = executeAction(state, definition.cardType === 'TECHNIQUE'
      ? { type: 'PLAY_TECHNIQUE', playerId: 'player-1', cardInstanceId: card.instanceId }
      : { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: card.instanceId, boardSlot: 0 });
    assert.ok(result.success, definition.name);
    state = result.state;
  }
  let choicesInRow = 0;
  let actions = 0;
  const recent: string[] = [];
  while (state.status === 'IN_PROGRESS' && state.turn < 9) {
    assert.ok(actions++ < 160, `six turns must make progress: ${recent.join(' / ')}`);
    checkState(state);
    state = JSON.parse(JSON.stringify(state)) as GameState;
    const playerId = state.targetingState?.active ? state.targetingState.playerId : state.activePlayerId;
    const legal = getLegalActions(state, playerId);
    assert.ok(legal.length, `${definition.name}: no deadlock`);
    const action = chooseBestAction(state, legal, playerId, 'NORMAL');
    recent.push(JSON.stringify({ turn: state.turn, action }));
    if (recent.length > 8) recent.shift();
    assert.ok(legal.includes(action), 'AI returns an authoritative legal action');
    choicesInRow = action.type === 'SELECT_EFFECT_TARGET' ? choicesInRow + 1 : 0;
    assert.ok(choicesInRow < 30, 'target selections must resolve');
    const result = executeAction(state, action);
    assert.ok(result.success, `${definition.name}: ${JSON.stringify(action)} ${JSON.stringify(result.error)}`);
    state = result.state;
  }
  checkState(state);
  assert.deepEqual([definition.cost, definition.attack, definition.health], [records.find(record => record.id === definition.id)!.cost, records.find(record => record.id === definition.id)!.attack, records.find(record => record.id === definition.id)!.health]);
});

for (const name of ['매드 펌킨', '하녀 판도라']) {
  for (const difficulty of [undefined, 'NORMAL', 'HARD', 'BOSS'] as const) {
    test(`AI finishes ${name} target instead of replay/refund loop: ${difficulty ?? 'legacy'}`, () => {
      const definition = definitions.find(card => card.name === name)!;
      const base = createInitialGameState();
      Object.assign(base, { cardPool: definitions, status: 'IN_PROGRESS', activePlayerId: 'player-1', turn: 3 });
      const state = prepareAdminCardTest(base, definition);
      const card = state.players[0]!.hand[0]!;
      const played = executeAction(state, { type: 'PLAY_WRESTLER', playerId: 'player-1', cardInstanceId: card.instanceId, boardSlot: 0 });
      assert.ok(played.success);
      assert.ok(played.state.targetingState?.active);
      const legal = getLegalActions(played.state, 'player-1');
      assert.ok(legal.some(action => action.type === 'CANCEL_EFFECT_TARGET'), 'human cancellation remains legal');
      const chosen = chooseBestAction(played.state, legal, 'player-1', difficulty);
      assert.ok(['SELECT_EFFECT_TARGET', 'CONFIRM_PRECOMMIT_TARGET'].includes(chosen.type));
      const resolved = executeAction(played.state, chosen);
      assert.ok(resolved.success);
      assert.ok(!resolved.state.targetingState?.active);
      assert.ok(!resolved.state.players[0]!.hand.some(candidate => candidate.instanceId === card.instanceId));
    });
  }
}
