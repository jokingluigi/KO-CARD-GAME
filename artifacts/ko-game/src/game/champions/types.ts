import type { GameEventType } from '../events/types';

export type ChampionEffect =
  | { type: 'GAIN_GOLD'; amount: number }
  | { type: 'HEAL_CHAMPION'; amount: number }
  | {
      type: 'DIRECT_DEPLOY_CHAMPION_TOKEN';
      cardDefinitionId: string;
    };

export interface ChampionAbility {
  id: string;
  name: string;
  description: string;
  effects: ChampionEffect[];
}

export type ChampionQuestReward =
  | { type: 'UPGRADE_ABILITY' }
  | { type: 'GAIN_GOLD'; amount: number };

export interface ChampionQuest {
  id: string;
  name: string;
  description: string;
  trackedEvent: GameEventType;
  requiredProgress: number;
  reward: ChampionQuestReward;
}

export interface ChampionDefinition {
  id: string;
  name: string;
  maxHealth: number;
  abilityCost: number;
  ability: ChampionAbility;
  quest: ChampionQuest | null;
  upgradedAbility: ChampionAbility | null;
}

export interface ChampionState {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  abilityCost: number;
  ability: ChampionAbility;
  quest: ChampionQuest | null;
  questProgress: number;
  questCompleted: boolean;
  upgradedAbility: ChampionAbility | null;
}