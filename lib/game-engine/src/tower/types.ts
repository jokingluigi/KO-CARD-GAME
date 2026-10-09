export const RELIC_TYPES = [
  'MAX_FIELD_ONE', 'MAX_FIELD_TWO', 'FIRST_SUMMON_TEMP_ATK', 'FIRST_RETIRE_SURVIVE',
  'ON_RETIRE_NEXT_BUFF', 'ON_RETIRE_DRAW', 'ON_DESTROY_DRAW', 'ON_RETIRE_KILL_BUFF',
  'ATTACK_HIGHER_ATK_BUFF', 'ATTACK_LOWER_ATK_BUFF', 'SOLO_BUFF', 'ON_RETIRE_RANDOM_ALLY_BUFF',
  'FIRST_SUMMON_COST_DOWN_LIMIT', 'FIRST_SUMMON_COST_DOWN_NO_ATTACK', 'SOLO_TURN_START_HEAL_BUFF',
  'FIRST_DAMAGE_REDUCTION', 'OUTNUMBERED_ATK_BUFF', 'MULTI_RETIRE_DRAW', 'QUEST_PROGRESS_BONUS',
  'QUEST_COMPLETE_FIELD_BUFF', 'EMPTY_FIELD_FIRST_SUMMON_BUFF', 'ONE_HP_ATK_BUFF',
  'ATTACK_HIGHEST_DAMAGE_REDUCTION', 'HIGHEST_ATK_LEADER_BUFF',
] as const;
export type RelicType = typeof RELIC_TYPES[number];
export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'BOSS';
export type BossSlot = 'boss1' | 'boss2' | 'boss3' | 'finalBoss' | 'hiddenBoss';
export const EXPRESSIONS = ['NEUTRAL', 'HAPPY', 'ANGRY', 'SAD', 'SURPRISED', 'AWKWARD', 'SERIOUS', 'HURT', 'FATIGUE'] as const;
export type Expression = typeof EXPRESSIONS[number];
export type Condition =
  | { type: 'ALL' | 'ANY'; conditions: Condition[] }
  | { type: 'SEASON_PROTAGONIST' | 'UNDEFEATED' | 'NORMAL_ENDING' }
  | { type: 'CHAMPION' | 'RELIC' | 'STARTER' | 'BOSS_CLEARED' | 'CARD'; id: string }
  | { type: 'CLEAR_COUNT'; count: number }
  | { type: 'SYNERGY_COUNT'; tag: string; count: number };
export interface AccountReward { type: 'CARD' | 'CHAMPION' | 'PACK' | 'CURRENCY'; targetId?: string; amount: number }
export interface BossConfig {
  presetId: string;
  commonSceneId?: string;
  protagonistSceneId?: string;
  firstReward: AccountReward;
  repeatReward: AccountReward;
}
export interface Season {
  v2?: import('./types-v2').TowerV2;
  id: string; name: string; description: string; protagonistChampionId: string;
  bosses: Record<Exclude<BossSlot, 'hiddenBoss'>, BossConfig> & { hiddenBoss?: BossConfig };
  hiddenCondition?: Condition;
  synergyWeights: { deckTag: number; supportTag: number; championTag: number };
  music?: Partial<Record<'normal' | 'midBoss' | 'boss' | 'hiddenBoss', TowerMusicTrack>>;
}
export interface TowerMusicTrack { name: string; assetUrl: string; volume: number }
export interface TowerCard {
  id: string; status: string; cost: number; cardType: 'WRESTLER' | 'TECHNIQUE'; rarity: string;
  isToken: boolean; isChampionToken: boolean; excluded?: boolean;
  synergyTags: string[]; supportsTags: string[]; effectTags?: string[]; executable?: boolean;
}
export interface Preset {
  id: string; name: string; championId: string; cardIds: string[]; acts: number[];
  difficulty: Difficulty; enabled: boolean; weight: number;
}
export interface Starter { description?:string; imageUrl?:string; difficultyLabel?:string;
  id: string; name: string; championId: string; cardIds: string[]; enabled: boolean;
  isDefault: boolean; initiallyUnlocked: boolean; unlockCondition?: Condition;
}
export interface Relic { effects?: import('./effects').TowerConfiguredEffect[];
  id: string; name: string; description: string; imageUrl?: string;
  effectType: RelicType | 'CONFIGURED'; values: Record<string, number>; enabled: boolean;
  initiallyUnlocked: boolean; unlockCondition?: Condition;
}
export interface StoryCharacter {
  id: string; displayName: string; championId?: string;
  sprites: Partial<Record<Expression, string>>;
}
export interface DialogueLine { backgroundUrl?:string; music?:TowerMusicTrack; sfxUrl?:string; shake?:number; fade?:boolean; blackout?:boolean; actorVisibility?:'SHOW'|'HIDE'; speakerId: string; expression: Expression; side: 'LEFT' | 'RIGHT'; text: string; order: number; spriteScale?: number; spriteOffsetX?: number; spriteOffsetY?: number }
export interface Scene { id: string; name: string; lines: DialogueLine[]; music?: TowerMusicTrack }
export interface TowerCatalog {
  season: Season; cards: TowerCard[]; presets: Preset[]; starters: Starter[]; relics: Relic[];
  championEffectTags?:Record<string,string[]>; preferredTags: Record<string, string[]>; scenes: Scene[]; characters: StoryCharacter[];
}
export interface History { clearCount: number; normalEnding: boolean; bossSlots: string[]; unlockedRelicIds: string[]; unlockedStarterIds: string[] }
export interface Encounter { enemyId?: string; championId?: string; cardIds?: string[]; contentVersion?: number; backgroundUrl?: string; music?: TowerMusicTrack; presetId: string; difficulty: Difficulty; seed: number; bossSlot?: BossSlot; sceneId?: string }
export type RunPhase = 'HUB' | 'DIALOGUE' | 'BATTLE' | 'CARD_REWARD' | 'REPLACE' | 'RELIC_REWARD' | 'RESULT';
export interface TowerRun {
  effectRunUses?: Record<string,number>; runStatModifiers?: Record<string,{attack:number;health:number;cost:number}>; schemaVersion: 1; id: string; seed: string; version: number; seasonId: string;
  championId: string; starterId: string; deck: string[]; relicIds: string[];
  offeredRelicIds: string[]; floor: number; phase: RunPhase; encounter: Encounter;
  previousNormalPresetId?: string; cardOptions: string[]; relicOptions: string[]; selectedCardId?: string;
  dialogueReturn?: 'HUB' | 'RESULT'; completedSceneIds?: string[]; contentVersion?: number; totalFloors?: number; dialogueIndex: number; defeatedBossSlots: BossSlot[]; regularClear: boolean; hiddenClear: boolean;
  hiddenEvaluated: boolean; losses: number; isTest: boolean; fullModeTest?: boolean; ended: boolean;
}
export type RunCommand =
  | { type: 'CHALLENGE' }
  | { type: 'DIALOGUE_NEXT' | 'DIALOGUE_SKIP' }
  | { type: 'BATTLE_RESULT'; won: boolean }
  | { type: 'SKIP_CARD' | 'CANCEL_CARD_SELECTION' }
  | { type: 'SELECT_CARD'; cardId: string }
  | { type: 'REPLACE_CARD'; deckIndex: number }
  | { type: 'SELECT_RELIC'; relicId: string }
  | { type: 'ABANDON' };
