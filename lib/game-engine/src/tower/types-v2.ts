import type { AccountReward, Condition, TowerMusicTrack } from "./types";
export type TowerDifficulty = "EASY" | "NORMAL" | "HARD";
export interface RarityWeights {
  NORMAL: number;
  EPIC: number;
  LEGENDARY: number;
}
export interface TowerEnemy {
  id: string;
  name: string;
  championId: string;
  difficulty: TowerDifficulty;
  weight: number;
}
export interface TowerFloor {
  id: string;
  number: number;
  type: "NORMAL" | "BOSS";
  enemies: TowerEnemy[];
  bossId?: string;
  relicReward: boolean;
  sceneId?: string;
  backgroundUrl?: string;
  music?: TowerMusicTrack;
  rarityWeights?: RarityWeights;
}
export interface TowerBoss {
  abilities?: import("./effects").TowerConfiguredEffect[];
  id: string;
  name: string;
  championId: string;
  cardIds: string[];
  difficulty: TowerDifficulty;
  startingHealth: number;
  maxHealth: number;
  sceneId?: string;
  backgroundUrl?: string;
  music?: TowerMusicTrack;
  firstRewards: AccountReward[];
  repeatRewards: AccountReward[];
}
export interface TowerV2 {
  schemaVersion: 2;
  enabled: boolean;
  visible: boolean;
  sortOrder: number;
  recommendedDifficulty: string;
  imageUrl?: string;
  backgroundUrl?: string;
  selectionImageUrl?: string;
  floors: TowerFloor[];
  bosses: TowerBoss[];
  rarityWeights: RarityWeights;
  openingSceneId?: string;
  endingSceneId?: string;
  hiddenEndingSceneId?: string;
  hiddenBossId?: string;
  hiddenCondition?: Condition;
}
