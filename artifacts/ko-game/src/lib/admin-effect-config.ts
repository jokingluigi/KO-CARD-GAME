export type EffectExecutionId = "STRUCTURED_EFFECTS_V1" | "SCRIPT_V1";
export type EffectApplyMode = "replace" | "append";
export type GeneratedEffectDraft = {
  effectId: EffectExecutionId;
  effects: unknown[];
  scripts: unknown[];
  effectConfig?: { countdownTurns?: number };
};
export type StoredEffectConfig = {
  effects?: unknown[];
  scripts?: unknown[];
  armor?: number;
  dodgeCharges?: number;
  playCondition?: unknown;
  countdownTurns?: number;
};

export class EffectConfigApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EffectConfigApplyError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseConfig(value: unknown): StoredEffectConfig {
  let parsed = value;
  if (parsed == null) return {};
  if (typeof value === "string") {
    try {
      parsed = value.trim() ? JSON.parse(value) as unknown : {};
    } catch {
      throw new EffectConfigApplyError("현재 효과 설정 JSON이 올바르지 않아 추가할 수 없습니다. 기존 내용을 먼저 수정하거나 교체 모드를 선택해 주세요.");
    }
  }
  if (parsed == null) return {};
  if (!isRecord(parsed)) {
    throw new EffectConfigApplyError("현재 효과 설정이 객체가 아니어서 추가할 수 없습니다.");
  }
  for (const key of Object.keys(parsed)) {
    if (!["effects", "scripts", "armor", "dodgeCharges", "playCondition", "countdownTurns"].includes(key)) {
      throw new EffectConfigApplyError(`현재 효과 설정의 '${key}' 필드를 안전하게 보존할 수 없어 추가를 중단했습니다.`);
    }
  }
  if (parsed.effects !== undefined && !Array.isArray(parsed.effects)) {
    throw new EffectConfigApplyError("기존 effects 값이 배열이 아니어서 추가할 수 없습니다.");
  }
  if (parsed.scripts !== undefined && !Array.isArray(parsed.scripts)) {
    throw new EffectConfigApplyError("기존 scripts 값이 배열이 아니어서 추가할 수 없습니다.");
  }
  if (parsed.effects !== undefined && parsed.scripts !== undefined) {
    throw new EffectConfigApplyError("기존 설정에 두 실행 형식이 함께 있어 안전하게 추가할 수 없습니다.");
  }
  return parsed as StoredEffectConfig;
}

export function effectConfigExecution(value: unknown): EffectExecutionId | undefined {
  try {
    const parsed = parseConfig(value);
    if (parsed.effects !== undefined) return "STRUCTURED_EFFECTS_V1";
    if (parsed.scripts !== undefined) return "SCRIPT_V1";
  } catch {
    return undefined;
  }
  return undefined;
}

export function effectConfigEntryCount(value: unknown): number {
  try {
    const parsed = parseConfig(value);
    return parsed.effects?.length ?? parsed.scripts?.length ?? 0;
  } catch {
    return 0;
  }
}

export function mergeGeneratedEffectDraft(
  existingEffectId: string | null | undefined,
  existingConfig: unknown,
  draft: GeneratedEffectDraft,
  mode: EffectApplyMode,
): { effectId: EffectExecutionId; effectConfig: StoredEffectConfig } {
  if (!Array.isArray(draft.effects) || !Array.isArray(draft.scripts)) {
    throw new EffectConfigApplyError("컴파일 결과에 올바른 효과 배열이 없습니다.");
  }
  if (draft.effectId === "SCRIPT_V1" && draft.effects.length > 0) {
    throw new EffectConfigApplyError("SCRIPT_V1 초안에 일반 효과 배열도 있어 적용을 중단했습니다.");
  }
  if (draft.effectId === "STRUCTURED_EFFECTS_V1" && draft.scripts.length > 0) {
    throw new EffectConfigApplyError("Structured Effects 초안에 Script 배열도 있어 적용을 중단했습니다.");
  }

  const key = draft.effectId === "SCRIPT_V1" ? "scripts" : "effects";
  const incoming = draft.effectId === "SCRIPT_V1" ? draft.scripts : draft.effects;
  let savedConfig: StoredEffectConfig = {};
  try { savedConfig = parseConfig(existingConfig); } catch (error) { if (mode !== 'replace') throw error; }
  const {effects: _effects, scripts: _scripts, ...settings} = savedConfig;
  const countdownTurns = draft.effectConfig?.countdownTurns;
  if (countdownTurns !== undefined) {
    if (!Number.isSafeInteger(countdownTurns) || countdownTurns < 1 || countdownTurns > 999) throw new EffectConfigApplyError('카운트다운 생존 턴 수는 1~999의 정수여야 합니다.');
    if (mode === 'append' && settings.countdownTurns !== undefined && settings.countdownTurns !== countdownTurns &&
      [...(savedConfig.effects ?? []), ...(savedConfig.scripts ?? [])].some(effect => effect && typeof effect === 'object' && 'trigger' in effect && effect.trigger === 'COUNTDOWN')) {
      throw new EffectConfigApplyError('한 카드의 카운트다운 효과는 같은 생존 턴 수를 사용해야 합니다.');
    }
    settings.countdownTurns = countdownTurns;
  }
  if (mode === "replace") {
    return { effectId: draft.effectId, effectConfig: { ...settings, [key]: incoming } };
  }

  if (existingEffectId && existingEffectId !== draft.effectId) {
    throw new EffectConfigApplyError(
      `기존 실행 형식 ${existingEffectId}과 새 초안 ${draft.effectId}이 달라 추가할 수 없습니다. 기존 효과를 유지하려면 같은 실행 형식으로 생성하거나 교체 모드를 선택해 주세요.`,
    );
  }
  const currentConfig = parseConfig(existingConfig);
  const inferredExistingId = currentConfig.effects !== undefined
    ? "STRUCTURED_EFFECTS_V1"
    : currentConfig.scripts !== undefined ? "SCRIPT_V1" : undefined;
  if (inferredExistingId && inferredExistingId !== draft.effectId) {
    throw new EffectConfigApplyError(
      `기존 ${inferredExistingId} AST를 ${draft.effectId}로 변환할 수 없어 추가를 중단했습니다. 기존 효과는 변경되지 않았습니다.`,
    );
  }
  const current = currentConfig[key] ?? [];
  return {
    effectId: draft.effectId,
    effectConfig: { ...settings, [key]: [...current, ...incoming] },
  };
}

/** Editing effect wording invalidates its compiled actions, but keeps keyword numbers. */
export function keywordSettingsAfterTextEdit(value: unknown): StoredEffectConfig {
  try {
    const {effects: _effects, scripts: _scripts, ...settings} = parseConfig(value);
    return settings;
  } catch { return {}; }
}
