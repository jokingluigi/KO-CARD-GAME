import type { GameEventType } from '../events/types';
import type { CardEffect } from '../effects/types';
import type { ImageDisplayMode } from '../cards/types';

export type ChampionTrackedEvent = GameEventType | 'WRESTLER_RETIRED';
export type ChampionQuestCardType = 'WRESTLER' | 'TECHNIQUE';

export type ChampionEffect =
  | { type: 'GAIN_GOLD'; amount: number }
  | { type: 'HEAL_CHAMPION'; amount: number }
  | Extract<CardEffect, { type: 'STRUCTURED' }>
  | Extract<CardEffect, { type: 'SCRIPT' }>
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
       effects?: Array<Extract<ChampionEffect, { type: 'STRUCTURED' | 'SCRIPT' }>>;
    }
  | { type: 'GAIN_GOLD'; amount: number }
  | { type: 'DIRECT_DEPLOY_CHAMPION_TOKEN'; cardDefinitionId: string }
  | {
      type: 'STRUCTURED';
       effects: Array<Extract<ChampionEffect, { type: 'STRUCTURED' | 'SCRIPT' }>>;
    };

export interface ChampionQuest {
  id: string;
  name: string;
  description: string;
  rewardText?: string;
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
  introLineOne?: string | null;
  introLineTwo?: string | null;
  presentationLines?: ChampionPresentationLines;
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
  presentationLines?: ChampionPresentationLines;
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
export const CHAMPION_EMOTES = ['HELLO', 'THANKS', 'WELL_PLAYED', 'SORRY', 'OOPS', 'THREATEN'] as const;
export type ChampionEmote = typeof CHAMPION_EMOTES[number];
export const CHAMPION_EMOTE_LABELS: Record<ChampionEmote, string> = {
  HELLO: '인사', THANKS: '감사', WELL_PLAYED: '칭찬',
  SORRY: '사과', OOPS: '이런', THREATEN: '위협',
};
export type ChampionVoiceLines = Partial<Record<ChampionEmote | 'VICTORY' | 'DEFEAT', string>>;
export type ChampionPresentationLines = {
  BEFORE_QUEST?: ChampionVoiceLines;
  AFTER_QUEST?: ChampionVoiceLines;
  MATCHUPS?: Record<string, {
    BEFORE_QUEST?: Pick<ChampionVoiceLines, 'VICTORY' | 'DEFEAT'>;
    AFTER_QUEST?: Pick<ChampionVoiceLines, 'VICTORY' | 'DEFEAT'>;
  }>;
};
export function championVoiceLine(
  lines: ChampionPresentationLines | undefined,
  questCompleted: boolean,
  kind: ChampionEmote | 'VICTORY' | 'DEFEAT',
  opponentChampionId?: string,
): string | null {
  if (opponentChampionId && (kind === 'VICTORY' || kind === 'DEFEAT')) {
    const matchup = lines?.MATCHUPS?.[opponentChampionId];
    const special = questCompleted ? matchup?.AFTER_QUEST?.[kind] || matchup?.BEFORE_QUEST?.[kind] : matchup?.BEFORE_QUEST?.[kind];
    if (special?.trim()) return special.trim();
  }
  const phase = questCompleted ? lines?.AFTER_QUEST : lines?.BEFORE_QUEST;
  return phase?.[kind]?.trim() || (questCompleted ? lines?.BEFORE_QUEST?.[kind]?.trim() : '') || null;
}
