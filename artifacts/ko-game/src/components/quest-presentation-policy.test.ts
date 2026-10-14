import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canPresentBattleQuest } from './quest-presentation-policy';
import { championRecordToDefinition } from '../game/champions/published-champions';
import { cardRecordToDefinition } from '../game/cards/published-cards';
import { createInitialGameState } from '../game/engine/create-initial-game-state';
import { generateCardInstance } from '../game/cards/generation';
import { executeAction } from '../game/actions/engine-actions';

const cards = JSON.parse(readFileSync('docs/qa/snapshots/20261014-admin/cards.json', 'utf8')).map(cardRecordToDefinition);
const champions = JSON.parse(readFileSync('docs/qa/snapshots/20261014-admin/champions.json', 'utf8'));
const crusader = championRecordToDefinition(champions.find((c: {name: string}) => c.name.includes('크루세이더')));
for (const damage of [1, 6, 10]) test(`actual Crusader champion hit ${damage}: quest presentation only before lethal defeat`, () => {
  const state = createInitialGameState(undefined, cards);
  state.status = 'IN_PROGRESS'; state.turn = 3; state.activePlayerId = 'player-2';
  state.players[0].health = 6; state.players[0].maxHealth = 25;
  state.players[0].champion = {...state.players[0].champion!, ...crusader, health: 6, questProgress: 0, questCompleted: false};
  state.players[0].board = [null, null, null, null];
  const unit = {...cards.find((c: {name: string}) => c.name === '초보 모험가')!, attack: damage, abilities: [], keywords: []};
  state.players[1].board = [{...generateCardInstance(unit, {instanceId: 'attacker'}), boardSlot: 0, enteredThisTurn: false}, null, null, null];
  const result = executeAction(state, {type: 'ATTACK', playerId: 'player-2', attackerInstanceId: 'attacker', target: {type: 'PLAYER', playerId: 'player-1'}});
  assert.equal(result.success, true);
  assert.equal(canPresentBattleQuest(result.state), damage === 1);
  if (damage === 1) {
    assert.equal(result.state.players[0].health, 5);
    assert.equal(result.state.players[0].champion?.questCompleted, true);
  } else {
    assert.equal(result.state.status, 'FINISHED');
    assert.equal(result.state.loserId, 'player-1');
  }
});
test('terminal state and zero-HP transition both suppress old completed quest cues', () => {
  const state = createInitialGameState(); state.status = 'IN_PROGRESS';
  assert.equal(canPresentBattleQuest(state), true);
  state.players[0].health = 0;
  assert.equal(canPresentBattleQuest(state), false);
  state.players[0].health = 20; state.status = 'FINISHED';
  assert.equal(canPresentBattleQuest(state), false);
});
