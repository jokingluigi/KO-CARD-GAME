export function cardTypeLabel(cardType: string): string {
  if (cardType === "WRESTLER") return "선수";
  if (cardType === "TECHNIQUE") return "기술";
  return cardType;
}

export function deckValidityLabel(isValid: boolean): string {
  return isValid ? "사용 가능" : "수정 필요";
}

/**
 * Corrects display-only spacing and grammar issues in stored card copy.
 * Runtime effect parsing continues to use the original text.
 */
export function normalizeCardRulesText(text: string): string {
  return text
    .replaceAll("현재 공격과 체력을의 수치 서로", "현재 공격력과 체력의 수치를 서로")
    .replaceAll("현재 공격과 체력을의 수치", "현재 공격력과 체력의 수치")
    .replaceAll("소환될때", "소환될 때")
    .replaceAll("이번턴", "이번 턴")
    .replaceAll("다음턴", "다음 턴")
    .replaceAll("턴종료", "턴 종료")
    .replaceAll("무덤", "묘지")
    .replaceAll("코스트", "비용")
    .replaceAll("Gold", "골드")
    .replace(/(\d+)G/g, "$1 골드");
}