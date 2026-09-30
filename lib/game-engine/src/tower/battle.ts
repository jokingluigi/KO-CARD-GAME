import { createInitialGameState } from '../../../../artifacts/ko-game/src/game/engine/create-initial-game-state';
import { startGame } from '../../../../artifacts/ko-game/src/game/engine/turn-system';
import { createDeterministicRandom } from '../../../../artifacts/ko-game/src/game/random/random';
import type { CardDefinition } from '../../../../artifacts/ko-game/src/game/cards/types';
import type { ChampionDefinition } from '../../../../artifacts/ko-game/src/game/champions/types';
import type { GameState } from '../../../../artifacts/ko-game/src/game/types/game-state';
import type { TowerBattleContext } from '../../../../artifacts/ko-game/src/game/tower/relics';
import { TowerRuleError, validateTowerDeck } from './domain';
import type { TowerCatalog, TowerRun } from './types';

export interface TowerSnapshot { catalog: TowerCatalog; cards: CardDefinition[]; champions: ChampionDefinition[] }
export function initializeTowerBattle(input: { gameId: string; seed: number; championIds: [string, string]; decks: [string[], string[]]; tower?: TowerBattleContext }, cards: CardDefinition[], champions: ChampionDefinition[]): GameState {
  if (input.decks.some(deck => deck.length !== 25 || deck.some(id => !cards.some(card => card.id === id))))
    throw new TowerRuleError('INVALID_DECK', '전투 덱은 실제 카드 25장이어야 합니다.');
  if (input.championIds.some(id => !champions.some(champion => champion.id === id)))
    throw new TowerRuleError('CHAMPION_MISSING', '전투 챔피언 설정을 확인해 주세요.');
  const initial = createInitialGameState(input.championIds, cards, champions, input.decks, { gameId: input.gameId, randomSeed: input.seed });
  return { ...startGame(input.tower ? { ...initial, tower: input.tower } : initial, createDeterministicRandom(input.seed)), openingMulligan: true };
}
/** Initializes the existing engine. Tower has no separate combat dispatcher. */
export function createTowerBattle(run: TowerRun, snapshot: TowerSnapshot): GameState {
  const enemy = snapshot.catalog.presets.find(preset => preset.id === run.encounter.presetId);
  if (!enemy) throw new TowerRuleError('ENCOUNTER_MISSING', '상대 덱을 찾을 수 없습니다.');
  validateTowerDeck(run.deck, snapshot.catalog); validateTowerDeck(enemy.cardIds, snapshot.catalog);
  if (!snapshot.champions.some(champion => champion.id === run.championId) || !snapshot.champions.some(champion => champion.id === enemy.championId))
    throw new TowerRuleError('CHAMPION_MISSING', '전투 챔피언 설정을 확인해 주세요.');
  return initializeTowerBattle({ championIds: [run.championId, enemy.championId], decks: [run.deck, enemy.cardIds],
    gameId: `${run.id}:${run.floor}:${run.encounter.bossSlot ?? 'normal'}`, seed: run.encounter.seed,
    tower: { playerId: 'player-1', relics: run.relicIds.map(id => {
      const relic = snapshot.catalog.relics.find(r => r.id === id);
      if (!relic) throw new TowerRuleError('INVALID_RELIC', '선택한 유물 설정을 찾을 수 없습니다.');
      return { id: relic.id, effectType: relic.effectType, values: { ...relic.values } };
    }) } }, snapshot.cards, snapshot.champions);
}
