import type { GameEvent, GameEventType } from "../../../artifacts/ko-game/src/game/events/types";

export const QUEST_CONDITION_SCHEMA_VERSION = "QUEST_CONDITION_V2" as const;
export const QUEST_AGGREGATIONS = ["COUNT", "SUM"] as const;
export type QuestAggregation = (typeof QUEST_AGGREGATIONS)[number];

export type QuestFilters = {
  owner?: "SELF" | "ENEMY";
  cardType?: "WRESTLER" | "TECHNIQUE";
  tagsAny?: string[];
  tagsAll?: string[];
  tagsNone?: string[];
  sourceActionType?: string;
  sourcePlayer?: "SELF" | "ENEMY";
  targetOwner?: "SELF" | "ENEMY";
  entryCause?: "PLAY_FROM_HAND" | "SUMMON" | "REVIVE" | "CHAMPION_DEPLOY";
  stat?: "cost" | "attack" | "health" | "maxHealth" | "currentHealth";
  amount?: { op: "EQ" | "GT" | "GTE" | "LT" | "LTE"; value: number };
};

export type QuestConditionNode = {
  event?: GameEventType;
  filters?: QuestFilters;
  allOf?: QuestConditionNode[];
  anyOf?: QuestConditionNode[];
};

export type QuestConditionV2 = {
  schemaVersion: typeof QUEST_CONDITION_SCHEMA_VERSION;
  condition: QuestConditionNode;
  progress: { mode: QuestAggregation; field?: "amount" | "delta" | "before" | "after" };
  required: number;
};

type RegistryEntry = { fields: readonly string[]; numeric: readonly string[] };
const common = ["owner", "cardType", "tagsAny", "tagsAll", "tagsNone", "sourceActionType", "sourcePlayer", "targetOwner"];
const registry: Partial<Record<GameEventType, RegistryEntry>> = {};
const eventTypes: GameEventType[] = [
  "TURN_STARTED", "TURN_ENDED", "TURN_TIMEOUT", "CARD_DRAWN", "CARD_PLAYED", "ENTER_FIELD",
  "CARD_GENERATED", "CARD_DESTROYED", "CARD_RETIRED", "CARD_REMOVED", "DAMAGE_DEALT",
  "ATTACK_DECLARED", "GOLD_CHANGED", "CHAMPION_ABILITY_USED", "CHAMPION_QUEST_PROGRESS",
  "CHAMPION_QUEST_COMPLETED", "STAT_CHANGED", "CARD_TEXT_GRANTED", "SURRENDER",
];
for (const event of eventTypes) registry[event] = { fields: common, numeric: [] };
registry.ENTER_FIELD = { fields: [...common, "entryCause"], numeric: [] };
registry.STAT_CHANGED = { fields: [...common, "stat", "before", "after", "delta"], numeric: ["before", "after", "delta"] };
registry.DAMAGE_DEALT = { fields: [...common, "amount"], numeric: ["amount"] };
registry.GOLD_CHANGED = { fields: [...common, "amount"], numeric: ["amount"] };
registry.CHAMPION_QUEST_PROGRESS = { fields: [...common, "amount"], numeric: ["amount"] };
registry.CHAMPION_QUEST_COMPLETED = { fields: [...common, "amount"], numeric: ["amount"] };

export function questEventRegistry() {
  return Object.fromEntries(Object.entries(registry).map(([event, value]) => [event, { ...value }]));
}

const filterKeys = new Set(Object.values(registry).flatMap((entry) => entry?.fields ?? []));
const numericKeys = new Set(["amount", "delta", "before", "after"]);
const operators = new Set(["EQ", "GT", "GTE", "LT", "LTE"]);
const MAX_DEPTH = 4;

function validTags(value: unknown) {
  return Array.isArray(value) && value.length > 0 && value.every((tag) => typeof tag === "string" && tag.length > 0 && tag.length <= 80);
}

function validateNode(node: unknown, depth: number): string | null {
  if (!node || typeof node !== "object" || Array.isArray(node) || depth > MAX_DEPTH) return "invalid condition node";
  const value = node as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.some((key) => !["event", "filters", "allOf", "anyOf"].includes(key))) return "unknown condition field";
  const hasLeaf = value.event !== undefined || value.filters !== undefined;
  const hasChildren = value.allOf !== undefined || value.anyOf !== undefined;
  if (hasLeaf === hasChildren || (value.allOf !== undefined && value.anyOf !== undefined)) return "condition must be a leaf or one composite";
  const event = value.event as GameEventType | undefined;
  if (hasLeaf && event === undefined) return "every leaf requires an event";
  if (event !== undefined && !eventTypes.includes(event)) return "unknown event";
  if (value.filters !== undefined) {
    if (!value.filters || typeof value.filters !== "object" || Array.isArray(value.filters)) return "invalid filters";
    const filters = value.filters as Record<string, unknown>;
    const allowed = new Set(registry[event ?? "CARD_PLAYED"]?.fields ?? filterKeys);
    for (const key of Object.keys(filters)) {
      if (!filterKeys.has(key) || !allowed.has(key)) return `invalid filter field: ${key}`;
      const item = filters[key];
      if (["tagsAny", "tagsAll", "tagsNone"].includes(key)) {
        if (!validTags(item)) return "invalid tags";
      } else if (key === "amount") {
        if (!item || typeof item !== "object" || !operators.has((item as Record<string, unknown>).op as string) || typeof (item as Record<string, unknown>).value !== "number" || !Number.isFinite((item as Record<string, unknown>).value)) return "invalid numeric filter";
      } else if (key === "owner" || key === "sourcePlayer" || key === "targetOwner") {
        if (!["SELF", "ENEMY"].includes(item as string)) return "invalid ownership value";
      } else if (key === "cardType" && !["WRESTLER", "TECHNIQUE"].includes(item as string)) return "invalid card type";
      else if (key === "entryCause" && !["PLAY_FROM_HAND", "SUMMON", "REVIVE", "CHAMPION_DEPLOY"].includes(item as string)) return "invalid entry cause";
      else if (key === "stat" && !["cost", "attack", "health", "maxHealth", "currentHealth"].includes(item as string)) return "invalid stat";
      else if (typeof item !== "string" || !item.length || item.length > 120) return "invalid filter value";
    }
  }
  for (const key of ["allOf", "anyOf"]) {
    if (value[key] !== undefined) {
      if (!Array.isArray(value[key]) || value[key].length < 1 || value[key].length > 8) return "invalid composite";
      for (const child of value[key] as unknown[]) {
        const error = validateNode(child, depth + 1);
        if (error) return error;
      }
    }
  }
  return null;
}

export function validateQuestCondition(value: unknown): QuestConditionV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== QUEST_CONDITION_SCHEMA_VERSION || !input.progress || typeof input.progress !== "object") return null;
  const progress = input.progress as Record<string, unknown>;
  if (!QUEST_AGGREGATIONS.includes(progress.mode as QuestAggregation)) return null;
  if (Object.keys(progress).some((key) => !["mode", "field"].includes(key))) return null;
  if (progress.field !== undefined && (!numericKeys.has(progress.field as string) || progress.mode !== "SUM")) return null;
  const required = input.required;
  if (!Number.isSafeInteger(required) || (required as number) < 1) return null;
  if (progress.mode === "SUM" && progress.field === undefined) return null;
  if (Object.keys(input).some((key) => !["schemaVersion", "condition", "progress", "required"].includes(key))) return null;
  if (validateNode(input.condition, 0)) return null;
  const condition = input.condition as QuestConditionNode;
  if (progress.mode === "SUM") {
    const leaves: QuestConditionNode[] = [];
    const collect = (node: QuestConditionNode) => {
      if (node.allOf) node.allOf.forEach(collect);
      else if (node.anyOf) node.anyOf.forEach(collect);
      else leaves.push(node);
    };
    collect(condition);
    if (leaves.some((leaf) => !registry[leaf.event!]?.numeric.includes(progress.field as string))) return null;
  }
  return value as QuestConditionV2;
}

function compare(actual: number, filter: { op: string; value: number }) {
  return filter.op === "EQ" ? actual === filter.value : filter.op === "GT" ? actual > filter.value : filter.op === "GTE" ? actual >= filter.value : filter.op === "LT" ? actual < filter.value : actual <= filter.value;
}

export type QuestEventMetadata = { cardTags?: string[]; cardMetadataAvailable?: boolean };

function matchesLeaf(node: QuestConditionNode, event: GameEvent, playerId: string, metadata?: QuestEventMetadata): boolean {
  if (node.event && node.event !== event.type) return false;
  const filters = node.filters ?? {};
  const owner = event.playerId === playerId ? "SELF" : event.playerId ? "ENEMY" : undefined;
  if (filters.owner && filters.owner !== owner) return false;
  if (filters.cardType && filters.cardType !== event.cardType && filters.cardType !== event.sourceSnapshot?.cardType && filters.cardType !== event.targetSnapshot?.cardType) return false;
  if (filters.tagsAny || filters.tagsAll || filters.tagsNone) {
    const tags = metadata?.cardMetadataAvailable ? metadata.cardTags : undefined;
    if (!tags) return false;
    if (filters.tagsAny && !filters.tagsAny.some((tag) => tags.includes(tag))) return false;
    if (filters.tagsAll && !filters.tagsAll.every((tag) => tags.includes(tag))) return false;
    if (filters.tagsNone && filters.tagsNone.some((tag) => tags.includes(tag))) return false;
  }
  if (filters.sourceActionType && filters.sourceActionType !== event.sourceContext?.sourceActionType) return false;
  if (filters.sourcePlayer) {
    const sourceOwner = event.sourceContext?.sourcePlayerId
      ? (event.sourceContext.sourcePlayerId === playerId ? "SELF" : "ENEMY")
      : undefined;
    if (sourceOwner === undefined || filters.sourcePlayer !== sourceOwner) return false;
  }
  if (filters.targetOwner) {
    const targetOwner = event.targetSnapshot?.playerId
      ? (event.targetSnapshot.playerId === playerId ? "SELF" : "ENEMY")
      : undefined;
    if (targetOwner === undefined || filters.targetOwner !== targetOwner) return false;
  }
  if (filters.entryCause && filters.entryCause !== (event as GameEvent & { entryCause?: string }).entryCause) return false;
  if (filters.stat && filters.stat !== event.stat) return false;
  if (filters.amount && (typeof event.amount !== "number" || !compare(event.amount, filters.amount))) return false;
  return true;
}

export function questConditionMatches(condition: QuestConditionNode, event: GameEvent, playerId: string, metadata?: QuestEventMetadata): boolean {
  if (condition.allOf) return condition.allOf.every((child) => questConditionMatches(child, event, playerId, metadata));
  if (condition.anyOf) return condition.anyOf.some((child) => questConditionMatches(child, event, playerId, metadata));
  return matchesLeaf(condition, event, playerId, metadata);
}

export function questEventIncrement(config: QuestConditionV2, event: GameEvent, playerId: string, metadata?: QuestEventMetadata): number {
  if (!questConditionMatches(config.condition, event, playerId, metadata)) return 0;
  if (config.progress.mode === "COUNT") return 1;
  const field = config.progress.field ?? "amount";
  const value = event[field];
  return typeof value === "number" && value > 0 ? value : 0;
}