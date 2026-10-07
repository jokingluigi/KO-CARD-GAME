import assert from 'node:assert/strict';
import test from 'node:test';
import { championRecordToDefinition, type PublishedChampionRecord } from './published-champions';
import { TEST_CHAMPIONS } from './test-champions';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { useChampionAbility } from '../engine/champion-system';
import { applyEffect, resolveCardRetiredListeners } from '../effects/effect-engine';
import { processChampionQuestEvents } from './quests';
import type { CardEffect } from '../effects/types';
function setup(upgraded = false) {
  const def = championRecordToDefinition({ id: 'calavera', name: '챔피언 라 칼라베라', maxHealth: 25, abilityCost: 2,
    abilityName: '좀비 소환', abilityEffects: {}, status: 'PUBLISHED', version: 1 } as PublishedChampionRecord);
  const other = TEST_CHAMPIONS[0];
  const state = createInitialGameState([def.id, other.id], undefined, [def, other]);
  state.status = 'IN_PROGRESS'; state.activePlayerId = 'player-1'; state.players[0].currentGold = 20;
  state.players[0].champion!.questCompleted = upgraded;
  return state;
}
function summon(state: ReturnType<typeof setup>) {
  state.players[0].championAbilityUsedThisTurn = false;
  const result = useChampionAbility(state, 'player-1'); assert.ok(result.success); return result.state;
}
function damage(state: ReturnType<typeof setup>, owner: 'SELF' | 'ENEMY', action: 'DAMAGE' | 'DESTROY' = 'DAMAGE') {
  const effect: CardEffect = { type: 'STRUCTURED', action, target: { zone: 'BOARD', owner, selection: 'ALL', count: 4 }, values: { amount: 99 } };
  return processChampionQuestEvents(state, applyEffect(state, 'player-1', state.players[0].deck[0], effect));
}
for (const upgraded of [false, true]) test(`Calavera ${upgraded ? 'upgraded' : 'base'} summons and merges exact stats`, () => {
  const amount = upgraded ? 2 : 1;
  const first = summon(setup(upgraded)); const zombie = first.players[0].board.find(c => c)!;
  assert.equal(zombie.currentCost, 1); assert.equal(zombie.currentAttack, amount); assert.equal(zombie.currentHealth, amount);
  const second = summon(first); const merged = second.players[0].board.find(c => c)!;
  assert.equal(second.players[0].board.filter(Boolean).length, 1); assert.equal(merged.instanceId, zombie.instanceId);
  assert.equal(merged.currentAttack, amount * 2); assert.equal(merged.currentHealth, amount * 2);
  assert.equal(second.events.filter(e => e.type === 'ENTER_FIELD').length, 1);
});
test('full field can merge into the existing zombie', () => {
  const state = summon(setup());
  for (const slot of [1, 2, 3] as const) state.players[0].board[slot] = { ...state.players[0].deck[slot], instanceId: `ally-${slot}`, boardSlot: slot, keywords: [], abilities: [] };
  const result = summon(state); assert.equal(result.players[0].board[0]?.currentAttack, 2); assert.equal(result.players[0].board.filter(Boolean).length, 4);
});
test('all retirements grow zombies but only allied retirements advance Calavera quest; DESTROY does neither', () => {
  let state = summon(setup());
  const enemy = { ...state.players[1].deck[0], instanceId: 'enemy', cardType: 'WRESTLER' as const, currentHealth: 1, maxHealth: 1, boardSlot: 0 as const, keywords: [], abilities: [] };
  state.players[1].board[0] = enemy;
  state = damage(state, 'ENEMY'); assert.equal(state.players[0].board[0]?.currentAttack, 2); assert.equal(state.players[0].champion?.questProgress, 0);
  state.players[1].board[0] = { ...enemy, instanceId: 'destroyed' };
  state = damage(state, 'ENEMY', 'DESTROY'); assert.equal(state.players[0].board[0]?.currentAttack, 2); assert.equal(state.players[0].champion?.questProgress, 0);
  state.players[0].board[1] = { ...enemy, instanceId: 'ally', boardSlot: 1 };
  const previous = state;
  state = applyEffect(state, 'player-1', state.players[0].deck[0], { type: 'STRUCTURED', action: 'DAMAGE', target: { zone: 'BOARD', owner: 'SELF', selection: 'PLAYER_CHOICE', count: 1 }, values: { amount: 1 } }, ['ally']);
  state = processChampionQuestEvents(previous, state);
  assert.equal(state.players[0].board[0]?.currentAttack, 3); assert.equal(state.players[0].champion?.questProgress, 1);
  const replay = resolveCardRetiredListeners(state, 'player-1', previous.players[0].board[1]!);
  assert.equal(replay.players[0].board[0]?.currentAttack, 3);
});
test('tenth allied retirement upgrades once; dead zombie cannot grow itself', () => {
  const state = summon(setup()); state.players[0].champion!.questProgress = 9;
  const result = damage(state, 'SELF'); assert.equal(result.players[0].board[0], null);
  assert.equal(result.players[0].champion?.questProgress, 10); assert.equal(result.players[0].champion?.questCompleted, true);
  assert.equal(result.events.filter(e => e.type === 'CHAMPION_QUEST_COMPLETED').length, 1);
  const after = summon(result); assert.equal(after.players[0].board[0]?.currentAttack, 2); assert.equal(after.players[0].board[0]?.currentHealth, 2);
});
test('silence suppresses zombie retirement growth', () => {
  const state = summon(setup()); state.players[0].board[0]!.isSilenced = true;
  state.players[1].board[0] = { ...state.players[1].deck[0], instanceId: 'enemy', cardType: 'WRESTLER', currentHealth: 1, boardSlot: 0, keywords: [], abilities: [] };
  assert.equal(damage(state, 'ENEMY').players[0].board[0]?.currentAttack, 1);
});
