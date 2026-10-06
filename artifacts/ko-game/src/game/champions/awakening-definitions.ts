import type { CardDefinition } from "../cards/types";
import type { ChampionDefinition } from "./types";
import type { AwakeningQuestConfig, AwakeningStage } from "./awakening-types";

export const AWAKENING_CARD_IDS = {
  TANK: "crisis-awakening-tank",
  HEALER: "crisis-awakening-healer",
  DEALER: "crisis-awakening-dealer",
} as const;
export const AWAKENING_QUEST_TEXT = "내 Champion의 HP가 5 이하가 됩니다.";
export const AWAKENING_CARD_STATS = {
  TANK: { attack: 3, health: 7 },
  HEALER: { attack: 3, health: 5 },
  DEALER: { attack: 6, health: 4 },
} as const;
const texts: Record<AwakeningStage, string> = {
  TANK: "반격: 상대 선수에게 공격받으면 전투 처리 후 공격자에게 1 + 각성 수치의 추가 피해를 줍니다. 전투로 리타이어해도 한 번 처리합니다.",
  HEALER:
    "내 턴 종료: 내 챔피언과 자신을 포함한 모든 아군 선수를 3 회복합니다.",
  DEALER:
    "관통 공격: 상대 선수를 공격하면 전투 피해 전에 1 + 각성 수치의 추가 피해를 줍니다. 추가 피해만 아머를 무시합니다.",
};
export function createAwakeningCards(
  art: Partial<
    Record<
      AwakeningStage,
      Pick<CardDefinition, "name" | "imageAssetId" | "imageUrl">
    >
  > = {},
): CardDefinition[] {
  return (["TANK", "HEALER", "DEALER"] as const).map((stage) => ({
    id: AWAKENING_CARD_IDS[stage],
    name: art[stage]?.name ?? `AWAKEN_${stage}`,
    cardType: "WRESTLER",
    rarity: "CHAMPION",
    cost: 0,
    ...AWAKENING_CARD_STATS[stage],
    rulesText: texts[stage],
    isToken: true,
    isChampionToken: true,
    questExclusive: true,
    awakeningStage: stage,
    keywords: [],
    abilities: [],
    status: "DRAFT",
    effectId: null,
    effectConfig: { questExclusive: true, awakeningStage: stage },
    ...(art[stage] ?? {}),
  }));
}

/** Caller supplies the champion's real name, HP, portrait and ordinary ability. */
export function withCrisisAwakeningQuest(
  champion: ChampionDefinition,
  fullBoardPolicy: AwakeningQuestConfig["fullBoardPolicy"],
): ChampionDefinition {
  return {
    ...champion,
    quest: {
      id: `${champion.id}-crisis-awakening`,
      name: "위기 각성",
      description: AWAKENING_QUEST_TEXT,
      trackedEvent: "DAMAGE_DEALT",
      requiredProgress: 1,
      condition: {
        type: "ALL",
        conditions: [
          { type: "HEALTH", owner: "SELF", op: "GTE", value: 1 },
          { type: "HEALTH", owner: "SELF", op: "LTE", value: 5 },
        ],
      },
      awakening: { stageCardIds: { ...AWAKENING_CARD_IDS }, fullBoardPolicy },
      reward: { type: "STRUCTURED", effects: [] },
      rewardText:
        "각성 수치를 확정하고 탱커 → 힐러 → 딜러를 연쇄 소환합니다. 소환된 각성 카드가 필드에 있는 동안 내 챔피언은 무적입니다.",
    },
  };
}
