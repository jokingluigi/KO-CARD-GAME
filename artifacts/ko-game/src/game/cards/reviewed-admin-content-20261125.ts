import type { PublishedCardRecord } from "./published-cards";
import type { CardAbility, CardEffect, StructuredTarget } from "../effects/types";

/**
 * 2026-11-25 관리자 신규 카드: 스타라 / 대망의 라스트 스테이지.
 * 카드 글이 아래와 같을 때만 적용한다 (관리자가 글을 바꾸면 이 구현은 자동으로 빠진다).
 */
const reviewedTexts: Record<string, string> = {
  // 스타라
  "5a980204-0e83-446f-9660-f893b28d23af": "카운트다운(3):'대망의 라스트 스테이지'를 발동합니다.",
  // 대망의 라스트 스테이지 (토큰 기술)
  "30900369-2bc3-43c0-8db1-e1f14909f9a8":
    "모두에게 10 데미지를 줍니다. 이 효과로 양 측의 챔피언이 동시에 체력이 다 떨어지면 상대 챔피언의 승리입니다.",
};
const clean = (s: string) => s.replace(/\s/gu, "");
const fx = (
  action: Extract<CardEffect, { type: "STRUCTURED" }>["action"],
  target?: StructuredTarget,
  values?: Extract<CardEffect, { type: "STRUCTURED" }>["values"],
): CardEffect => ({ type: "STRUCTURED", action, target, values });

/**
 * 모두에게 10 데미지: 양쪽 필드의 모든 선수 + 양쪽 챔피언.
 * 각각 따로 처리하고, 선수 데미지는 맨 마지막에 둔다
 * (스타라 자신이 도중에 쓰러지면 뒤에 남은 효과가 한 번 더 실행되는 엔진 동작을 피하기 위함).
 * 챔피언은 상대 → 자기 순서로: 둘 다 쓰러지면 마지막에 쓰러진 쪽(발동한 쪽)의 패배로 끝나
 * '동시에 쓰러지면 상대 챔피언 승리' 규칙이 지켜진다.
 */
export const LAST_STAGE_EFFECTS: CardEffect[][] = [
  [fx("DAMAGE", { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 }, { amount: 10 })],
  [fx("DAMAGE", { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 }, { amount: 10 })],
  [fx("DAMAGE", { zone: "BOARD", owner: "ALL", cardType: "WRESTLER", selection: "ALL", count: 16 }, { amount: 10 })],
];
const stageAbilities = (trigger: CardAbility["trigger"]) =>
  LAST_STAGE_EFFECTS.map(effects => ({ trigger, effects }) as CardAbility);

export function reviewedNovember25Abilities(card: PublishedCardRecord): CardAbility[] | null {
  if (card.effectId || !reviewedTexts[card.id] || clean(reviewedTexts[card.id]!) !== clean(card.text)) return null;
  switch (card.id) {
    case "5a980204-0e83-446f-9660-f893b28d23af":
      return stageAbilities("COUNTDOWN");
    case "30900369-2bc3-43c0-8db1-e1f14909f9a8":
      return stageAbilities("ACTIVE");
    default:
      return null;
  }
}
