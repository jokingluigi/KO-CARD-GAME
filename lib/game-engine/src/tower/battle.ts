import {resolveConfiguredTowerEffects} from '../../../../artifacts/ko-game/src/game/tower/configured-effects';
import {towerBoss} from './v2';
import { towerVanillaChampion } from '../../../../artifacts/ko-game/src/game/champions/tower-vanilla';
import { createInitialGameState } from '../../../../artifacts/ko-game/src/game/engine/create-initial-game-state';
import { startGame } from '../../../../artifacts/ko-game/src/game/engine/turn-system';
import { createDeterministicRandom } from '../../../../artifacts/ko-game/src/game/random/random';
import type { CardDefinition } from '../../../../artifacts/ko-game/src/game/cards/types';
import type { ChampionDefinition } from '../../../../artifacts/ko-game/src/game/champions/types';
import type { GameState } from '../../../../artifacts/ko-game/src/game/types/game-state';
import type { TowerBattleContext } from '../../../../artifacts/ko-game/src/game/tower/relics';
import { TowerRuleError, validateTowerDeck } from './domain';
import type { TowerCatalog, TowerRun } from './types';

export interface TowerSnapshot { contentVersion?:number; catalog: TowerCatalog; cards: CardDefinition[]; champions: ChampionDefinition[]; minionACardPool?: CardDefinition[] }
export function initializeTowerBattle(input: { gameId: string; seed: number; championIds: [string, string]; decks: [string[], string[]]; tower?: TowerBattleContext; minionACardPool?: CardDefinition[]; normalEnemy?: boolean; flexibleEnemyDeck?: boolean; enemyHealth?: {startingHealth:number;maxHealth:number} }, cards: CardDefinition[], champions: ChampionDefinition[]): GameState {
  if (input.normalEnemy) {
    const vanilla = towerVanillaChampion(champions);
    champions = [...champions.filter(champion => champion.id !== vanilla.id), vanilla];
    input = { ...input, championIds: [input.championIds[0], vanilla.id] };
  }
  if (input.decks.some((deck, index) => (index === 1 && input.flexibleEnemyDeck ? deck.length < 1 || deck.length > 100 : deck.length !== 25) || deck.some(id => !cards.some(card => card.id === id))))
    throw new TowerRuleError('INVALID_DECK', '전투 덱은 실제 카드 25장이어야 합니다.');
  if (input.championIds.some(id => !champions.some(champion => champion.id === id)))
    throw new TowerRuleError('CHAMPION_MISSING', '전투 챔피언 설정을 확인해 주세요.');
  let initial = createInitialGameState(input.championIds, cards, champions, input.decks, { gameId: input.gameId, randomSeed: input.seed, minionACardPool: input.minionACardPool });
  if(input.enemyHealth)initial={...initial,players:initial.players.map((p,i)=>i===1?{...p,health:input.enemyHealth!.startingHealth,maxHealth:input.enemyHealth!.maxHealth}:p)};
  if(input.tower?.configuredRules?.length)initial={...initial,players:initial.players.map((p,index)=>index!==0?p:{...p,deck:p.deck.map((c,i)=>{const modifier=input.tower?.configuredRuntime?.runModifiers[String(i)]??{attack:0,health:0,cost:0};return {...c,towerDeckIndex:i,baseAttack:(c.baseAttack??c.currentAttack)+modifier.attack,baseHealth:Math.max(1,(c.baseHealth??c.maxHealth)+modifier.health),baseCost:Math.max(0,(c.baseCost??c.currentCost)+modifier.cost),currentAttack:c.currentAttack+modifier.attack,currentHealth:Math.max(1,c.currentHealth+modifier.health),maxHealth:Math.max(1,c.maxHealth+modifier.health),currentCost:Math.max(0,c.currentCost+modifier.cost)};})})};
  const started={ ...startGame(input.tower ? { ...initial, tower: input.tower } : initial, createDeterministicRandom(input.seed), undefined, input.flexibleEnemyDeck ? { flexibleDeckPlayerId: "player-2" } : {}), openingMulligan: true };
  return resolveConfiguredTowerEffects(initial,started);
}
/** Initializes the existing engine. Tower has no separate combat dispatcher. */
export function createTowerBattle(run: TowerRun, snapshot: TowerSnapshot): GameState {
  const configuredBoss=run.encounter.bossSlot?towerBoss(snapshot.catalog,run.encounter.bossSlot==='hiddenBoss'?snapshot.catalog.season.v2?.hiddenBossId??'hiddenBoss':run.encounter.bossSlot):undefined;
  const enemy = run.encounter.cardIds&&run.encounter.championId?{id:run.encounter.presetId,cardIds:run.encounter.cardIds,championId:run.encounter.championId}:snapshot.catalog.presets.find(preset => preset.id === run.encounter.presetId);
  if (!enemy) throw new TowerRuleError('ENCOUNTER_MISSING', '상대 덱을 찾을 수 없습니다.');
  const flexibleEnemyDeck = Boolean(run.encounter.bossSlot) && enemy.id.startsWith('ai-deck:');
  validateTowerDeck(run.deck, snapshot.catalog); if (!flexibleEnemyDeck) validateTowerDeck(enemy.cardIds, snapshot.catalog);
  if (!snapshot.champions.some(champion => champion.id === run.championId) || (Boolean(run.encounter.bossSlot) && !snapshot.champions.some(champion => champion.id === enemy.championId)))
    throw new TowerRuleError('CHAMPION_MISSING', '전투 챔피언 설정을 확인해 주세요.');
  return initializeTowerBattle({ flexibleEnemyDeck, normalEnemy: !snapshot.catalog.season.v2 && !run.encounter.bossSlot, enemyHealth:configuredBoss, minionACardPool: snapshot.minionACardPool, championIds: [run.championId, enemy.championId], decks: [run.deck, enemy.cardIds],
    gameId: `${run.id}:${run.floor}:${run.encounter.bossSlot ?? 'normal'}`, seed: run.encounter.seed,
    tower: { playerId: 'player-1',inventoryRelicIds:[...run.relicIds],
      configuredRules:[...run.relicIds.flatMap((id,acquisition)=>snapshot.catalog.relics.find(r=>r.id===id)?.effects?.map((effect,order)=>({ownerId:'player-1',sourceType:'TOWER_RELIC' as const,sourceId:id,effect,order:acquisition*100000+order}))??[]),...(configuredBoss?.abilities?.map((effect,order)=>({ownerId:'player-2',sourceType:'TOWER_BOSS' as const,sourceId:configuredBoss.id,effect,order}))??[])],
      configuredRuntime:{cursor:0,uses:{},runUses:run.effectRunUses??{},runModifiers:run.runStatModifiers??{},errors:[]},
      relics: run.relicIds.filter(id=>!snapshot.catalog.relics.find(r=>r.id===id)?.effects?.length).map(id => {
      const relic = snapshot.catalog.relics.find(r => r.id === id);
      if (!relic) throw new TowerRuleError('INVALID_RELIC', '선택한 유물 설정을 찾을 수 없습니다.');
      return { id: relic.id, effectType: relic.effectType, values: { ...relic.values } };
    }) } }, snapshot.cards, snapshot.champions);
}
