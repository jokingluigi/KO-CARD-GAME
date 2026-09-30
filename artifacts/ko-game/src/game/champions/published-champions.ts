import { validChampionQuestCondition } from '../../../../../lib/game-engine/src/champion-quest-conditions';
import type { ChampionAbility, ChampionDefinition, ChampionEffect, ChampionQuest, ChampionQuestCardType, ChampionPresentationLines } from "./types";
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
  questCondition: { condition?: unknown; selfEffectDamage?: boolean; strictEventCount?: boolean; event?: string; cardType?: ChampionQuestCardType; sourceActionType?: string; progress?: number; required?: number } | null; questProgressRequired: number | null;
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
  presentationLines?: ChampionPresentationLines;
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
  const ontoField = /(?:필드에|필드로)[^.!?]{0,35}(?:생성|소환|전개)/.test(description);
  return { id, name, cost, description, effects: effects(config, tokenId).map((effect) =>
    ontoField && effect.type === 'STRUCTURED' && effect.action === 'GENERATE'
      ? { ...effect, action: 'SUMMON' as const }
      : effect) };
}

export function championRecordToDefinition(record: PublishedChampionRecord): ChampionDefinition {
  const abilityRetireQuest = /(?:자신의|본인의)\s*고유\s*능력으로[^.!?]{0,55}(?:선수|카드)[^.!?]{0,25}리타이어/.test(record.questText ?? '');
  const maxHealth = Number.isInteger(record.maxHealth) && record.maxHealth >= 1
    ? record.maxHealth
    : 20;
  const rewardActions = record.questRewardEffects?.effects ?? [];
  const tokenId = record.championTokenDefinitionId;
  const directTokenReward = typeof tokenId === "string" &&
    (rewardActions.some((item) => item.action === "DIRECT_DEPLOY_CHAMPION_TOKEN") ||
      (record.name.replace(/\s+/gu, "").includes("판도라") &&
        /(?:소환|전개)/u.test(record.questRewardText ?? "") &&
        rewardActions.every((item) => item.action === "UPGRADE_CHAMPION_ABILITY")));
  const structuredRewardEffects = effects(record.questRewardEffects, tokenId)
    .filter((item): item is Extract<ChampionEffect, { type: "STRUCTURED" | "SCRIPT" }> =>
      item.type === "SCRIPT" || (item.type === "STRUCTURED" && (ACTIONS as readonly string[]).includes(item.action)));
  const quest: ChampionQuest | null = record.hasQuest && record.questCondition?.event &&
    record.questName && record.questProgressRequired
    ? {
        id: `${record.id}-quest`, name: record.questName, description: record.questText ?? "",
        rewardText: record.questRewardText?.trim() || undefined,
        ...(validChampionQuestCondition(record.questCondition.condition) ? { condition: record.questCondition.condition } : {}),
        trackedEvent: abilityRetireQuest ? 'CARD_RETIRED' : record.questCondition.event as ChampionQuest["trackedEvent"],
         ...(abilityRetireQuest ? { cardType: 'WRESTLER' as const } : record.questCondition.cardType ? { cardType: record.questCondition.cardType } : {}),
         ...(abilityRetireQuest ? { sourceActionType: 'USE_CHAMPION_ABILITY' } : record.questCondition.sourceActionType ? { sourceActionType: record.questCondition.sourceActionType } : {}),
         ...(record.questCondition.progress ? { progressPerEvent: record.questCondition.progress } : {}),
        ...(record.questCondition.strictEventCount ? { strictEventCount: true } : {}),
        ...(record.questCondition.selfEffectDamage ? { selfEffectDamage: true } : {}),
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
  const definition: ChampionDefinition = {
    id: record.id, name: record.name, description: record.description,
    imageAssetId: record.imageAssetId, imageUrl: record.imageUrl, maxHealth,
    imageDisplayMode: record.imageDisplayMode, imageScale: record.imageScale,
    imagePositionX: record.imagePositionX, imagePositionY: record.imagePositionY,
    questCompletedPortraitEnabled: record.questCompletedPortraitEnabled,
    questCompletedPortraitAssetId: record.questCompletedPortraitAssetId,
    questCompletedPortraitUrl: record.questCompletedPortraitUrl,
    introLineOne: record.introLineOne ?? null,
    introLineTwo: record.introLineTwo ?? null,
    presentationLines: record.presentationLines ?? {},
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
  if (!record.questCondition?.selfEffectDamage && /^(?:챔피언)?퍼플레인$/u.test(record.name.replace(/\s+/gu, ''))) {
    const makeAbility = (amount: number, upgraded: boolean): ChampionAbility => ({
      id: `${record.id}-ability${upgraded ? '-upgraded' : ''}`,
      name: (upgraded ? record.upgradedAbilityName : record.abilityName) || '퍼플레인',
      cost: upgraded ? record.upgradedAbilityCost ?? record.abilityCost : record.abilityCost,
      description: `내 챔피언 또는 아군 선수 1장에게 ${amount} 피해를 줍니다. 챔피언이면 카드 1장을 뽑고 그 카드의 비용을 ${amount} 감소시킵니다. 선수이면 공격력 +${amount}을 부여합니다.`,
      effects: [{ type: 'STRUCTURED', action: 'DAMAGE',
        target: { zone: 'CHARACTER', owner: 'SELF', selection: 'PLAYER_CHOICE', count: 1 },
        values: { amount, purpleRainFollowup: true } }],
    });
    definition.ability = makeAbility(1, false);
    definition.upgradedAbility = makeAbility(2, true);
    definition.quest = { id: `${record.id}-quest`, name: record.questName || '자해 8회',
      description: '이번 게임에서 내 카드 또는 챔피언 효과로 내 챔피언 또는 아군 선수가 피해를 총 8회 받으세요. 상대 효과와 전투 피해는 제외합니다.',
      rewardText: '고유 능력이 강화됩니다.', trackedEvent: 'DAMAGE_DEALT', selfEffectDamage: true,
      requiredProgress: 8, reward: { type: 'UPGRADE_ABILITY' } };
  }
  if (record.questProgressRequired !== 10 && /^(?:챔피언)?라칼라베라$/u.test(record.name.replace(/\s+/gu, ''))) {
    const summon = (amount: number, upgraded: boolean): ChampionAbility => ({
      id: `${record.id}-ability${upgraded ? '-upgraded' : ''}`,
      name: (upgraded ? record.upgradedAbilityName : record.abilityName) || '좀비 소환',
      cost: upgraded ? record.upgradedAbilityCost ?? record.abilityCost : record.abilityCost,
      description: `1코스트 ${amount}/${amount} 좀비를 소환합니다.`,
      effects: [{ type: 'STRUCTURED', action: 'SUMMON', values: {
        definitionRef: { name: '좀비' }, count: 1,
        generatedModifiers: { attack: amount - 1, health: amount - 1 },
      } }],
    });
    definition.ability = summon(1, false);
    definition.upgradedAbility = summon(2, true);
    definition.quest = { id: `${record.id}-quest`, name: record.questName || '아군 리타이어 10회',
      description: '이번 게임에서 아군 선수가 총 10회 리타이어하세요. DESTROY는 포함하지 않습니다.',
      rewardText: '고유 능력이 강화됩니다.', trackedEvent: 'CARD_RETIRED', cardType: 'WRESTLER',
      strictEventCount: true, requiredProgress: 10, reward: { type: 'UPGRADE_ABILITY' } };
  }
  return definition;
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
