import type { CardDefinition } from '../cards/types';
import { generateCardInstance } from '../cards/generation';
import type { GameState } from '../types/game-state';

/** Disposable in-memory targets for the existing single-card admin test. */
export function prepareAdminCardTest(state: GameState, definition: CardDefinition): GameState {
  const target: CardDefinition = {
    id: 'admin-effect-target', name: '효과 테스트 표적', cardType: 'WRESTLER', rarity: 'NORMAL',
    cost: 3, attack: 2, health: 10, rulesText: '', keywords: [], abilities: [],
    tags: ['디 어쏘리티', '실험체', '언데드'], isToken: false, isChampionToken: false,
  };
  const enemyStrong = { ...target, id: 'admin-effect-strong-target', name: '효과 테스트 강한 표적', attack: 4 };
  const ally = { ...generateCardInstance(target, { instanceId: 'admin-ally-target' }), boardSlot: 2 as const, enteredThisTurn: false, currentHealth: 5 };
  const enemies = [target, enemyStrong].map((d, slot) => ({ ...generateCardInstance(d, {instanceId:`admin-enemy-target-${slot}`}), boardSlot: slot as 0 | 1, enteredThisTurn: false, ...(slot === 0 ? {currentAttack:1} : {}) }));
  if (definition.contentRule === '루나 MK.사일런스' || definition.contentRule === '사일런스') enemies[0]!.isSilenced = true;
  const own = state.players[0]!;
  const first = own.hand.find(card => card.definitionId === definition.id) ?? generateCardInstance(definition, {instanceId:'admin-tested-card'});
  const board = [...own.board];
  // Rub's printed condition needs an otherwise empty allied field.
  if (definition.contentRule !== '루브' && definition.name !== '조킹루이지') board[2] = ally;
  const hand = [first, ...own.hand.filter(card => card.instanceId !== first.instanceId)];
  if (definition.contentRule === '태그 체인지') hand.push(generateCardInstance(target, {instanceId:'admin-swap-hand'}));
  return { ...state, cardPool: [...(state.cardPool ?? []), target, enemyStrong], players: [
    { ...own, currentGold: Math.max(20, definition.cost + 10), health: Math.min(20, own.maxHealth), hand, board: board as typeof own.board,
      graveyard: Array.from({length:4}, (_,index) => generateCardInstance(target, {instanceId:`admin-grave-${index}`})) },
    { ...state.players[1]!, board: [enemies[0]!, enemies[1]!, null, null] },
  ] };
}
