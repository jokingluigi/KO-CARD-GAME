export type ChampionQuestAnalysis =
  | {
      outcome: "supported";
      condition: Record<string, unknown>;
    }
  | {
      outcome: "mechanism_required" | "analysis_failure";
      unsupportedParts: string[];
    };

const QUEST_PATTERNS: Array<{
  pattern: RegExp;
  condition: Record<string, unknown>;
}> = [
  {
    pattern: /(?:선수\s*)?카드.*생성|생성.*(?:선수\s*)?카드/i,
    condition: { event: "CARD_GENERATED", cardType: "WRESTLER", progress: 1 },
  },
  {
    pattern: /선수.*(?:리타이어|퇴장)/i,
    condition: { event: "WRESTLER_RETIRED", cardType: "WRESTLER" },
  },
  {
    pattern: /챔피언.*능력.*(?:사용|발동)|고유\s*능력.*(?:사용|발동)/i,
    condition: { event: "CHAMPION_ABILITY_USED", progress: 1 },
  },
  {
    pattern: /카드.*(?:뽑|드로우)/i,
    condition: { event: "CARD_DRAWN", progress: 1 },
  },
];

export function analyzeChampionQuestText(text: string): ChampionQuestAnalysis {
  const trimmed = text.trim();
  const required = Number(trimmed.match(/(\d+)\s*(?:회|번|장|명)/)?.[1]);
  if (!Number.isInteger(required) || required < 1) {
    return { outcome: "analysis_failure", unsupportedParts: [trimmed] };
  }

  const match = QUEST_PATTERNS.find(({ pattern }) => pattern.test(trimmed));
  if (!match) {
    return { outcome: "mechanism_required", unsupportedParts: [trimmed] };
  }

  return {
    outcome: "supported",
    condition: { ...match.condition, required },
  };
}