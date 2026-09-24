import type { OnlineActionPayload } from "./online-match-protocol";

function hasPlayerChoiceTarget(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasPlayerChoiceTarget);

  const record = value as Record<string, unknown>;
  const target = record.target;
  if (
    target &&
    typeof target === "object" &&
    (target as Record<string, unknown>).selection === "PLAYER_CHOICE"
  ) {
    return true;
  }
  return Object.values(record).some(hasPlayerChoiceTarget);
}

export function championAbilityAction(
  abilityEffects: unknown,
): OnlineActionPayload | null {
  if (!Array.isArray(abilityEffects)) return null;
  if (hasPlayerChoiceTarget(abilityEffects)) {
    return {
      type: "BEGIN_TARGETED_ACTION",
      action: { type: "USE_CHAMPION_ABILITY" },
    };
  }
  return { type: "USE_CHAMPION_ABILITY" };
}

export function effectTargetAction(
  phase: "PRE_COMMIT" | "POST_COMMIT" | undefined,
  targetId: string,
): OnlineActionPayload {
  return phase === "PRE_COMMIT"
    ? { type: "CONFIRM_PRECOMMIT_TARGET", targetId }
    : { type: "SELECT_EFFECT_TARGET", targetId };
}

export function shouldResyncAfterActionRejection(
  code: string,
  currentVersion: number,
  rejectedVersion: number | null,
): boolean {
  return (
    rejectedVersion !== null && rejectedVersion !== currentVersion
  ) || ["STALE_VERSION", "INVALID_TARGET", "NO_VALID_TARGET", "TARGET_SELECTION_PENDING"].includes(code);
}