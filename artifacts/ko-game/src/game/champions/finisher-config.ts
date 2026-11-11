import { validChampionQuestCondition } from "../../../../../lib/game-engine/src/champion-quest-conditions";
import type { FinisherReward, FinisherChoice } from "./types";
export function validFinisherReward(value: unknown): value is FinisherReward {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).every((k) => k === "cardDefinitionId" || k === "delivery") &&
    typeof v.cardDefinitionId === "string" &&
    v.cardDefinitionId.length > 0 &&
    v.cardDefinitionId.length <= 120 &&
    (v.delivery === undefined || v.delivery === "HAND" || v.delivery === "CAST")
  );
}

export function validFinisherChoices(
  value: unknown,
): value is FinisherChoice[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8)
    return false;
  const ids = new Set<string>();
  return value.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return false;
    if (
      Object.keys(entry).some(
        (key) =>
          ![
            "id",
            "name",
            "description",
            "condition",
            "cardDefinitionId",
            "delivery",
          ].includes(key),
      )
    )
      return false;
    if (
      typeof entry.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id) ||
      ids.has(entry.id)
    )
      return false;
    ids.add(entry.id);
    return (
      typeof entry.name === "string" &&
      entry.name.trim().length > 0 &&
      entry.name.length <= 120 &&
      typeof entry.description === "string" &&
      entry.description.length <= 2000 &&
      typeof entry.cardDefinitionId === "string" &&
      entry.cardDefinitionId.length > 0 &&
      entry.cardDefinitionId.length <= 120 &&
      (entry.delivery === undefined ||
        entry.delivery === "HAND" ||
        entry.delivery === "CAST") &&
      validChampionQuestCondition(entry.condition)
    );
  });
}
