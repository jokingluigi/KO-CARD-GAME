export type AwakeningStage = "TANK" | "HEALER" | "DEALER";
export type AwakeningPower = 0 | 1 | 2 | 3 | 4;
export interface AwakeningQuestConfig {
  stageCardIds: Record<AwakeningStage, string>;
  fullBoardPolicy: "WAIT_WITHOUT_INVULNERABILITY";
}
export interface AwakeningState {
  sequenceId: string;
  awakeningPower: AwakeningPower;
  sequenceActive: boolean;
  stage: AwakeningStage | "FINISHED";
  activeStageInstanceId: string | null;
  championInvulnerable: boolean;
  pendingStage: boolean;
  pendingCounterCombatId?: string;
  lastCounterCombatId?: string;
}
export interface AwakeningCardState {
  sequenceId: string;
  stage: AwakeningStage;
  awakeningPower: AwakeningPower;
  baseAttack: number;
  baseHealth: number;
  lastCounterCombatId?: string;
}
export function validAwakeningQuestConfig(
  value: unknown,
): value is AwakeningQuestConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as AwakeningQuestConfig;
  return (
    config.fullBoardPolicy === "WAIT_WITHOUT_INVULNERABILITY" &&
    Boolean(
      config.stageCardIds &&
      ["TANK", "HEALER", "DEALER"].every(
        (stage) =>
          typeof config.stageCardIds[stage as AwakeningStage] === "string" &&
          config.stageCardIds[stage as AwakeningStage].trim(),
      ),
    ) &&
    new Set(Object.values(config.stageCardIds)).size === 3
  );
}

export function isAwakeningStage(value: unknown): value is AwakeningStage {
  return value === "TANK" || value === "HEALER" || value === "DEALER";
}

export function validAwakeningHealthCondition(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const node = value as { type?: unknown; conditions?: unknown };
  if (
    node.type !== "ALL" ||
    !Array.isArray(node.conditions) ||
    node.conditions.length !== 2
  )
    return false;
  return [
    ["GTE", 1],
    ["LTE", 5],
  ].every(
    ([op, amount]) =>
      node.conditions instanceof Array &&
      node.conditions.some((condition) => {
        if (!condition || typeof condition !== "object") return false;
        const leaf = condition as Record<string, unknown>;
        return (
          leaf.type === "HEALTH" &&
          leaf.owner === "SELF" &&
          leaf.op === op &&
          leaf.value === amount
        );
      }),
  );
}
