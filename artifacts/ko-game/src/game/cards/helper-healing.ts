import type { CardAbility } from "../effects/types";
export const HELPER_ID = "5f1fd584-7129-4f39-91a4-22f02ba677e5";
export const HELPER_LEGACY_TEXT =
  "등장:손패에 '냥냥 펀치'를 추가합니다.\n턴 시작:지난 턴에 아군 선수 카드와 챔피언이 체력을 회복했다면 손패에 '냥냥 펀치'를 추가한다.";
export const HELPER_RULES_TEXT = HELPER_LEGACY_TEXT.replace(
  "아군 선수 카드와 챔피언이",
  "아군 선수 카드나 아군 챔피언 중 하나라도",
);
const clean = (text: string) => text.replace(/\s+/gu, "");
/** Only the reviewed current healing condition is changed; older overflow cards stay historical. */
export function normalizeHelperHealing<
  T extends { id: string; text: string; effectId?: unknown },
>(card: T): T {
  if (
    card.id !== HELPER_ID ||
    card.effectId ||
    clean(card.text) !== clean(HELPER_LEGACY_TEXT)
  )
    return card;
  return { ...card, text: HELPER_RULES_TEXT };
}
export function helperHealingAbilities(card: {
  id: string;
  text: string;
  effectId?: unknown;
}): CardAbility[] | null {
  const normalized = normalizeHelperHealing(card);
  if (
    normalized.id !== HELPER_ID ||
    normalized.effectId ||
    clean(normalized.text) !== clean(HELPER_RULES_TEXT)
  )
    return null;
  const generate = {
    type: "STRUCTURED" as const,
    action: "GENERATE" as const,
    values: {
      definitionRef: { id: "e584c34e-d640-4c41-a148-cfb70389f08a" },
      destination: "HAND" as const,
      count: 1,
    },
  };
  return [
    { trigger: "ENTER_FIELD", effects: [generate] },
    {
      trigger: "TURN_START",
      condition: { type: "PREVIOUS_OWN_TURN_ANY_HEALED" },
      effects: [generate],
    },
  ];
}
