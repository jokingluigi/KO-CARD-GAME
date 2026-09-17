import type { GameEventType } from '../events/types';
import type { CardEffect } from '../effects/types';
import type { ImageDisplayMode } from '../cards/types';

export type ChampionTrackedEvent = GameEventType | 'WRESTLER_RETIRED';
export type ChampionQuestCardType = 'WRESTLER' | 'TECHNIQUE';

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
  | {
      type: 'UPGRADE_ABILITY';
      effects?: Array<Extract<ChampionEffect, { type: 'STRUCTURED' }>>;
    }
  | { type: 'GAIN_GOLD'; amount: number }
  | { type: 'DIRECT_DEPLOY_CHAMPION_TOKEN'; cardDefinitionId: string }
  | {
      type: 'STRUCTURED';
      effects: Array<Extract<ChampionEffect, { type: 'STRUCTURED' }>>;
    };

export interface ChampionQuest {
  id: string;
  name: string;
  description: string;
  trackedEvent: ChampionTrackedEvent;
  cardType?: ChampionQuestCardType;
  sourceActionType?: string;
  progressPerEvent?: number;
  requiredProgress: number;
  reward: ChampionQuestReward;
}

export interface ChampionDefinition {
  id: string;
  name: string;
  description?: string;
  imageAssetId?: string | null;
  imageUrl?: string | null;
  imageDisplayMode?: ImageDisplayMode;
  imageScale?: number;
  imagePositionX?: number;
  imagePositionY?: number;
  questCompletedPortraitEnabled?: boolean;
  questCompletedPortraitAssetId?: string | null;
  questCompletedPortraitUrl?: string | null;
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
  imageUrl?: string | null;
  imageDisplayMode?: ImageDisplayMode;
  imageScale?: number;
  imagePositionX?: number;
  imagePositionY?: number;
  questCompletedPortraitEnabled?: boolean;
  questCompletedPortraitAssetId?: string | null;
  questCompletedPortraitUrl?: string | null;
  questCompleteAudioAssetId?: string | null;
  questCompleteAudioUrl?: string | null;
  questCompleteAudioVolume?: number;
  questCompleteAudioEnabled?: boolean;
  upgradedAbility: ChampionAbility | null;
  championTokenDefinitionId?: string | null;
}