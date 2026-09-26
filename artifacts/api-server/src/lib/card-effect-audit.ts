import { isEffectScriptConfig, isStructuredEffects, type Analysis } from "./structured-effects";

type CardForAudit = {
  id: string;
  text: string;
  keywords: string[];
  effectId: string | null;
  effectConfig: unknown;
};

export type CardEffectAudit = {
  id: string;
  status: "missing" | "review" | "aligned" | "none";
  reason: string;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A static discrepancy check, never proof that a match actually executes in a game. */
export function auditCardEffect(card: CardForAudit, analysis?: Analysis): CardEffectAudit {
  const result = (status: CardEffectAudit["status"], reason: string): CardEffectAudit =>
    ({ id: card.id, status, reason });
  if (!card.text.trim()) {
    return card.effectId || card.keywords.length
      ? result("review", "효과 문구는 비어 있지만 실행 설정이 있습니다.")
      : result("none", "효과 문구가 없는 카드입니다.");
  }
  if (!analysis || analysis.outcome !== "supported" || analysis.status !== "success") {
    return result("review", "현재 문구 분석기로 효과를 모두 해석할 수 없어 직접 확인이 필요합니다.");
  }
  const missingKeywords = analysis.keywords.filter((keyword) => !card.keywords.includes(keyword));
  if (missingKeywords.length) return result("missing", `문구에 있는 키워드가 설정에 없습니다: ${missingKeywords.join(", ")}`);

  if (analysis.effects.length === 0) {
    return card.effectId
      ? result("review", "문구에서 실행 효과가 감지되지 않았지만 효과 설정이 있습니다.")
      : result("none", "문구에서 별도 실행 효과가 감지되지 않았습니다.");
  }
  if (!card.effectId) return result("missing", "문구에서 실행 효과가 감지됐지만 저장된 효과 ID가 없습니다.");
  if (card.effectId === "STRUCTURED_EFFECTS_V1") {
    if (!isStructuredEffects(card.effectConfig)) return result("missing", "저장된 구조화 효과가 없거나 형식이 잘못됐습니다.");
    return canonical(analysis.effects) === canonical(card.effectConfig.effects)
      ? result("aligned", "문구 분석 결과와 저장된 구조화 효과가 일치합니다. 경기 동작은 별도 확인이 필요합니다.")
      : result("review", "문구 분석 결과와 저장된 효과 설정이 다릅니다. 실제 의도와 동작을 확인해 주세요.");
  }
  if (card.effectId === "SCRIPT_V1" && !isEffectScriptConfig(card.effectConfig)) {
    return result("missing", "저장된 스크립트 효과 형식이 잘못됐습니다.");
  }
  return result("review", "이 카드의 스크립트 또는 기존 효과는 문구와 자동 대조할 수 없습니다.");
}
