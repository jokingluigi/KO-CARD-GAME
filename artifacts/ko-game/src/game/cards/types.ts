import type { CardAbility, CardKeyword } from '../effects/types';

export type CardDefinitionId = string;
export type CardInstanceId = string;
export type CardRarity = 'NORMAL' | 'LEGENDARY' | 'CHAMPION';

export const CARD_RARITY_LABELS: Record<CardRarity, string> = {
  NORMAL: '일반',
  LEGENDARY: '레전더리',
  CHAMPION: '챔피언',
};

export function normalizeCardRarity(value?: unknown): CardRarity {
  return value === 'LEGENDARY' || value === 'CHAMPION' ? value : 'NORMAL';
}

export type ImageDisplayMode = 'COVER' | 'CONTAIN' | 'CUSTOM';

export interface ImageDisplaySettings {
  imageDisplayMode: ImageDisplayMode;
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
}

export const DEFAULT_IMAGE_DISPLAY_SETTINGS: ImageDisplaySettings = {
  imageDisplayMode: 'COVER',
  imageScale: 1,
  imagePositionX: 50,
  imagePositionY: 50,
};

export function normalizeImageDisplaySettings(
  settings?: Partial<ImageDisplaySettings> | null,
): ImageDisplaySettings {
  const mode = settings?.imageDisplayMode;
  const imageScale = settings?.imageScale;
  const imagePositionX = settings?.imagePositionX;
  const imagePositionY = settings?.imagePositionY;
  return {
    imageDisplayMode:
      mode === 'CONTAIN' || mode === 'CUSTOM' ? mode : DEFAULT_IMAGE_DISPLAY_SETTINGS.imageDisplayMode,
    imageScale:
      typeof imageScale === 'number' && Number.isFinite(imageScale)
        ? Math.min(2, Math.max(0.5, imageScale))
        : DEFAULT_IMAGE_DISPLAY_SETTINGS.imageScale,
    imagePositionX:
      typeof imagePositionX === 'number' && Number.isFinite(imagePositionX)
        ? Math.min(100, Math.max(0, imagePositionX))
        : DEFAULT_IMAGE_DISPLAY_SETTINGS.imagePositionX,
    imagePositionY:
      typeof imagePositionY === 'number' && Number.isFinite(imagePositionY)
        ? Math.min(100, Math.max(0, imagePositionY))
        : DEFAULT_IMAGE_DISPLAY_SETTINGS.imagePositionY,
  };
}

export interface CardDefinition {
  id: CardDefinitionId;
  name: string;
  cardType?: 'WRESTLER' | 'TECHNIQUE';
  cost: number;
  attack: number;
  health: number;
  rulesText: string;
  rarity?: CardRarity;
  imageAssetId?: string | null;
  imageUrl?: string | null;
  imageDisplayMode?: ImageDisplayMode;
  imageScale?: number;
  imagePositionX?: number;
  imagePositionY?: number;
  entranceAudioAssetId?: string | null;
  entranceAudioUrl?: string | null;
  entranceAudioVolume?: number;
  entranceAudioEnabled?: boolean;
  isToken: boolean;
  isChampionToken: boolean;
  keywords: CardKeyword[];
  abilities: CardAbility[];
  /** Tags are independent of generated status and may be shared by many cards. */
  tags?: string[];
  status?: 'DRAFT' | 'PUBLISHED' | 'DISABLED';
  version?: number;
  effectId?: string | null;
  effectConfig?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CardInstance {
  instanceId: CardInstanceId;
  definitionId: CardDefinitionId;
  cardType?: 'WRESTLER' | 'TECHNIQUE';
  currentCost: number;
  /** Immutable values copied from the definition, retained for runtime checks. */
  baseCost?: number;
  baseAttack?: number;
  baseHealth?: number;
  currentAttack: number;
  currentHealth: number;
  maxHealth: number;
  boardSlot: 0 | 1 | 2 | 3 | null;
  enteredThisTurn: boolean;
  attacksUsedThisTurn: number;
  isGenerated: boolean;
  isToken: boolean;
  isChampionToken: boolean;
  entranceAudioAssetId?: string | null;
  entranceAudioUrl?: string | null;
  entranceAudioVolume?: number;
  entranceAudioEnabled?: boolean;
  keywords: CardKeyword[];
  abilities: CardAbility[];
  isSilenced: boolean;
  /** A non-silence ability lock used by one-shot defensive abilities. */
  isAbilityDisabled?: boolean;
  isSilenceImmune: boolean;
  dodgeAvailable: boolean;
  /** Counted dodge is backward compatible with the original boolean flag. */
  dodgeCharges?: number;
  isStunned: boolean;
  activeUsedThisTurn: boolean;
  isDirectDeployedChampion: boolean;
  tags?: string[];
  /** Serializable base copies held by this card's CAPTURE action. */
  capturedCards?: CapturedCard[];
}

export interface CapturedCard {
  definitionId: CardDefinitionId;
  baseSnapshot: Pick<CardInstance, 'definitionId' | 'cardType' | 'currentCost' | 'currentAttack' | 'currentHealth' | 'maxHealth' | 'isGenerated' | 'isToken' | 'isChampionToken' | 'keywords' | 'abilities' | 'tags' | 'dodgeCharges'>;
}