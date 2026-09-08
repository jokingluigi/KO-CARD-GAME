import { ACTION_SCHEMAS, EFFECT_CAPABILITIES, RUNTIME_HANDLER_ACTIONS } from "@workspace/effect-registry";
import { analyzeEffectText, effectLibrary, isStructuredEffects, type Analysis, type StructuredEffect } from "./structured-effects";

export type CompletionCheck = {
  id: "registry" | "schema" | "handler" | "resolver" | "analyzer" | "structured" | "tests";
  passed: boolean;
  reason: string;
};
export type CompletionValidation = {
  status: "recognized" | "partial" | "not_found";
  message: string;
  analysis: Analysis;
  checks: CompletionCheck[];
  supportedCapabilities: string[];
  unsupportedParts: string[];
  structuredEffect?: { effects: StructuredEffect[] };
};
type CompletionDependencies = {
  analyze: (text: string) => Analysis;
  library: () => ReturnType<typeof effectLibrary>;
  validateStructured: (value: unknown) => boolean;
};

/** Deliberately recomputes all registry-derived facts on each invocation. */
export function validateMechanicCompletion(
  text: string,
  overrides: Partial<CompletionDependencies> = {},
): CompletionValidation {
  const dependencies: CompletionDependencies = {
    analyze: analyzeEffectText, library: effectLibrary, validateStructured: isStructuredEffects, ...overrides,
  };
  const library = dependencies.library();
  const analysis = dependencies.analyze(text);
  const used = [...new Set(analysis.effects.map((effect) => effect.action))];
  const active = library.actions.filter((entry) => entry.status === "ACTIVE").map((entry) => entry.name);
  const registry = used.length > 0 &&
    used.every((action) => active.includes(action)) &&
    analysis.effects.every((effect) => library.triggers.some(
      (trigger) => trigger.name === effect.trigger && trigger.status === "ACTIVE",
    ));
  const schema = used.length > 0 && used.every((action) => Boolean(ACTION_SCHEMAS[action]));
  const handler = used.length > 0 && used.every((action) =>
    EFFECT_CAPABILITIES[action].runtimeHandler && RUNTIME_HANDLER_ACTIONS.includes(action));
  const resolver = used.length > 0 && used.every((action) => {
    const definition = ACTION_SCHEMAS[action];
    return (!definition.target || library.targetResolvers.some((item) => item.status === "ACTIVE")) &&
      (!definition.amount || library.valueResolvers.some((item) => item.name === "AMOUNT" && item.status === "ACTIVE")) &&
      (!definition.stats || library.valueResolvers.some((item) => item.name === "STAT_PAIR" && item.status === "ACTIVE")) &&
      (!definition.keyword || library.valueResolvers.some((item) => item.name === "KEYWORD" && item.status === "ACTIVE"));
  });
  const structured = analysis.effects.length > 0 && dependencies.validateStructured({ effects: analysis.effects });
  const analyzer = analysis.effects.length > 0;
  const checks: CompletionCheck[] = [
    { id: "registry", passed: registry, reason: registry ? "ACTIVE Effect Registry 등록을 확인했습니다." : "ACTIVE Effect Registry 등록을 찾지 못했습니다." },
    { id: "schema", passed: schema, reason: schema ? "Effect Schema를 확인했습니다." : "Effect Schema를 찾지 못했습니다." },
    { id: "handler", passed: handler, reason: handler ? "공유 handler registration contract를 확인했습니다." : "runtime handler registration을 찾지 못했습니다." },
    { id: "resolver", passed: resolver, reason: resolver ? "필요한 Target/Value Resolver를 확인했습니다." : "필요한 Target/Value Resolver가 없습니다." },
    { id: "analyzer", passed: analyzer, reason: analyzer ? "Analyzer mapping이 Structured Effect를 생성했습니다." : "Analyzer mapping이 새 효과를 생성하지 못했습니다." },
    { id: "structured", passed: structured, reason: structured ? "Structured Effect validation을 통과했습니다." : "Structured Effect validation을 통과하지 못했습니다." },
    { id: "tests", passed: false, reason: "관련 테스트 결과는 이 요청에서 확인할 수 없습니다." },
  ];
  const supportedCapabilities = [...new Set([
    ...analysis.effects.flatMap((effect) => [effect.trigger, effect.action]),
    ...analysis.keywords,
  ])];
  if (analysis.outcome === "supported" && checks.slice(0, 6).every((check) => check.passed)) {
    return { status: "recognized", message: "✓ 새 메커니즘이 정상적으로 인식되었습니다.", analysis, checks, supportedCapabilities, unsupportedParts: [], structuredEffect: { effects: analysis.effects } };
  }
  if (analysis.status === "partial" && analysis.effects.length > 0) {
    return { status: "partial", message: "⚠ 일부 기능은 추가되었지만 아직 효과 전체를 구현할 수 없습니다.", analysis, checks, supportedCapabilities, unsupportedParts: analysis.unsupportedSegments };
  }
  return { status: "not_found", message: "✗ 새 메커니즘을 Effect Library에서 찾을 수 없습니다.", analysis, checks, supportedCapabilities, unsupportedParts: analysis.unsupportedSegments };
}

export type CompletionApplyDecision =
  | { ok: true; values: { text: string; effectId: "STRUCTURED_EFFECTS_V1"; effectConfig: { effects: StructuredEffect[] }; resolvedEffectIds: string[]; status: "APPROVED" } }
  | { ok: false; reason: "CARD_NOT_DRAFT" | "SOURCE_TEXT_CHANGED" | "REVALIDATION_FAILED" };

/** Pure guard used immediately before the route's transaction writes anything. */
export function prepareCompletionApply(
  card: { status: string; text: string },
  originalCardText: string,
  validation: CompletionValidation,
  validateStructured: (value: unknown) => boolean = isStructuredEffects,
): CompletionApplyDecision {
  if (card.status !== "DRAFT") return { ok: false, reason: "CARD_NOT_DRAFT" };
  if (card.text !== originalCardText) return { ok: false, reason: "SOURCE_TEXT_CHANGED" };
  if (validation.status !== "recognized" || !validation.structuredEffect ||
    !validateStructured(validation.structuredEffect)) return { ok: false, reason: "REVALIDATION_FAILED" };
  return {
    ok: true,
    values: {
      text: originalCardText, effectId: "STRUCTURED_EFFECTS_V1",
      effectConfig: validation.structuredEffect,
      resolvedEffectIds: [...new Set(validation.structuredEffect.effects.map((effect) => effect.action))],
      status: "APPROVED",
    },
  };
}

/** Counts persisted structured actions; no action IDs are maintained here. */
export function countStructuredEffectUsage(cards: Iterable<{ effectId: string | null; effectConfig: unknown }>): Map<string, number> {
  const usage = new Map<string, number>();
  for (const card of cards) {
    if (card.effectId !== "STRUCTURED_EFFECTS_V1" || !isStructuredEffects(card.effectConfig)) continue;
    for (const action of new Set(card.effectConfig.effects.map((effect) => effect.action))) {
      usage.set(action, (usage.get(action) ?? 0) + 1);
    }
  }
  return usage;
}