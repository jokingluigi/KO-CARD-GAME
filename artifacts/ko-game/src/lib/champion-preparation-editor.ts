import type { GameEventType } from "@/game/events/types";
/** Shared wording for both existing preparation and finisher option condition editors. */
export const PREPARATION_EVENTS: ReadonlyArray<
  readonly [GameEventType, string]
> = [
  ["CARD_PLAYED", "카드 사용"],
  ["ENTER_FIELD", "선수 등장"],
  ["CARD_GENERATED", "카드 생성"],
  ["CARD_DRAWN", "드로우"],
  ["CARD_RETIRED", "선수 리타이어"],
  ["CARD_DESTROYED", "파괴"],
  ["CARD_REMOVED", "카드 제외"],
  ["ATTACK_DECLARED", "공격 선언"],
  ["DAMAGE_DEALT", "피해 발생 횟수"],
  ["CHAMPION_ABILITY_USED", "고유 능력 사용"],
  ["GOLD_CHANGED", "골드 변동 횟수"],
  ["FUSION", "합체"],
  ["TURN_STARTED", "턴 시작"],
  ["TURN_ENDED", "턴 종료"],
];
