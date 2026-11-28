import { normalizeCardRulesText } from "./display-labels";
import type { CardKeyword } from "../game/effects/types";
import type { CardInstance } from "../game/cards/types";

export const KEYWORD_RULE_LABELS: Partial<Record<CardKeyword, string>> = {
  WANTED: '수배', COUNTDOWN: '카운트다운', IMMUNE: '면역', REGEN: '치유', ARMOR: '아머', CONDITION: '조건', DEFENSE: '방어', LIFESTEAL: '흡혈',

  TAUNT: "도발",
  RUSH: "러쉬",
  SURPRISE: "기습",
  DODGE: "회피",
  MULTI_STRIKE: "연타",
  CANNOT_ATTACK: "공격불가",
  FUSION: "합체",
};

export function getVisibleCardKeywords(
  runtimeKeywords: CardKeyword[],
  isSilenced: boolean,
  dodgeCharges: number,
): CardKeyword[] {
  if (isSilenced) return [];
  return runtimeKeywords.filter(
    (keyword) => keyword !== "DODGE" || dodgeCharges > 0,
  );
}

export function getVisibleCardRulesText(
  rulesText: string,
  visibleKeywords: CardKeyword[],
): string {
  const normalized = normalizeCardRulesText(rulesText);
  const keywordNames = visibleKeywords
    .map((keyword) => KEYWORD_RULE_LABELS[keyword])
    .filter((label): label is string => Boolean(label));
  const keywordOnlyParts = normalized
    .split(/\s*[,，]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const knownLabels = new Set(
    Object.values(KEYWORD_RULE_LABELS).filter(
      (label): label is string => Boolean(label),
    ),
  );

  if (
    keywordOnlyParts.length > 0 &&
    keywordOnlyParts.every((part) => knownLabels.has(part.replace(/^공격\s+불가$/, "공격불가")))
  ) {
    const visibleLabels = new Set(
      visibleKeywords
        .map((keyword) => KEYWORD_RULE_LABELS[keyword])
        .filter((label): label is string => Boolean(label)),
    );
    return keywordOnlyParts
      .filter((part) => visibleLabels.has(part.replace(/^공격\s+불가$/, "공격불가")))
      .join(", ");
  }
  // "공격불가" is also printed as "공격 불가"; either spelling counts as already shown.
  const labelPattern = (label: string) =>
    label === "공격불가" ? "공격\\s*불가" : label;
  const missing = [...new Set(keywordNames)].filter((label) =>
    !new RegExp(`(^|[^가-힣])${labelPattern(label)}(?=$|[^가-힣])`).test(normalized));
  return [missing.join(", "), normalized].filter(Boolean).join("\n");
}

export function getCardRuntimeRulesText(
  card: Pick<CardInstance, "isSilenced" | "grantedText">,
  printedRulesText: string,
): string {
  if (card.isSilenced) return card.grantedText?.rulesText ?? "";
  if (!card.grantedText?.rulesText) return printedRulesText;
  if (!printedRulesText) return card.grantedText.rulesText;
  return `${printedRulesText}\n${card.grantedText.rulesText}`;
}
