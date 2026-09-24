import type { ChampionAbility, ChampionDefinition, ChampionEffect, ChampionQuest, ChampionQuestCardType } from "./types";
import type { CardEffect } from "../effects/types";
import type { ImageDisplayMode } from "../cards/types";
import { ACTIONS, isEffectScript, type EffectScript } from "@workspace/effect-registry";

type Structured = {
  effects?: Array<{ action?: string; target?: unknown; values?: unknown }>;
  scripts?: EffectScript[];
};
export type PublishedChampionRecord = {
  id: string; name: string; description: string; imageAssetId: string | null; imageUrl: string | null;
  imageDisplayMode?: ImageDisplayMode; imageScale?: number; imagePositionX?: number; imagePositionY?: number;
  questCompletedPortraitEnabled?: boolean;
  questCompletedPortraitAssetId?: string | null; questCompletedPortraitUrl?: string | null;
  maxHealth: number; abilityName: string; abilityCost: number; abilityText: string; abilityEffects: Structured;
  hasQuest: boolean; questName: string | null; questText: string | null;
  questCondition: { event?: string; cardType?: ChampionQuestCardType; sourceActionType?: string; progress?: number; required?: number } | null; questProgressRequired: number | null;
  questRewardText: string | null; questRewardEffects: Structured | null;
  upgradedAbilityName: string | null; upgradedAbilityCost: number | null;
  upgradedAbilityText: string | null; upgradedAbilityEffects: Structured | null;
  championTokenDefinitionId: string | null; status: "DRAFT" | "PUBLISHED" | "DISABLED"; version: number;
  questCompleteAudioAssetId?: string | null;
  questCompleteAudioUrl?: string | null;
  questCompleteAudioVolume?: number;
  questCompleteAudioEnabled?: boolean;
  introLineOne?: string | null;
  introLineTwo?: string | null;
};

function effects(config: Structured | null, tokenId?: string | null): ChampionEffect[] {
  const result: ChampionEffect[] = [];
  for (const script of config?.scripts ?? []) {
    if (isEffectScript(script)) result.push({ type: "SCRIPT", script });
  }
  for (const effect of config?.effects ?? []) {
    if (effect.action === "DIRECT_DEPLOY_CHAMPION_TOKEN" && tokenId) {
      result.push({ type: "DIRECT_DEPLOY_CHAMPION_TOKEN", cardDefinitionId: tokenId });
      continue;
    }
    if (!effect.action) continue;
    result.push({
      type: "STRUCTURED",
      action: effect.action,
      target: effect.target,
      values: effect.values,
    } as Extract<CardEffect, { type: "STRUCTURED" }>);
  }
  return result;
}

function ability(id: string, name: string, cost: number, description: string, config: Structured | null,
  tokenId?: string | null): ChampionAbility {
  return { id, name, cost, description, effects: effects(config, tokenId) };
}

export function championRecordToDefinition(record: PublishedChampionRecord): ChampionDefinition {
  const maxHealth = Number.isInteger(record.maxHealth) && record.maxHealth >= 1
    ? record.maxHealth
    : 20;
  const rewardActions = record.questRewardEffects?.effects ?? [];
  const tokenId = record.championTokenDefinitionId;
  const directTokenReward = typeof tokenId === "string" &&
    rewardActions.some((item) => item.action === "DIRECT_DEPLOY_CHAMPION_TOKEN");
  const structuredRewardEffects = effects(record.questRewardEffects, tokenId)
    .filter((item): item is Extract<ChampionEffect, { type: "STRUCTURED" | "SCRIPT" }> =>
      item.type === "SCRIPT" || (item.type === "STRUCTURED" && (ACTIONS as readonly string[]).includes(item.action)));
  const quest: ChampionQuest | null = record.hasQuest && record.questCondition?.event &&
    record.questName && record.questProgressRequired
    ? {
        id: `${record.id}-quest`, name: record.questName, description: record.questText ?? "",
        trackedEvent: record.questCondition.event as ChampionQuest["trackedEvent"],
         ...(record.questCondition.cardType ? { cardType: record.questCondition.cardType } : {}),
         ...(record.questCondition.sourceActionType ? { sourceActionType: record.questCondition.sourceActionType } : {}),
         ...(record.questCondition.progress ? { progressPerEvent: record.questCondition.progress } : {}),
        requiredProgress: record.questProgressRequired,
         reward: directTokenReward
           ? { type: "DIRECT_DEPLOY_CHAMPION_TOKEN", cardDefinitionId: tokenId }
           : rewardActions.some((item) => item.action === "UPGRADE_CHAMPION_ABILITY")
             ? {
                 type: "UPGRADE_ABILITY",
                 effects: structuredRewardEffects,
               }
             : structuredRewardEffects.length
               ? { type: "STRUCTURED", effects: structuredRewardEffects }
               : { type: "GAIN_GOLD", amount: 0 },
      }
    : null;
  return {
    id: record.id, name: record.name, description: record.description,
    imageAssetId: record.imageAssetId, imageUrl: record.imageUrl, maxHealth,
    imageDisplayMode: record.imageDisplayMode, imageScale: record.imageScale,
    imagePositionX: record.imagePositionX, imagePositionY: record.imagePositionY,
    questCompletedPortraitEnabled: record.questCompletedPortraitEnabled,
    questCompletedPortraitAssetId: record.questCompletedPortraitAssetId,
    questCompletedPortraitUrl: record.questCompletedPortraitUrl,
    introLineOne: record.introLineOne ?? null,
    introLineTwo: record.introLineTwo ?? null,
    abilityCost: record.abilityCost,
    ability: ability(`${record.id}-ability`, record.abilityName, record.abilityCost, record.abilityText,
      record.abilityEffects, record.championTokenDefinitionId),
    quest,
    upgradedAbility: record.upgradedAbilityName
      ? ability(`${record.id}-ability-upgraded`, record.upgradedAbilityName,
          record.upgradedAbilityCost ?? record.abilityCost,
          record.upgradedAbilityText ?? "", record.upgradedAbilityEffects,
          record.championTokenDefinitionId)
      : null,
    championTokenDefinitionId: record.championTokenDefinitionId,
    questCompleteAudioAssetId: record.questCompleteAudioAssetId,
    questCompleteAudioUrl: record.questCompleteAudioUrl,
    questCompleteAudioVolume: record.questCompleteAudioVolume,
    questCompleteAudioEnabled: record.questCompleteAudioEnabled,
    status: record.status, version: record.version,
  };
}

export async function fetchPublishedChampions(): Promise<ChampionDefinition[]> {
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const response = await fetch(`${apiBase}/champions`);
  if (!response.ok) return [];
  const body = await response.json() as { champions?: PublishedChampionRecord[] };
  return (body.champions ?? []).filter((item) => item.status === "PUBLISHED")
    .map(championRecordToDefinition);
}

/** Admin-only AI test pool: PUBLISHED plus DRAFT, never DISABLED. */
export async function fetchAiTestChampions(): Promise<ChampionDefinition[]> {
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const response = await fetch(`${apiBase}/admin/champions`, { credentials: "include" });
  if (!response.ok) throw new Error("AI 테스트 Champion 풀을 불러오지 못했습니다.");
  const body = (await response.json()) as { champions?: PublishedChampionRecord[] };
  return (body.champions ?? [])
    .filter((champion) => champion.status !== "DISABLED")
    .map(championRecordToDefinition);
}