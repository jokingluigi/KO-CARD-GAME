import type { ChampionDefinition } from './types';
export const TOWER_VANILLA_CHAMPION_ID = 'champion-tower-vanilla';
/** Only presentation is editable; ordinary Tower enemies always have no mechanics. */
export function towerVanillaChampion(champions: ChampionDefinition[]): ChampionDefinition {
 const configured = champions.find(champion => champion.id === TOWER_VANILLA_CHAMPION_ID);
 return { ...configured, id: TOWER_VANILLA_CHAMPION_ID, name: configured?.name ?? '타워 일반 상대',
  maxHealth: 30, abilityCost: 0, ability: { id: `${TOWER_VANILLA_CHAMPION_ID}-ability`, name: '능력 없음', description: '', cost: 0, effects: [] },
  quest: null, upgradedAbility: null, championTokenDefinitionId: null, questCompletedPortraitEnabled: false };
}
