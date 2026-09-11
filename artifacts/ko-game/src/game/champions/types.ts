import type { GameEventType } from '../events/types';
import type { CardEffect } from '../effects/types';

export type ChampionEffect =
  | { type: 'GAIN_GOLD'; amount: number }
  | { type: 'HEAL_CHAMPION'; amount: number }
  | Extract<CardEffect, { type: 'STRUCTURED' }>
  | {
      type: 'DIRECT_DEPLOY_CHAMPION_TOKEN';
      cardDefinitionId: string;
    };

export interface ChampionAbility {
  id: string;
  name: string;
  description: string;
  cost?: number;
  effects: ChampionEffect[];
}

export type ChampionQuestReward =
  | { type: 'UPGRADE_ABILITY' }
  | { type: 'GAIN_GOLD'; amount: number }
  | { type: 'DIRECT_DEPLOY_CHAMPION_TOKEN'; cardDefinitionId: string };

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
  description?: string;
  imageAssetId?: string | null;
  imageUrl?: string | null;
  questCompleteAudioAssetId?: string | null;
  questCompleteAudioUrl?: string | null;
  questCompleteAudioVolume?: number;
  questCompleteAudioEnabled?: boolean;
  maxHealth: number;
  abilityCost: number;
  ability: ChampionAbility;
  quest: ChampionQuest | null;
  upgradedAbility: ChampionAbility | null;
  championTokenDefinitionId?: string | null;
  status?: 'DRAFT' | 'PUBLISHED' | 'DISABLED';
  version?: number;
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
  questCompleteAudioAssetId?: string | null;
  questCompleteAudioUrl?: string | null;
  questCompleteAudioVolume?: number;
  questCompleteAudioEnabled?: boolean;
  upgradedAbility: ChampionAbility | null;
}