import type { CardAbility, CardKeyword } from '../effects/types';
export type { CardKeyword } from '../effects/types';

export type CardDefinitionId = string;
export type CardInstanceId = string;
export type CardRarity = 'NORMAL' | 'LEGENDARY' | 'CHAMPION' | 'TOKEN';

export const CARD_RARITY_LABELS: Record<CardRarity, string> = {
  NORMAL: '일반',
  LEGENDARY: '레전더리',
  CHAMPION: '챔피언',
  TOKEN: '토큰',
};

export function normalizeCardRarity(value?: unknown): CardRarity {
  return value === 'LEGENDARY' || value === 'CHAMPION' || value === 'TOKEN' ? value : 'NORMAL';
}

export function allowedCardRarities(cardType: 'WRESTLER' | 'TECHNIQUE'): CardRarity[] {
  return cardType === 'TECHNIQUE'
    ? ['NORMAL', 'TOKEN']
    : ['NORMAL', 'LEGENDARY', 'CHAMPION', 'TOKEN'];
}

export function normalizeCardRarityForType(
  cardType: 'WRESTLER' | 'TECHNIQUE' | undefined,
  value?: unknown,
): CardRarity {
  const rarity = normalizeCardRarity(value);
  if (cardType === 'TECHNIQUE' && (rarity === 'LEGENDARY' || rarity === 'CHAMPION')) {
    return 'NORMAL';
  }
  return rarity;
}

export type ImageDisplayMode = 'COVER' | 'CONTAIN' | 'CUSTOM';

export interface ImageDisplaySettings {
  imageDisplayMode: ImageDisplayMode;
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
}

export type CardStatHistoryEntry = {
  stat: 'attack' | 'health' | 'maxHealth' | 'currentHealth' | 'cost';
  before: number;
  after: number;
  delta: number;
  sourceDefinitionId?: string;
  sourceInstanceId?: string;
  sourceName?: string;
  sourceEffectId?: string;
  turnNumber?: number;
  duration?: 'THIS_TURN' | 'UNTIL_NEXT_TURN' | 'PERMANENT';
};

export type TemporaryStatModifier = {
  stat: 'cost' | 'attack' | 'health';
  amount: number;
  untilTurn: number;
};

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
  temporaryCostUntilTurn?: number;
  temporaryStatModifiers?: TemporaryStatModifier[];
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
  /** Only used by the local administrator training match. */
  isTrainingDummy?: boolean;
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
  /** Creation provenance for development diagnostics and event correlation. */
  lineage?: CardLineage;
  tags?: string[];
  /** Serializable base copies held by this card's CAPTURE action. */
  capturedCards?: CapturedCard[];
  statHistory?: CardStatHistoryEntry[];
  /** Snapshot retained only for chained effects that consume the last retirement. */
  lastRetiredStats?: { attack: number; health: number };
  /** Executable text copied from a published match CardDefinition. */
  grantedText?: {
    donorDefinitionId: string;
    rulesText: string;
    keywords: CardKeyword[];
    abilities: CardAbility[];
  };
}

export interface CardLineage {
  creationPath: string;
  sourceCardInstanceId?: string;
  sourceDefinitionId?: string;
  sourceChampionId?: string;
  sourceEffectId?: string;
  creationEventIndex?: number;
}

export interface CapturedCard {
  definitionId: CardDefinitionId;
  baseSnapshot: Pick<CardInstance, 'definitionId' | 'cardType' | 'currentCost' | 'currentAttack' | 'currentHealth' | 'maxHealth' | 'isGenerated' | 'isToken' | 'isChampionToken' | 'keywords' | 'abilities' | 'tags' | 'dodgeCharges' | 'grantedText'>;
}
