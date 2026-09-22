import { normalizeCardRulesText } from "./display-labels";
import type { CardKeyword } from "../game/effects/types";

export const KEYWORD_RULE_LABELS: Partial<Record<CardKeyword, string>> = {
  TAUNT: "도발",
  RUSH: "러쉬",
  SURPRISE: "기습",
  DODGE: "회피",
  MULTI_STRIKE: "연타",
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
    keywordOnlyParts.every((part) => knownLabels.has(part))
  ) {
    const visibleLabels = new Set(
      visibleKeywords
        .map((keyword) => KEYWORD_RULE_LABELS[keyword])
        .filter((label): label is string => Boolean(label)),
    );
    return keywordOnlyParts
      .filter((part) => visibleLabels.has(part))
      .join(", ");
  }

  return normalized;
}