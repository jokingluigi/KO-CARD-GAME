import assert from 'node:assert/strict';
import test from 'node:test';
import { championRecordToDefinition, type PublishedChampionRecord } from './published-champions';
import { TEST_CHAMPIONS } from './test-champions';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { useChampionAbility } from '../engine/champion-system';
import { applyEffect, selectEffectTarget } from '../effects/effect-engine';
import { processChampionQuestEvents } from './quests';

function fixture(upgraded = false) {
  const definition = championRecordToDefinition({ id: 'purple', name: '챔피언 퍼플레인', maxHealth: 25,
    abilityCost: 2, abilityName: '자해', abilityEffects: {}, status: 'PUBLISHED', version: 1,
  } as PublishedChampionRecord);
  const other = TEST_CHAMPIONS[0];
  const state = createInitialGameState([definition.id, other.id], undefined, [definition, other]);
  state.status = 'IN_PROGRESS'; state.activePlayerId = 'player-1'; state.players[0].currentGold = 10;
  state.players[0].champion!.questCompleted = upgraded;
  state.players[0].board[0] = { ...state.players[0].deck[1], instanceId: 'ally', cardType: 'WRESTLER',
    currentHealth: 10, maxHealth: 10, currentAttack: 3, boardSlot: 0, keywords: [], abilities: [] };
  return state;
}
for (const upgraded of [false, true]) {
  const amount = upgraded ? 2 : 1;
  test(`Purple Rain portrait ${amount}: damage, draw and discount only the drawn card`, () => {
    const state = fixture(upgraded); const oldHand = state.players[0].hand;
    const drawn = state.players[0].deck[0]; const health = state.players[0].health;
    const start = useChampionAbility(state, 'player-1'); assert.ok(start.success); if (!start.success) return;
    assert.deepEqual(start.state.targetingState?.validTargetIds, ['player-1', 'ally']);
    assert.equal(selectEffectTarget(start.state, 'player-2'), start.state);
    const result = processChampionQuestEvents(state, selectEffectTarget(start.state, 'player-1'));
    assert.equal(result.players[0].health, health - amount);
    assert.equal(result.players[0].hand.find(c => c.instanceId === drawn.instanceId)?.currentCost, Math.max(0, drawn.currentCost - amount));
    for (const c of oldHand) assert.equal(result.players[0].hand.find(x => x.instanceId === c.instanceId)?.currentCost, c.currentCost);
    assert.equal(result.players[0].champion?.questProgress, upgraded ? 0 : 1);
  });
  test(`Purple Rain wrestler ${amount}: damage and attack buff`, () => {
    const state = fixture(upgraded); const start = useChampionAbility(state, 'player-1'); assert.ok(start.success); if (!start.success) return;
    const result = processChampionQuestEvents(state, selectEffectTarget(start.state, 'ally'));
    assert.equal(result.players[0].board[0]?.currentHealth, 10 - amount);
    assert.equal(result.players[0].board[0]?.currentAttack, 3 + amount);
    assert.equal(result.players[0].hand.length, state.players[0].hand.length);
  });
}
test('self card damage counts recipients, not damage amount; eighth hit upgrades once', () => {
  const state = fixture(); state.players[0].champion!.questProgress = 6;
  const source = state.players[0].deck[0];
  const hit = applyEffect(state, 'player-1', source, { type: 'STRUCTURED', action: 'DAMAGE', target: { zone: 'CHARACTER', owner: 'SELF', selection: 'ALL', count: 1 }, values: { amount: 2 } });
  const result = processChampionQuestEvents(state, hit);
  assert.equal(result.players[0].champion?.questProgress, 8);
  assert.equal(result.players[0].champion?.questCompleted, true);
  assert.equal(result.events.filter(e => e.type === 'CHAMPION_QUEST_COMPLETED').length, 1);
  assert.equal(processChampionQuestEvents(state, result).events.length, result.events.length);
});
test('enemy effects, combat, fatigue and zero damage are excluded', () => {
  const state = fixture();
  const event = { type: 'DAMAGE_DEALT' as const, playerId: 'player-1', target: { type: 'PLAYER' as const, playerId: 'player-1' }, amount: 2 };
  const next = { ...state, events: [...state.events,
    { ...event, sourceContext: { sourcePlayerId: 'player-2', sourceActionType: 'CARD_EFFECT' } },
    { ...event, sourceContext: { sourcePlayerId: 'player-1', sourceActionType: 'ATTACK' } },
    { ...event, reason: 'FATIGUE' },
    { ...event, amount: 0, sourceContext: { sourcePlayerId: 'player-1', sourceActionType: 'CARD_EFFECT' } },
  ] };
  assert.equal(processChampionQuestEvents(state, next).players[0].champion?.questProgress, 0);
});
test('empty deck discounts no existing card and fatigue is not another quest hit', () => {
  const state = fixture(); state.players[0].deck = [];
  const start = useChampionAbility(state, 'player-1'); assert.ok(start.success); if (!start.success) return;
  const result = processChampionQuestEvents(state, selectEffectTarget(start.state, 'player-1'));
  assert.deepEqual(result.players[0].hand, state.players[0].hand);
  assert.equal(result.players[0].champion?.questProgress, 1);
});
test('immune allies cannot be chosen; defense blocks quest damage but still grants the buff', () => {
  const state = fixture(); state.players[0].board[0]!.keywords = ['IMMUNE'];
  const immune = useChampionAbility(state, 'player-1'); assert.ok(immune.success); if (!immune.success) return;
  assert.deepEqual(immune.state.targetingState?.validTargetIds, ['player-1']);
  state.players[0].board[0]!.keywords = ['DEFENSE']; state.players[0].board[0]!.enteredOnTurn = state.turn;
  const start = useChampionAbility(state, 'player-1'); assert.ok(start.success); if (!start.success) return;
  const result = processChampionQuestEvents(state, selectEffectTarget(start.state, 'ally'));
  assert.equal(result.players[0].board[0]?.currentHealth, 10);
  assert.equal(result.players[0].board[0]?.currentAttack, 4);
  assert.equal(result.players[0].champion?.questProgress, 0);
});
test('lethal portrait damage ends the game without drawing; lethal ally damage counts once', () => {
  const state = fixture(); state.players[0].health = 1; state.players[0].champion!.health = 1;
  const start = useChampionAbility(state, 'player-1'); assert.ok(start.success); if (!start.success) return;
  const result = selectEffectTarget(start.state, 'player-1');
  assert.equal(result.status, 'FINISHED'); assert.equal(result.players[0].deck.length, state.players[0].deck.length);
  const allyState = fixture(); allyState.players[0].board[0]!.currentHealth = 1;
  const allyStart = useChampionAbility(allyState, 'player-1'); assert.ok(allyStart.success); if (!allyStart.success) return;
  const allyResult = processChampionQuestEvents(allyState, selectEffectTarget(allyStart.state, 'ally'));
  assert.equal(allyResult.players[0].board[0], null); assert.equal(allyResult.players[0].champion?.questProgress, 1);
});
test('a full hand burns the drawn card without discounting another card', () => {
  const state = fixture(); state.players[0].hand = Array.from({ length: 10 }, (_, i) => ({ ...state.players[0].deck[1], instanceId: `hand-${i}` }));
  const drawn = state.players[0].deck[0]; const start = useChampionAbility(state, 'player-1'); assert.ok(start.success); if (!start.success) return;
  const result = selectEffectTarget(start.state, 'player-1');
  assert.ok(!result.players[0].hand.some(c => c.instanceId === drawn.instanceId));
  assert.deepEqual(result.players[0].hand, state.players[0].hand);
});
