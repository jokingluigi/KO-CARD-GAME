import assert from 'node:assert/strict';
import test from 'node:test';
import type { CardDefinition, CardInstance } from '../cards/types';
import type { GameState } from '../types/game-state';
import type { RelicType } from '../../../../../lib/game-engine/src/tower/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { startGame, endTurn } from '../engine/turn-system';
import { generateCardInstance } from '../cards/generation';
import { TEST_CHAMPIONS } from '../champions/test-champions';
import { applyEffect, resolveStateBasedDeaths } from '../effects/effect-engine';
import { destroyCard } from '../engine/destroy-card';
import { attack } from '../engine/combat';
import { enterField } from '../engine/enter-field';
import { processChampionQuestEvents } from '../champions/quests';
import { refreshTowerAuras, resolveTowerRemoval } from './relics';

const vanilla: CardDefinition = { id: 'tower-qa', name: 'QA', cardType: 'WRESTLER', cost: 1, attack: 2, health: 5, rulesText: '', keywords: [], abilities: [], isToken: false, isChampionToken: false };
const make = (id: string, attack = 2, health = 5): CardInstance => ({ ...generateCardInstance({ ...vanilla, attack, health }, { instanceId: id }), enteredThisTurn: false });
function setup(types: RelicType[], allies: CardInstance[] = [make('a')], enemies: CardInstance[] = [make('e')]): GameState {
  const deck = Array(25).fill(vanilla.id);
  const initial = startGame(createInitialGameState([TEST_CHAMPIONS[1]!.id, TEST_CHAMPIONS[1]!.id], [vanilla], TEST_CHAMPIONS, [deck, deck], { randomSeed: 32 }), () => 0.5);
  return refreshTowerAuras({ ...initial, tower: { playerId: 'player-1', relics: types.map(effectType => ({ id: effectType, effectType, values: {} })) },
    players: initial.players.map((p, i) => ({ ...p, currentGold: 6, board: Array.from({ length: 4 }, (_, slot) => {
      const card = (i === 0 ? allies : enemies)[slot]; return card ? { ...card, boardSlot: slot as 0 | 1 | 2 | 3 } : null;
    }) as typeof p.board })) });
}
function effect(state: GameState, action: 'DAMAGE' | 'RETIRE' | 'DESTROY', id: string, amount = 20) {
  const owner = state.players.find(p => p.board.some(c => c?.instanceId === id))!;
  return applyEffect(state, 'player-1', state.players[0]!.board.find(Boolean) ?? make('source'), {
    type: 'STRUCTURED', action, target: { zone: 'BOARD', owner: owner.id === 'player-1' ? 'SELF' : 'ENEMY', selection: 'PLAYER_CHOICE', count: 1 }, values: { amount },
  }, [id]);
}
test('강철 심장: lethal structured damage survives at 1 once, even silenced; DESTROY bypasses it', () => {
  const state = setup(['FIRST_RETIRE_SURVIVE', 'ONE_HP_ATK_BUFF'], [{ ...make('a'), isSilenced: true }]);
  const survived = processChampionQuestEvents(state, effect(state, 'DAMAGE', 'a'));
  assert.equal(survived.players[0]!.board[0]!.currentHealth, 1);
  assert.equal(survived.players[0]!.board[0]!.currentAttack, 5);
  assert.equal(survived.events.filter(e => e.type === 'CARD_RETIRED').length, 0);
  const dead = effect(survived, 'DAMAGE', 'a');
  assert.equal(dead.players[0]!.board[0], null);
  const destroyed = destroyCard(state, 'player-1', 'a');
  assert.equal(destroyed.state.players[0]!.board[0], null); assert.equal(destroyed.state.tower!.survived, undefined);
});
test('강철 심장: explicit RETIRE and state-based lethal share the one-use replacement', () => {
  const state = setup(['FIRST_RETIRE_SURVIVE']);
  assert.equal(effect(state, 'RETIRE', 'a').players[0]!.board[0]!.currentHealth, 1);
  const lethal = { ...state, players: state.players.map((p, i) => i ? p : { ...p, board: p.board.map(c => c ? { ...c, currentHealth: 0 } : c) as typeof p.board }) };
  const rescued = resolveStateBasedDeaths(lethal);
  assert.equal(rescued.players[0]!.board[0]!.currentHealth, 1); assert.equal(rescued.tower!.survived, true);
});
test('복수의 메달: retirement buffs the next entry only; destruction grants no revenge', () => {
  const state = setup(['ON_RETIRE_NEXT_BUFF']);
  const retired = effect(state, 'RETIRE', 'a');
  const entered = enterField(retired, 'player-1', make('next'), 0);
  assert.equal(entered.players[0]!.board[0]!.currentAttack, 4); assert.equal(entered.players[0]!.board[0]!.currentHealth, 7);
  const second = enterField(entered, 'player-1', make('second'), 1);
  assert.equal(second.players[0]!.board[1]!.currentAttack, 2);
  assert.equal(destroyCard(state, 'player-1', 'a').state.tower!.nextEntryBuffs, undefined);
});
test('망자의 종 + 전우의 유품: once-per-turn draw and deterministic other-ally buff, no duplicated event', () => {
  const state = setup(['ON_RETIRE_DRAW', 'ON_RETIRE_RANDOM_ALLY_BUFF'], [make('a'), make('b'), make('c')]);
  const retired = effect(state, 'RETIRE', 'a');
  assert.equal(retired.players[0]!.hand.length, state.players[0]!.hand.length + 1);
  assert.equal(retired.players[0]!.board.filter(c => c && c.currentAttack === 3).length, 1);
  assert.deepEqual(effect(structuredClone(state), 'RETIRE', 'a'), retired);
  const index = retired.events.findIndex(e => e.type === 'CARD_RETIRED');
  assert.deepEqual(resolveTowerRemoval(retired, retired.events[index]!, index), retired);
  const twice = effect(retired, 'RETIRE', 'b'); assert.equal(twice.players[0]!.hand.length, retired.players[0]!.hand.length);
  const nextTurn = endTurn(twice, 'player-1').state;
  const again = effect(nextTurn, 'RETIRE', 'c'); assert.equal(again.players[0]!.hand.length, twice.players[0]!.hand.length + 1);
});
test('파괴자의 인장: actual DESTROY draws two once and RETIRE draws none', () => {
  const state = setup(['ON_DESTROY_DRAW'], [make('a')], [make('e'), make('f')]);
  const retired = effect(state, 'RETIRE', 'e'); assert.equal(retired.players[0]!.hand.length, state.players[0]!.hand.length);
  const destroyed = effect(state, 'DESTROY', 'e'); assert.equal(destroyed.players[0]!.hand.length, state.players[0]!.hand.length + 2);
  const twice = effect(destroyed, 'DESTROY', 'f'); assert.equal(twice.players[0]!.hand.length, destroyed.players[0]!.hand.length);
});
test('승자의 벨트: the surviving attacking wrestler gets +2 only for its RETIRE kill', () => {
  const state = setup(['ON_RETIRE_KILL_BUFF'], [make('a', 4, 10)], [make('e', 1, 2)]);
  const result = attack(state, 'player-1', 'a', { type: 'WRESTLER', playerId: 'player-2', cardInstanceId: 'e' });
  assert.equal(result.success, true); assert.equal(result.state.players[0]!.board[0]!.currentAttack, 6);
});
for (const [type, defenderAttack, expected] of [['ATTACK_HIGHER_ATK_BUFF', 4, 5], ['ATTACK_LOWER_ATK_BUFF', 1, 4]] as const) {
  test(`${type}: combat-only attack and no lasting stat change`, () => {
    const state = setup([type], [make('a', 2, 20)], [make('e', defenderAttack, 20)]);
    const result = attack(state, 'player-1', 'a', { type: 'WRESTLER', playerId: 'player-2', cardInstanceId: 'e' });
    assert.equal(result.state.players[1]!.board[0]!.currentHealth, 20 - expected);
    assert.equal(result.state.players[0]!.board[0]!.currentAttack, 2);
  });
}
test('최후의 투사: aura enters/leaves without stacking; HP aura removal cannot retire', () => {
  const state = setup(['SOLO_BUFF']); assert.equal(state.players[0]!.board[0]!.currentAttack, 5);
  assert.deepEqual(refreshTowerAuras(state), state);
  const wounded = { ...state, players: state.players.map((p, i) => i ? p : { ...p, board: p.board.map(c => c ? { ...c, currentHealth: 1 } : c) as typeof p.board }) };
  const second = enterField(wounded, 'player-1', make('b'), 1);
  assert.equal(second.players[0]!.board[0]!.currentAttack, 2); assert.equal(second.players[0]!.board[0]!.currentHealth, 1);
  assert.equal(second.players[0]!.board[0]!.maxHealth, 5);
});
test('무대 독점권: own turn only, heal capped at max and permanent attack +1', () => {
  const state = setup(['SOLO_TURN_START_HEAL_BUFF'], [make('a', 2, 5)]);
  state.players[0]!.board[0] = { ...state.players[0]!.board[0]!, currentHealth: 4 };
  const other = endTurn(state, 'player-1'); assert.equal(other.state.players[0]!.board[0]!.currentAttack, 2);
  const mine = endTurn(other.state, 'player-2'); assert.equal(mine.state.players[0]!.board[0]!.currentAttack, 3); assert.equal(mine.state.players[0]!.board[0]!.currentHealth, 5);
});
test('철벽의 증표: first damage per wrestler per turn, positive fully reduced hit consumes protection', () => {
  const state = setup(['FIRST_DAMAGE_REDUCTION']);
  const first = effect(state, 'DAMAGE', 'a', 1); assert.equal(first.players[0]!.board[0]!.currentHealth, 5);
  const second = effect(first, 'DAMAGE', 'a', 1); assert.equal(second.players[0]!.board[0]!.currentHealth, 4);
  const other = endTurn(second, 'player-1'); const third = effect(other.state, 'DAMAGE', 'a', 3); assert.equal(third.players[0]!.board[0]!.currentHealth, 3);
});
test('역전의 휘장: live field counts, combined with two-slot restriction, restores base attack', () => {
  const state = setup(['MAX_FIELD_TWO', 'OUTNUMBERED_ATK_BUFF'], [make('a')], [make('e'), make('f')]);
  assert.equal(state.players[0]!.board[0]!.currentAttack, 4);
  const destroyed = destroyCard(state, 'player-2', 'f').state; assert.equal(destroyed.players[0]!.board[0]!.currentAttack, 2);
});
test('관중의 함성: two enemy RETIRE kills draw two once; DESTROY does not contribute', () => {
  const state = setup(['MULTI_RETIRE_DRAW'], [make('a')], [make('e'), make('f'), make('g')]);
  const first = effect(state, 'RETIRE', 'e'); assert.equal(first.players[0]!.hand.length, state.players[0]!.hand.length);
  const second = effect(first, 'RETIRE', 'f'); assert.equal(second.players[0]!.hand.length, state.players[0]!.hand.length + 2);
  const third = effect(second, 'RETIRE', 'g'); assert.equal(third.players[0]!.hand.length, second.players[0]!.hand.length);
});
test('챔피언의 표식 + 완주의 왕관: quest bonus once, completion buffs current field once', () => {
  const state = setup(['QUEST_PROGRESS_BONUS', 'QUEST_COMPLETE_FIELD_BUFF']);
  state.players[0]!.champion = { ...state.players[0]!.champion!, questProgress: 0, questCompleted: false,
    quest: { id: 'qa-quest', name: 'QA', description: 'QA', trackedEvent: 'CARD_PLAYED', requiredProgress: 2, reward: { type: 'GAIN_GOLD', amount: 0 } } };
  const changed: GameState = { ...state, events: [...state.events, { type: 'CARD_PLAYED', playerId: 'player-1', cardInstanceId: 'played', cardType: 'WRESTLER', source: { type: 'SYSTEM' }, reason: 'PLAY' }] };
  const progressed = processChampionQuestEvents(state, changed);
  assert.equal(progressed.players[0]!.champion!.questProgress, 2); assert.equal(progressed.players[0]!.champion!.questCompleted, true);
  assert.equal(progressed.players[0]!.board[0]!.currentAttack, 4); assert.equal(progressed.players[0]!.board[0]!.currentHealth, 7);
  const replayed = processChampionQuestEvents(changed, progressed);
  assert.deepEqual(replayed.players, progressed.players); assert.deepEqual(replayed.events, progressed.events);
});
test('도전자 벨트: highest enemy ATK ties qualify; only incoming damage to attacking wrestler reduced', () => {
  const state = setup(['ATTACK_HIGHEST_DAMAGE_REDUCTION'], [make('a', 2, 10)], [make('e', 4, 10), make('f', 4, 10)]);
  const result = attack(state, 'player-1', 'a', { type: 'WRESTLER', playerId: 'player-2', cardInstanceId: 'e' });
  assert.equal(result.state.players[0]!.board[0]!.currentHealth, 8); assert.equal(result.state.players[1]!.board[0]!.currentHealth, 8);
});
test('폭군의 명령서: highest base ATK tie uses leftmost; recomputation does not switch or stack', () => {
  const state = setup(['HIGHEST_ATK_LEADER_BUFF'], [make('a'), make('b')]);
  assert.equal(state.players[0]!.board[0]!.currentAttack, 4); assert.equal(state.players[0]!.board[0]!.currentHealth, 7);
  assert.equal(state.players[0]!.board[1]!.currentAttack, 1); assert.equal(state.players[0]!.board[1]!.currentHealth, 5);
  assert.deepEqual(refreshTowerAuras(state), state);
  const removed = destroyCard(state, 'player-1', 'a').state; assert.equal(removed.players[0]!.board[1]!.currentAttack, 4);
});
