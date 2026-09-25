/** The content-facing Effect DSL contract. Card and Champion administration use
 * this exact registry; English identifiers are stable implementation aliases. */
export const TRIGGERS = ["GAME_START", "ENTER_FIELD", "LEAVE_FIELD", "SELF_RETIRE", "ACTIVE", "CARD_DRAWN", "CARD_RETIRED", "CARD_SUMMONED", "CARD_ENTERED", "FIRST_ATTACKED", "SELF_ATTACK", "OTHER_ALLY_ATTACK", "ATTACK_SURVIVED", "SELF_DAMAGED", "STAT_CHANGED", "TECHNIQUE_CAST", "EXACT_ZERO_DAMAGE", "TURN_START", "TURN_END", "BEFORE_DAMAGE", "BEFORE_RETIRE"] as const;
export const RULE_LISTENER_TRIGGERS = ["CARD_PLAYED", "TECHNIQUE_PLAYED", "CARD_RETIRED", "DAMAGE_TAKEN", "SOURCE_CAUSED_TARGET_REMOVAL"] as const;
export const CONDITIONS = ["NEED_CONDITION", "BASE_COST_GTE", "SOURCE_ON_LEFT_SIDE", "SOURCE_ON_RIGHT_SIDE", "SOURCE_IS_ONLY_WRESTLER", "FIRST_ATTACK_GAIN"] as const;
export const REFERENCES = ["SOURCE", "LAST_TARGET", "LAST_DRAWN_CARD", "LAST_ATTACKER", "LAST_DAMAGED_TARGET", "CAPTURED_CARD", "CURRENT_SLOT"] as const;
export const ACTIONS = ["BUFF", "SET_STATS", "MODIFY_STAT", "MODIFY_MAX_HEALTH", "SET_STAT", "DAMAGE", "HEAL", "SILENCE", "DESTROY", "RETIRE", "ADD_GOLD", "ADD_NEXT_TURN_GOLD", "DRAW", "REDUCE_COST", "INCREASE_COST", "STUN", "DISABLE_ABILITY", "WEAKEN_TO_STUN_SILENCE", "ADD_KEYWORD", "REMOVE_KEYWORD", "SWAP_STATS", "ADD_DAMAGE_MODIFIER", "SUMMON", "SUMMON_FROM_HAND", "REVIVE", "GENERATE", "MOVE_TO_HAND", "MOVE_TO_DECK", "STEAL", "MILL", "SPEND_GOLD_BUFF_SELF", "DEPLOY_CHAMPION_TOKEN", "CAPTURE", "RELEASE_CAPTURED", "REMOVE_FROM_GAME", "SWITCH_EFFECT_BRANCH", "QUEUE_EFFECT", "ADD_AGGREGATED_ATTACK", "COPY_BEST_STATS", "REPEAT_TURN_END", "TRANSFORM_SOURCE", "REGISTER_DELAYED", "REGISTER_LISTENER", "PREVENT_DAMAGE", "PREVENT_RETIRE", "GRANT_RANDOM_CARD_TEXT"] as const;
export const KEYWORDS = ["RUSH", "SURPRISE", "TAUNT", "DODGE", "MULTI_STRIKE"] as const;
export const TARGET_ZONES = ["BOARD", "HAND", "DECK", "GRAVEYARD", "PLAYER", "CHARACTER"] as const;
/** The default card scope for Korean phrases such as "어디에 있든". */
export const DEFAULT_CARD_TARGET_SCOPE = ["HAND", "DECK", "BOARD"] as const;
export const TARGET_FILTERS = ["GENERATED", "MIN_COST", "MAX_COST", "TOKEN", "NON_CHAMPION_TOKEN", "EXCLUDE_SOURCE", "VANILLA", "TAGS_ANY", "TAGS_ALL", "TAGS_NONE"] as const;
export const TARGET_OWNERS = ["SELF", "ENEMY", "ALL"] as const;
export const TARGET_SELECTIONS = ["SELF", "PLAYER_CHOICE", "RANDOM", "TOP", "ADJACENT", "ADJACENT_EMPTY_SLOTS", "SAME_TARGET", "ALL"] as const;
export const RANDOM_SCOPES = ["STANDARD", "FULL"] as const;
export const DAMAGE_SOURCES = ["GENERATED", "ALL"] as const;

export type Trigger = typeof TRIGGERS[number];
export type Condition = typeof CONDITIONS[number];
export type Reference = typeof REFERENCES[number];
export type Action = typeof ACTIONS[number];
export type Keyword = typeof KEYWORDS[number];
export type TargetZone = typeof TARGET_ZONES[number];
export type TargetFilter = typeof TARGET_FILTERS[number];
export type TargetOwner = typeof TARGET_OWNERS[number];
export type TargetSelection = typeof TARGET_SELECTIONS[number];
export type RandomScope = typeof RANDOM_SCOPES[number];
export type DamageSource = typeof DAMAGE_SOURCES[number];
export const DYNAMIC_VALUES = [
  "HAND_COUNT",
  "GRAVEYARD_WRESTLER_COUNT",
  "REMAINING_GOLD",
  "BOARD_WRESTLER_COUNT",
  "LAST_ATTACK_DELTA",
  "CURRENT_TURN_RETIRED_WRESTLER_COUNT",
  "CURRENT_TURN_DAMAGE_TAKEN",
] as const;
export type DynamicValue = (typeof DYNAMIC_VALUES)[number];
export type StatName = "COST" | "ATTACK" | "HEALTH";
export type EffectDuration = "THIS_TURN" | "UNTIL_NEXT_TURN" | "PERMANENT";
export const STAT_NAMES = ["COST", "ATTACK", "HEALTH"] as const;
export const EFFECT_DURATIONS = ["THIS_TURN", "UNTIL_NEXT_TURN", "PERMANENT"] as const;
export type EffectActionSchema = { target: boolean; amount?: boolean; signedAmount?: boolean; stat?: boolean; duration?: boolean; stats?: boolean; statMultiplier?: boolean; referenceStat?: boolean; dynamicValue?: boolean; statChannelReference?: boolean; generatedModifiers?: boolean; minimum?: boolean; keyword?: boolean; damageSource?: boolean; branches?: boolean; queuedEffect?: boolean; cardDefinition?: boolean; cardCount?: boolean; destination?: boolean; aggregateStats?: boolean; conditionalBuff?: boolean; delayed?: boolean; listener?: boolean; prevention?: boolean; captureStats?: boolean };
export type RegistryStatus = "ACTIVE" | "DISABLED";

/** Closed, data-only Script AST. It is intentionally separate from the
 * legacy Structured Effect payload so old saved cards remain byte-compatible. */
export const SCRIPT_MAX_STEPS = 32 as const;
export const SCRIPT_MAX_DEPTH = 6 as const;
export const SCRIPT_MAX_SELECTOR_RESULTS = 20 as const;
export const SCRIPT_OPERATIONS = ["COUNT", "SUM", "MIN", "MAX"] as const;
export const SCRIPT_COMPARATORS = ["EQ", "NE", "LT", "LTE", "GT", "GTE"] as const;
export const SCRIPT_VALUE_KINDS = ["CONSTANT", "RESULT_COUNT", "RESULT_VALUE"] as const;
export const SCRIPT_HISTORY_SCOPES = ["CURRENT_RESOLUTION", "CURRENT_ACTION", "CURRENT_TURN", "CURRENT_MATCH"] as const;
export const SCRIPT_HISTORY_EVENTS = ["CARD_PLAYED", "CARD_RETIRED", "DAMAGE_DEALT", "CARD_DRAWN", "CARD_GENERATED"] as const;
export type ScriptOperation = typeof SCRIPT_OPERATIONS[number];
export type ScriptComparator = typeof SCRIPT_COMPARATORS[number];
export type ScriptValueKind = typeof SCRIPT_VALUE_KINDS[number];
export type ScriptHistoryScope = typeof SCRIPT_HISTORY_SCOPES[number];
export type ScriptHistoryEvent = typeof SCRIPT_HISTORY_EVENTS[number];
export type ScriptStat = "COST" | "ATTACK" | "HEALTH";
export type ScriptFilter = {
  isGenerated?: boolean;
  minCost?: number;
  maxCost?: number;
  cost?: { compare: ScriptComparator; value: number };
  attack?: { compare: ScriptComparator; value: number };
  health?: { compare: ScriptComparator; value: number };
  isToken?: boolean;
  isChampionToken?: boolean;
  excludeSource?: boolean;
  isVanilla?: boolean;
  keyword?: Keyword;
  tagsAny?: string[];
  tagsAll?: string[];
  tagsNone?: string[];
  definitionRef?: CardDefinitionReference;
};
export type ScriptTarget = {
  zone?: TargetZone;
  zones?: TargetZone[];
  owner?: TargetOwner;
  cardType?: "WRESTLER" | "TECHNIQUE";
  filter?: ScriptFilter;
  selection?: TargetSelection;
  count?: number;
  randomScope?: RandomScope;
  resultId?: string;
  sort?: { stat: ScriptStat; direction: "ASC" | "DESC" };
  take?: number;
};
export type ScriptValue =
  | { kind: "CONSTANT"; value: number }
  | { kind: "RESULT_COUNT" | "RESULT_VALUE"; resultId: string; offset?: number }
  | { kind: "ADD" | "SUBTRACT" | "MULTIPLY" | "MIN" | "MAX"; left: ScriptValue; right: ScriptValue };
export type ScriptCondition = {
  left: ScriptValue;
  compare: ScriptComparator;
  right: ScriptValue;
};
export type ScriptHistoryQuery = {
  scope: ScriptHistoryScope;
  eventType: ScriptHistoryEvent;
  owner?: TargetOwner;
  cardType?: "WRESTLER" | "TECHNIQUE";
  tag?: string;
  operation: ScriptOperation;
  stat?: ScriptStat;
};
export type ScriptEffect = {
  action: Action;
  target?: ScriptTarget;
  values?: Record<string, unknown>;
};
export type ScriptStep =
  | { type: "SELECT"; id: string; target: ScriptTarget }
  | { type: "AGGREGATE"; id: string; selectionId: string; operation: ScriptOperation; stat?: ScriptStat }
  | { type: "HISTORY"; id: string; query: ScriptHistoryQuery }
  | { type: "EFFECT"; id?: string; effect: ScriptEffect }
  | { type: "REPEAT"; count: ScriptValue; steps: Array<{ type: "EFFECT"; effect: ScriptEffect }> }
  | { type: "IF"; condition: ScriptCondition; then: ScriptStep[]; else?: ScriptStep[] };
export type EffectScript = {
  version: "SCRIPT_V1";
  trigger: Trigger;
  steps: ScriptStep[];
};

/** Authoritative structured-effect contract shared by administration and runtime.
 * Provider output is parsed into this data shape, then the server resolves
 * definition references before it is persisted. No source identity belongs in
 * this provider-facing effect AST. */
export type StructuredTarget = {
  zone?: TargetZone;
  zones?: TargetZone[];
  owner: TargetOwner;
  cardType?: "WRESTLER" | "TECHNIQUE";
  filter?: {
    isGenerated?: boolean;
    minCost?: number;
    maxCost?: number;
    isToken?: boolean;
    isChampionToken?: boolean;
    excludeSource?: boolean;
    isVanilla?: boolean;
    keyword?: Keyword;
    cost?: { compare: ScriptComparator; value: number };
    attack?: { compare: ScriptComparator; value: number };
    health?: { compare: ScriptComparator; value: number };
    tagsAny?: string[];
    tagsAll?: string[];
    tagsNone?: string[];
    definitionRef?: CardDefinitionReference;
  };
  selection: TargetSelection;
  count: number;
  randomScope?: RandomScope;
  minTargets?: number;
  maxTargets?: number;
  optionalTarget?: boolean;
  resultId?: string;
  sort?: { stat: ScriptStat; direction: "ASC" | "DESC" };
  take?: number;
};

export type StructuredEffectCondition = { type: Condition; expression?: string };
export type CardDefinitionReference = { id?: string; name?: string };
export type StructuredAggregateStats =
  | {
      source: "LAST_DESTROYED_TARGETS";
      attack: "CURRENT_ATTACK_SUM";
      health: "CURRENT_HEALTH_SUM";
    }
  | {
      source: "LAST_CAUSED_TARGET_REMOVALS";
      attack: "CURRENT_ATTACK_SUM";
      health?: never;
    };
export type StructuredQueuedEffect = {
  action: Action;
  target?: StructuredTarget;
  values?: {
    attack?: number;
    health?: number;
    attackMultiplier?: number;
    healthMultiplier?: number;
    amount?: number;
    stat?: StatName;
    duration?: EffectDuration;
    keyword?: Keyword;
    damageSource?: DamageSource;
    reference?: Reference;
    referenceStat?: "CURRENT_ATTACK" | "CURRENT_HEALTH";
    amountReference?: DynamicValue;
    attackReference?: DynamicValue;
    healthReference?: DynamicValue;
    minimum?: number;
    generatedModifiers?: { cost?: number; attack?: number; health?: number; copySourceStats?: boolean; copyTargetStats?: boolean };
    deckPosition?: "TOP" | "BOTTOM";
    aggregateStats?: StructuredAggregateStats;
  };
};
export type StructuredSchedule = {
  kind: "OWNER_NEXT_TURN_START" | "OPPONENT_NEXT_TURN_START" | "END_OF_CURRENT_TURN" | "NEXT_MATCHING_EVENT" | "N_MATCHING_EVENTS";
  count?: number;
  eventTrigger?: "CARD_PLAYED" | "TECHNIQUE_PLAYED" | "CARD_RETIRED" | "DAMAGE_TAKEN";
};
export type StructuredListener = {
  trigger: (typeof RULE_LISTENER_TRIGGERS)[number];
  cardType?: "WRESTLER" | "TECHNIQUE";
  owner?: "SELF" | "ENEMY";
  uses?: number;
};
export type StructuredPrevention = { uses?: number; setHealth?: number };
export type StructuredEffectValues = {
  attack?: number;
  health?: number;
  attackMultiplier?: number;
  healthMultiplier?: number;
  amount?: number;
  stat?: StatName;
  duration?: EffectDuration;
  keyword?: Keyword;
  damageSource?: DamageSource;
  reference?: Reference;
  referenceStat?: "CURRENT_ATTACK" | "CURRENT_HEALTH";
  amountReference?: DynamicValue;
  attackReference?: DynamicValue;
  healthReference?: DynamicValue;
  temporaryCost?: boolean;
  conditionalBuff?: { healthEquals: number; attack: number; health: number };
  minimum?: number;
  generatedModifiers?: { cost?: number; attack?: number; health?: number; copySourceStats?: boolean; copyTargetStats?: boolean };
  deckPosition?: "TOP" | "BOTTOM";
  queuedTrigger?: "NEXT_ALLY_WRESTLER_PLAYED" | "NEXT_TECHNIQUE_PLAYED";
  queuedEffect?: StructuredQueuedEffect;
  definition?: Record<string, unknown>;
  definitionRef?: CardDefinitionReference;
  count?: number;
  destination?: "HAND" | "DECK" | "DECK_TOP";
  aggregateStats?: StructuredAggregateStats;
  leftEffects?: StructuredEffect[];
  rightEffects?: StructuredEffect[];
  delayed?: StructuredSchedule & { effect: StructuredQueuedEffect; followUpEffects?: StructuredQueuedEffect[] };
  listener?: StructuredListener & { effect: StructuredQueuedEffect };
  prevention?: StructuredPrevention;
  captureStats?: boolean;
  causal?: "DAMAGE_CAUSED_TARGET_RETIRE";
  /** Copies a selected candidate's current attack and health to the source. */
  copyBestStats?: boolean;
};
export type StructuredEffect = {
  trigger: Trigger;
  action: Action;
  target?: StructuredTarget;
  conditions?: StructuredEffectCondition[];
  values?: StructuredEffectValues;
};
export type StructuredEffectConfig = { effects: StructuredEffect[] };
export type EffectScriptConfig = { scripts: EffectScript[] };
export type MechanicCompilerProviderOutput =
  | { status: "READY"; effectId: "STRUCTURED_EFFECTS_V1"; effects: StructuredEffect[]; keywords?: Keyword[] }
  | { status: "READY"; effectId: "SCRIPT_V1"; scripts: EffectScript[]; keywords?: Keyword[] }
  | { status: "NEEDS_CLARIFICATION"; questions: string[] };

const SCRIPT_TARGET_KEYS = new Set(["zone", "zones", "owner", "cardType", "filter", "selection", "count", "randomScope", "resultId", "sort", "take"]);
const SCRIPT_FILTER_KEYS = new Set(["isGenerated", "minCost", "maxCost", "cost", "attack", "health", "isToken", "isChampionToken", "excludeSource", "isVanilla", "keyword", "tagsAny", "tagsAll", "tagsNone", "definitionRef"]);
const SCRIPT_VALUE_KEYS = new Set(["kind", "value", "resultId", "offset", "left", "right"]);
const SCRIPT_HISTORY_KEYS = new Set(["scope", "eventType", "owner", "cardType", "tag", "operation", "stat"]);
const SCRIPT_EFFECT_KEYS = new Set(["action", "target", "values"]);
const SCRIPT_EFFECT_VALUE_KEYS = new Set([
  "amount", "amountExpression", "attack", "attackExpression", "health", "healthExpression", "countExpression",
  "attackMultiplier", "healthMultiplier", "stat", "duration",
  "keyword", "damageSource", "reference", "referenceStat", "amountReference", "minimum", "temporaryCost",
  "generatedModifiers", "deckPosition", "count", "destination", "definitionRef", "queuedTrigger", "queuedEffect", "delayed", "listener", "prevention", "captureStats",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validScriptTarget(value: unknown): value is ScriptTarget {
  if (!isRecord(value) || !hasOnlyKeys(value, SCRIPT_TARGET_KEYS)) return false;
  if (value.zone !== undefined && !TARGET_ZONES.includes(value.zone as TargetZone)) return false;
  if (value.zones !== undefined && (!Array.isArray(value.zones) || value.zones.length < 1 ||
    value.zones.length > TARGET_ZONES.length || !value.zones.every((zone) => TARGET_ZONES.includes(zone as TargetZone)))) return false;
  if (value.owner !== undefined && !TARGET_OWNERS.includes(value.owner as TargetOwner)) return false;
  if (value.selection !== undefined && !TARGET_SELECTIONS.includes(value.selection as TargetSelection)) return false;
  if (value.randomScope !== undefined && !RANDOM_SCOPES.includes(value.randomScope as RandomScope)) return false;
  if (value.cardType !== undefined && value.cardType !== "WRESTLER" && value.cardType !== "TECHNIQUE") return false;
  if (value.count !== undefined && (typeof value.count !== "number" || !Number.isInteger(value.count) ||
    value.count < 1 || value.count > SCRIPT_MAX_SELECTOR_RESULTS)) return false;
  if (value.take !== undefined && (typeof value.take !== "number" || !Number.isInteger(value.take) ||
    value.take < 1 || value.take > SCRIPT_MAX_SELECTOR_RESULTS)) return false;
  if (value.sort !== undefined && (!isRecord(value.sort) || !hasOnlyKeys(value.sort, new Set(["stat", "direction"])) ||
    !["COST", "ATTACK", "HEALTH"].includes(value.sort.stat as string) ||
    !["ASC", "DESC"].includes(value.sort.direction as string))) return false;
  if (value.resultId !== undefined && (typeof value.resultId !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(value.resultId))) return false;
  if (value.zone !== undefined && value.zones !== undefined) return false;
  if (value.filter !== undefined) {
    if (!isRecord(value.filter) || !hasOnlyKeys(value.filter, SCRIPT_FILTER_KEYS)) return false;
    const filter = value.filter;
    for (const key of ["isGenerated", "isToken", "isChampionToken", "excludeSource", "isVanilla"]) {
      if (filter[key] !== undefined && typeof filter[key] !== "boolean") return false;
    }
    if (filter.keyword !== undefined && !KEYWORDS.includes(filter.keyword as Keyword)) return false;
    for (const key of ["cost", "attack", "health"]) {
      const comparison = filter[key];
      if (comparison !== undefined && (!isRecord(comparison) || !hasOnlyKeys(comparison, new Set(["compare", "value"])) ||
        !SCRIPT_COMPARATORS.includes(comparison.compare as ScriptComparator) ||
        typeof comparison.value !== "number" || !Number.isFinite(comparison.value))) return false;
    }
    for (const key of ["minCost", "maxCost"]) {
      if (filter[key] !== undefined && (!Number.isInteger(filter[key]) || Number(filter[key]) < 0 || Number(filter[key]) > 999)) return false;
    }
    for (const key of ["tagsAny", "tagsAll", "tagsNone"]) {
      if (filter[key] !== undefined && (!Array.isArray(filter[key]) || filter[key].length > 20 ||
        !filter[key].every((tag) => typeof tag === "string" && tag.length > 0 && tag.length <= 80))) return false;
    }
    if (filter.definitionRef !== undefined && (!isRecord(filter.definitionRef) ||
      !hasOnlyKeys(filter.definitionRef, new Set(["id", "name"])) ||
      (filter.definitionRef.id !== undefined && (typeof filter.definitionRef.id !== "string" || !filter.definitionRef.id)) ||
      (filter.definitionRef.name !== undefined && (typeof filter.definitionRef.name !== "string" || !filter.definitionRef.name)) ||
      (!filter.definitionRef.id && !filter.definitionRef.name))) return false;
  }
  return true;
}

function validScriptValue(value: unknown, depth = 0): value is ScriptValue {
  if (depth > 4 || !isRecord(value) || !hasOnlyKeys(value, SCRIPT_VALUE_KEYS)) return false;
  if (["ADD", "SUBTRACT", "MULTIPLY", "MIN", "MAX"].includes(value.kind as string)) {
    return hasOnlyKeys(value, new Set(["kind", "left", "right"])) &&
      validScriptValue(value.left, depth + 1) && validScriptValue(value.right, depth + 1);
  }
  if (!SCRIPT_VALUE_KINDS.includes(value.kind as ScriptValueKind) || value.left !== undefined || value.right !== undefined) return false;
  if (value.kind === "CONSTANT") {
    return value.resultId === undefined && value.offset === undefined &&
      typeof value.value === "number" && Number.isFinite(value.value) && Math.abs(value.value) <= 999;
  }
  return value.value === undefined &&
    typeof value.resultId === "string" &&
    /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(value.resultId) &&
    (value.offset === undefined ||
      (typeof value.offset === "number" && Number.isFinite(value.offset) && Math.abs(value.offset) <= 999));
}

function scriptValueReferencesExist(value: ScriptValue, seen: Set<string>): boolean {
  if (value.kind === "CONSTANT") return true;
  if (value.kind === "RESULT_COUNT" || value.kind === "RESULT_VALUE") return seen.has(value.resultId);
  if (!("left" in value)) return false;
  return scriptValueReferencesExist(value.left, seen) && scriptValueReferencesExist(value.right, seen);
}

function validScriptSteps(value: unknown, depth: number, seen: Set<string>): value is ScriptStep[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > SCRIPT_MAX_STEPS || depth > SCRIPT_MAX_DEPTH) return false;
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.type !== "string") return false;
    if (raw.type === "SELECT") {
      if (typeof raw.id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(raw.id) ||
        seen.has(raw.id) || !validScriptTarget(raw.target) ||
        (isRecord(raw.target) && raw.target.resultId !== undefined && !seen.has(raw.target.resultId))) return false;
      seen.add(raw.id);
      continue;
    }
    if (raw.type === "AGGREGATE") {
      if (typeof raw.id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(raw.id) || seen.has(raw.id) ||
        typeof raw.selectionId !== "string" || !seen.has(raw.selectionId) ||
        !SCRIPT_OPERATIONS.includes(raw.operation as ScriptOperation)) return false;
      if (raw.stat !== undefined && !["COST", "ATTACK", "HEALTH"].includes(raw.stat as string)) return false;
      seen.add(raw.id);
      continue;
    }
    if (raw.type === "HISTORY") {
      if (typeof raw.id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(raw.id) || seen.has(raw.id) ||
        !isRecord(raw.query) || !hasOnlyKeys(raw.query, SCRIPT_HISTORY_KEYS) ||
        !SCRIPT_HISTORY_SCOPES.includes(raw.query.scope as ScriptHistoryScope) ||
        !SCRIPT_HISTORY_EVENTS.includes(raw.query.eventType as ScriptHistoryEvent) ||
        (raw.query.owner !== undefined && !TARGET_OWNERS.includes(raw.query.owner as TargetOwner)) ||
        (raw.query.cardType !== undefined && raw.query.cardType !== "WRESTLER" && raw.query.cardType !== "TECHNIQUE") ||
        (raw.query.tag !== undefined && (typeof raw.query.tag !== "string" || raw.query.tag.length < 1 || raw.query.tag.length > 80)) ||
        !SCRIPT_OPERATIONS.includes(raw.query.operation as ScriptOperation) ||
        (raw.query.stat !== undefined && !["COST", "ATTACK", "HEALTH"].includes(raw.query.stat as string))) return false;
      seen.add(raw.id);
      continue;
    }
    if (raw.type === "EFFECT") {
      if ((raw.id !== undefined && (typeof raw.id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(raw.id))) ||
        (raw.id !== undefined && seen.has(raw.id)) ||
        !isRecord(raw.effect) || !hasOnlyKeys(raw.effect, SCRIPT_EFFECT_KEYS) ||
        !ACTIONS.includes(raw.effect.action as Action)) return false;
      const action = raw.effect.action as Action;
      const schema = ACTION_SCHEMAS[action];
      const target = raw.effect.target;
      const targetIsReference = isRecord(target) && typeof target.resultId === "string";
      const targetResultId = targetIsReference ? String(target.resultId) : undefined;
      if ((schema.target && target === undefined) ||
        (!schema.target && target !== undefined && !(["SUMMON", "GENERATE"].includes(action) &&
          isRecord(target) && ["RANDOM", "ADJACENT_EMPTY_SLOTS"].includes(target.selection as string))) ||
        (target !== undefined && !validScriptTarget(target)) ||
        (targetIsReference && !seen.has(targetResultId!)) ||
        (action === "STEAL" && !targetIsReference && isRecord(target) &&
          (target.owner !== "ENEMY" ||
            ![target.zone, ...(Array.isArray(target.zones) ? target.zones : [])]
              .every((zone) => typeof zone === "string" && ["HAND", "DECK", "GRAVEYARD"].includes(zone))))) return false;
      if (schema.amount && raw.effect.values === undefined) return false;
      if (schema.keyword && raw.effect.values === undefined) return false;
      if (action === "TRANSFORM_SOURCE" && raw.effect.values === undefined) return false;
      if (!validScriptEffectValues(action, raw.effect.values)) return false;
      if (raw.effect.values !== undefined) {
        if (!isRecord(raw.effect.values) || !hasOnlyKeys(raw.effect.values, SCRIPT_EFFECT_VALUE_KEYS)) return false;
        const definitionRef = raw.effect.values.definitionRef;
        if (definitionRef !== undefined && (!schema.cardDefinition || !isRecord(definitionRef) ||
          !hasOnlyKeys(definitionRef, new Set(["id", "name"])) ||
          (definitionRef.id !== undefined && (typeof definitionRef.id !== "string" || !definitionRef.id)) ||
          (definitionRef.name !== undefined && (typeof definitionRef.name !== "string" || !definitionRef.name)) ||
          (!definitionRef.id && !definitionRef.name))) return false;
        if (schema.amount &&
          raw.effect.values.amount === undefined &&
          raw.effect.values.amountExpression === undefined) return false;
        if (schema.keyword && !KEYWORDS.includes(raw.effect.values.keyword as Keyword)) return false;
        if (["DESTROY", "RETIRE", "STUN", "SILENCE", "DISABLE_ABILITY", "SWAP_STATS", "STEAL", "MILL",
          "DEPLOY_CHAMPION_TOKEN", "CAPTURE", "RELEASE_CAPTURED", "REMOVE_FROM_GAME",
          "COPY_BEST_STATS", "GRANT_RANDOM_CARD_TEXT"].includes(action) &&
          Object.keys(raw.effect.values).length > 0) return false;
        for (const expressionKey of ["amountExpression", "attackExpression", "healthExpression", "countExpression"]) {
          const expression = raw.effect.values[expressionKey];
          if (expression !== undefined && (!validScriptValue(expression) || !scriptValueReferencesExist(expression, seen))) return false;
        }
      }
      if (raw.id !== undefined) seen.add(raw.id);
      continue;
    }
    if (raw.type === "IF") {
      if (!isRecord(raw.condition) || !hasOnlyKeys(raw.condition, new Set(["left", "compare", "right"])) ||
        !validScriptValue(raw.condition.left) || !validScriptValue(raw.condition.right) ||
        !scriptValueReferencesExist(raw.condition.left, seen) || !scriptValueReferencesExist(raw.condition.right, seen) ||
        !SCRIPT_COMPARATORS.includes(raw.condition.compare as ScriptComparator)) return false;
      if (!validScriptSteps(raw.then, depth + 1, seen) ||
        (raw.else !== undefined && !validScriptSteps(raw.else, depth + 1, seen))) return false;
      continue;
    }
    if (raw.type === "REPEAT") {
      if (!hasOnlyKeys(raw, new Set(["type", "count", "steps"])) ||
        !validScriptValue(raw.count) ||
        !scriptValueReferencesExist(raw.count, seen) ||
        !Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > 4 ||
        !raw.steps.every((entry) => isRecord(entry) && entry.type === "EFFECT" &&
          !Object.hasOwn(entry, "id") && isRecord(entry.effect) &&
          (!isRecord(entry.effect.target) || entry.effect.target.selection !== "PLAYER_CHOICE"))) return false;
      if (isRecord(raw.count) && raw.count.kind === "CONSTANT" &&
        (!Number.isInteger(raw.count.value) || Number(raw.count.value) < 0 || Number(raw.count.value) > 8)) return false;
      if (!validScriptSteps(raw.steps, depth + 1, new Set(seen))) return false;
      continue;
    }
    return false;
  }
  return true;
}

export function isEffectScript(value: unknown): value is EffectScript {
  if (!isRecord(value) || value.version !== "SCRIPT_V1" || !TRIGGERS.includes(value.trigger as Trigger)) return false;
  return validScriptSteps(value.steps, 0, new Set());
}

export const DISPLAY_LABELS = {
  GAME_START: "게임 시작", ENTER_FIELD: "등장", CARD_DRAWN: "준비", SELF_RETIRE: "자기 퇴장", SELF_ATTACK: "자신 공격", OTHER_ALLY_ATTACK: "콤보", ATTACK_SURVIVED: "공격 생존", SELF_DAMAGED: "자기 피해", STAT_CHANGED: "스탯 변경", TECHNIQUE_CAST: "주문",
  CARD_RETIRED: "아군 퇴장", CARD_SUMMONED: "아군 소환", CARD_ENTERED: "아군 진입", FIRST_ATTACKED: "첫 공격",
  EXACT_ZERO_DAMAGE: "핀폴",
  LEAVE_FIELD: "퇴장", ACTIVE: "액티브", TURN_START: "턴 시작", TURN_END: "턴 종료",
  NEED_CONDITION: "조건",
  SOURCE_ON_LEFT_SIDE: "스위치(왼쪽)", SOURCE_ON_RIGHT_SIDE: "스위치(오른쪽)", FIRST_ATTACK_GAIN: "첫 공격력 증가",
  BUFF: "강화", SET_STATS: "스탯 설정", MODIFY_STAT: "스탯 변경", MODIFY_MAX_HEALTH: "최대 체력 변경", SET_STAT: "스탯 설정", DAMAGE: "피해", HEAL: "회복", DESTROY: "파괴", RETIRE: "리타이어", DRAW: "드로우",
  ADD_GOLD: "골드 획득", ADD_NEXT_TURN_GOLD: "다음 턴 골드", REDUCE_COST: "비용 감소",
  INCREASE_COST: "비용 증가", ADD_KEYWORD: "키워드 부여", REMOVE_KEYWORD: "키워드 제거",
  SUMMON: "소환", GENERATE: "생성", DEPLOY_CHAMPION_TOKEN: "챔피언 토큰 전개", ADD_DAMAGE_MODIFIER: "피해 보정", RELEASE_CAPTURED: "포획 해방",
  SWITCH_EFFECT_BRANCH: "스위치", COPY_BEST_STATS: "최고 스탯 복사", REPEAT_TURN_END: "턴 종료 반복", TRANSFORM_SOURCE: "변신", RUSH: "러쉬", SURPRISE: "기습", TAUNT: "도발", DODGE: "회피",
  SILENCE: "침묵", STUN: "기절", DISABLE_ABILITY: "능력 비활성화", WEAKEN_TO_STUN_SILENCE: "공격력 감소 후 제어",
  MOVE_TO_HAND: "손패 이동", MOVE_TO_DECK: "덱 이동", MILL: "덱 파괴", SPEND_GOLD_BUFF_SELF: "남은 골드 강화",
  CAPTURE: "포획", REMOVE_FROM_GAME: "제거",
} as const;

export const ACTION_SCHEMAS: Record<Action, EffectActionSchema> = {
  ADD_GOLD: { target: false, amount: true }, ADD_NEXT_TURN_GOLD: { target: false, amount: true }, DRAW: { target: false, amount: true },
  MODIFY_STAT: { target: true, amount: true, signedAmount: true, stat: true, duration: true, minimum: true }, MODIFY_MAX_HEALTH: { target: true, amount: true, signedAmount: true }, SET_STAT: { target: true, amount: true, stat: true, duration: true },
  DAMAGE: { target: true, amount: true }, BUFF: { target: true, stats: true, statMultiplier: true, referenceStat: true, dynamicValue: true, statChannelReference: true }, SET_STATS: { target: true, stats: true }, HEAL: { target: true, amount: true },
  REDUCE_COST: { target: true, amount: true, minimum: true }, INCREASE_COST: { target: true, amount: true }, STUN: { target: true },
  RETIRE: { target: true, captureStats: true }, DISABLE_ABILITY: { target: true }, WEAKEN_TO_STUN_SILENCE: { target: true, amount: true },
  SILENCE: { target: true }, DESTROY: { target: true }, ADD_KEYWORD: { target: true, keyword: true }, REMOVE_KEYWORD: { target: true, keyword: true },
  SWAP_STATS: { target: true }, ADD_DAMAGE_MODIFIER: { target: false, amount: true, damageSource: true }, SUMMON: { target: false, cardDefinition: true, cardCount: true, aggregateStats: true, generatedModifiers: true }, SUMMON_FROM_HAND: { target: false, cardDefinition: true, cardCount: true }, REVIVE: { target: true }, GENERATE: { target: false, cardDefinition: true, cardCount: true, destination: true, generatedModifiers: true }, MOVE_TO_HAND: { target: true }, MOVE_TO_DECK: { target: true, destination: true }, MILL: { target: true }, SPEND_GOLD_BUFF_SELF: { target: true, dynamicValue: true }, DEPLOY_CHAMPION_TOKEN: { target: false }, CAPTURE: { target: true }, RELEASE_CAPTURED: { target: false },
  REMOVE_FROM_GAME: { target: true }, SWITCH_EFFECT_BRANCH: { target: false, branches: true }, QUEUE_EFFECT: { target: false, queuedEffect: true }, ADD_AGGREGATED_ATTACK: { target: true, aggregateStats: true }, COPY_BEST_STATS: { target: true }, REPEAT_TURN_END: { target: false }, TRANSFORM_SOURCE: { target: false, cardDefinition: true }, STEAL: { target: true },
  REGISTER_DELAYED: { target: false, delayed: true }, REGISTER_LISTENER: { target: false, listener: true }, PREVENT_DAMAGE: { target: false, prevention: true }, PREVENT_RETIRE: { target: false, prevention: true },
  GRANT_RANDOM_CARD_TEXT: { target: true },
};

function finiteScriptNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validScriptEmbeddedEffect(value: unknown, depth: number, requireTrigger: boolean): boolean {
  if (depth > SCRIPT_MAX_DEPTH || !isRecord(value) ||
    !hasOnlyKeys(value, new Set(["trigger", "action", "target", "conditions", "values"])) ||
    !ACTIONS.includes(value.action as Action) ||
    (requireTrigger && !TRIGGERS.includes(value.trigger as Trigger)) ||
    (!requireTrigger && value.trigger !== undefined && !TRIGGERS.includes(value.trigger as Trigger))) return false;
  const action = value.action as Action;
  const schema = ACTION_SCHEMAS[action];
  if ((schema.target && value.target === undefined) ||
    (!schema.target && value.target !== undefined &&
      !(["SUMMON", "GENERATE"].includes(action) && isRecord(value.target) &&
        ["RANDOM", "ADJACENT_EMPTY_SLOTS"].includes(value.target.selection as string))) ||
    (value.target !== undefined && !validScriptTarget(value.target))) return false;
  if (value.conditions !== undefined && (!Array.isArray(value.conditions) || value.conditions.length > 8 ||
    !value.conditions.every((condition) => isRecord(condition) &&
      hasOnlyKeys(condition, new Set(["type"])) && CONDITIONS.includes(condition.type as Condition)))) return false;
  return validScriptEffectValues(action, value.values, depth + 1);
}

function validScriptEffectValues(action: Action, rawValues: unknown, depth = 0): boolean {
  const schema = ACTION_SCHEMAS[action];
  if (rawValues === undefined) {
    return !schema.amount && !schema.keyword && !schema.stat && !schema.duration &&
      !schema.stats && !schema.statMultiplier && !schema.referenceStat && !schema.dynamicValue &&
      action !== "TRANSFORM_SOURCE";
  }
  if (depth > SCRIPT_MAX_DEPTH || !isRecord(rawValues) ||
    !hasOnlyKeys(rawValues, SCRIPT_EFFECT_VALUE_KEYS)) return false;
  const values = rawValues;
  const allowed: Record<string, boolean> = {
    amount: Boolean(schema.amount || action === "MOVE_TO_HAND"),
    amountExpression: Boolean(schema.amount || action === "MOVE_TO_HAND"),
    attack: Boolean(schema.stats || schema.statMultiplier || schema.referenceStat || schema.dynamicValue),
    attackExpression: Boolean(schema.stats || schema.statMultiplier || schema.dynamicValue),
    health: Boolean(schema.stats || schema.statMultiplier || schema.referenceStat || schema.dynamicValue),
    healthExpression: Boolean(schema.stats || schema.statMultiplier || schema.dynamicValue),
    countExpression: Boolean(schema.cardCount),
    attackMultiplier: Boolean(schema.statMultiplier),
    healthMultiplier: Boolean(schema.statMultiplier),
    stat: Boolean(schema.stat),
    duration: Boolean(schema.duration),
    keyword: Boolean(schema.keyword),
    damageSource: Boolean(schema.damageSource),
    reference: Boolean(schema.referenceStat),
    referenceStat: Boolean(schema.referenceStat),
    amountReference: Boolean(schema.dynamicValue),
    minimum: Boolean(schema.minimum || action === "MOVE_TO_HAND"),
    temporaryCost: action === "MOVE_TO_HAND",
    generatedModifiers: Boolean(schema.generatedModifiers),
    deckPosition: action === "MOVE_TO_DECK",
    count: Boolean(schema.cardCount),
    destination: Boolean(schema.destination),
    definitionRef: Boolean(schema.cardDefinition),
    aggregateStats: Boolean(schema.aggregateStats),
    leftEffects: Boolean(schema.branches),
    rightEffects: Boolean(schema.branches),
    queuedTrigger: Boolean(schema.queuedEffect),
    queuedEffect: Boolean(schema.queuedEffect),
    delayed: Boolean(schema.delayed),
    listener: Boolean(schema.listener),
    prevention: Boolean(schema.prevention),
    captureStats: Boolean(schema.captureStats),
  };
  if (Object.keys(values).some((key) => !allowed[key])) return false;

  const amountIsSigned = Boolean(schema.signedAmount);
  if (values.amount !== undefined &&
    !finiteScriptNumber(values.amount, amountIsSigned ? -999 : 0, 999)) return false;
  if (schema.amount && values.amount === undefined && values.amountExpression === undefined) return false;
  if (values.amountExpression !== undefined && (!validScriptValue(values.amountExpression) ||
    (!amountIsSigned && values.amountExpression.kind === "CONSTANT" && values.amountExpression.value < 0) ||
    (!amountIsSigned && (values.amountExpression.kind === "RESULT_COUNT" || values.amountExpression.kind === "RESULT_VALUE") &&
      values.amountExpression.offset !== undefined && values.amountExpression.offset < 0))) return false;
  for (const key of ["attack", "health"] as const) {
    if (values[key] !== undefined && !finiteScriptNumber(values[key], -999, 999)) return false;
  }
  for (const key of ["attackExpression", "healthExpression", "countExpression"] as const) {
    if (values[key] !== undefined && !validScriptValue(values[key])) return false;
  }
  if (values.count !== undefined &&
    (typeof values.count !== "number" || !Number.isInteger(values.count) || values.count < 1 || values.count > 20)) return false;
  if (values.attackMultiplier !== undefined &&
    !finiteScriptNumber(values.attackMultiplier, 0, 10)) return false;
  if (values.healthMultiplier !== undefined &&
    !finiteScriptNumber(values.healthMultiplier, 0, 10)) return false;
  if (schema.stats) {
    const explicitStats = values.attack !== undefined || values.health !== undefined ||
      values.attackExpression !== undefined || values.healthExpression !== undefined;
    const multiplierStats = Boolean(schema.statMultiplier) &&
      finiteScriptNumber(values.attackMultiplier, 0, 10) &&
      finiteScriptNumber(values.healthMultiplier, 0, 10);
    const referencedStats = Boolean(schema.referenceStat) &&
      values.reference !== undefined && REFERENCES.includes(values.reference as Reference) &&
      ["CURRENT_ATTACK", "CURRENT_HEALTH"].includes(values.referenceStat as string);
    const dynamicStats = Boolean(schema.dynamicValue) &&
      ["HAND_COUNT", "GRAVEYARD_WRESTLER_COUNT", "REMAINING_GOLD", "BOARD_WRESTLER_COUNT",
        "LAST_ATTACK_DELTA", "CURRENT_TURN_RETIRED_WRESTLER_COUNT", "CURRENT_TURN_DAMAGE_TAKEN"]
        .includes(values.amountReference as string);
    if (!explicitStats && !multiplierStats && !referencedStats && !dynamicStats) return false;
  }
  if (schema.stat && values.stat !== undefined && !STAT_NAMES.includes(values.stat as StatName)) return false;
  if (schema.duration && values.duration !== undefined &&
    !EFFECT_DURATIONS.includes(values.duration as EffectDuration)) return false;
  if (schema.keyword && !KEYWORDS.includes(values.keyword as Keyword)) return false;
  if (schema.damageSource && !DAMAGE_SOURCES.includes(values.damageSource as DamageSource)) return false;
  if (schema.referenceStat &&
    ((values.reference !== undefined && !REFERENCES.includes(values.reference as Reference)) ||
      (values.referenceStat !== undefined && !["CURRENT_ATTACK", "CURRENT_HEALTH"].includes(values.referenceStat as string)) ||
      ((values.reference === undefined) !== (values.referenceStat === undefined)))) return false;
   if (schema.dynamicValue && values.amountReference !== undefined &&
    !DYNAMIC_VALUES.includes(values.amountReference as DynamicValue)) return false;
  if (values.minimum !== undefined && !finiteScriptNumber(values.minimum, 0, 999)) return false;
  if (values.temporaryCost !== undefined && typeof values.temporaryCost !== "boolean") return false;
  if (values.temporaryCost === true &&
    (!finiteScriptNumber(values.amount, 0, 999) || !finiteScriptNumber(values.minimum, 0, 999))) return false;
  if (values.destination !== undefined && !["HAND", "DECK", "DECK_TOP"].includes(values.destination as string)) return false;
  if (values.deckPosition !== undefined && !["TOP", "BOTTOM"].includes(values.deckPosition as string)) return false;
  if (values.definitionRef !== undefined && (!isRecord(values.definitionRef) ||
    !hasOnlyKeys(values.definitionRef, new Set(["id", "name"])) ||
    (values.definitionRef.id !== undefined && (typeof values.definitionRef.id !== "string" || !values.definitionRef.id)) ||
    (values.definitionRef.name !== undefined && (typeof values.definitionRef.name !== "string" || !values.definitionRef.name)) ||
    (!values.definitionRef.id && !values.definitionRef.name))) return false;

  if (values.generatedModifiers !== undefined) {
    const modifiers = values.generatedModifiers;
    if (!isRecord(modifiers) || !hasOnlyKeys(modifiers, new Set(["cost", "attack", "health", "copySourceStats", "copyTargetStats"]) ) ||
      ["cost", "attack", "health"].some((key) => modifiers[key] !== undefined &&
        !finiteScriptNumber(modifiers[key], -999, 999)) ||
      ["copySourceStats", "copyTargetStats"].some((key) => modifiers[key] !== undefined &&
        typeof modifiers[key] !== "boolean")) return false;
  }
  if (values.aggregateStats !== undefined) {
    const aggregate = values.aggregateStats;
    if (!isRecord(aggregate) || !hasOnlyKeys(aggregate, new Set(["source", "attack", "health"])) ||
      !["LAST_DESTROYED_TARGETS", "LAST_CAUSED_TARGET_REMOVALS"].includes(aggregate.source as string) ||
      aggregate.attack !== "CURRENT_ATTACK_SUM" ||
      (aggregate.health !== undefined && aggregate.health !== "CURRENT_HEALTH_SUM") ||
      (action === "SUMMON" && (aggregate.source !== "LAST_DESTROYED_TARGETS" ||
        aggregate.health !== "CURRENT_HEALTH_SUM")) ||
      (action === "ADD_AGGREGATED_ATTACK" && aggregate.source !== "LAST_CAUSED_TARGET_REMOVALS")) return false;
  }
  for (const key of ["leftEffects", "rightEffects"] as const) {
    if (values[key] !== undefined && (!Array.isArray(values[key]) || values[key].length > SCRIPT_MAX_STEPS ||
      !values[key].every((child) => validScriptEmbeddedEffect(child, depth + 1, true)))) return false;
  }
  if (values.queuedTrigger !== undefined &&
    !["NEXT_ALLY_WRESTLER_PLAYED", "NEXT_TECHNIQUE_PLAYED"].includes(values.queuedTrigger as string)) return false;
  if (values.queuedEffect !== undefined && !validScriptEmbeddedEffect(values.queuedEffect, depth + 1, false)) return false;
  if (values.delayed !== undefined) {
    const delayed = values.delayed;
    if (!isRecord(delayed) || !hasOnlyKeys(delayed, new Set(["kind", "count", "eventTrigger", "effect", "followUpEffects"])) ||
      !["OWNER_NEXT_TURN_START", "OPPONENT_NEXT_TURN_START", "END_OF_CURRENT_TURN", "NEXT_MATCHING_EVENT", "N_MATCHING_EVENTS"]
        .includes(delayed.kind as string) ||
      (delayed.kind === "N_MATCHING_EVENTS" &&
        (typeof delayed.count !== "number" || !Number.isInteger(delayed.count) || delayed.count < 1 || delayed.count > 20)) ||
      (delayed.eventTrigger !== undefined &&
        !["CARD_PLAYED", "TECHNIQUE_PLAYED", "CARD_RETIRED", "DAMAGE_TAKEN"].includes(delayed.eventTrigger as string)) ||
      !validScriptEmbeddedEffect(delayed.effect, depth + 1, false) ||
      (delayed.followUpEffects !== undefined && (!Array.isArray(delayed.followUpEffects) || delayed.followUpEffects.length > 4 ||
        !delayed.followUpEffects.every((child) => validScriptEmbeddedEffect(child, depth + 1, false))))) return false;
  }
  if (values.listener !== undefined) {
    const listener = values.listener;
    if (!isRecord(listener) || !hasOnlyKeys(listener, new Set(["trigger", "cardType", "owner", "uses", "effect"])) ||
      !RULE_LISTENER_TRIGGERS.includes(listener.trigger as typeof RULE_LISTENER_TRIGGERS[number]) ||
      (listener.cardType !== undefined && listener.cardType !== "WRESTLER" && listener.cardType !== "TECHNIQUE") ||
      (listener.owner !== undefined && listener.owner !== "SELF" && listener.owner !== "ENEMY") ||
      (listener.uses !== undefined &&
        (typeof listener.uses !== "number" || !Number.isInteger(listener.uses) || listener.uses < 1 || listener.uses > 20)) ||
      !validScriptEmbeddedEffect(listener.effect, depth + 1, false)) return false;
  }
  if (values.prevention !== undefined) {
    const prevention = values.prevention;
    if (!isRecord(prevention) || !hasOnlyKeys(prevention, new Set(["uses", "setHealth"])) ||
      (prevention.uses !== undefined &&
        (typeof prevention.uses !== "number" || !Number.isInteger(prevention.uses) || prevention.uses < 1 || prevention.uses > 20)) ||
      (prevention.setHealth !== undefined &&
        (typeof prevention.setHealth !== "number" || !Number.isInteger(prevention.setHealth) || prevention.setHealth < 1 || prevention.setHealth > 999))) return false;
  }
  if (values.captureStats !== undefined && typeof values.captureStats !== "boolean") return false;
  return true;
}

const ACTION_DESCRIPTIONS: Record<Action, string> = {
  BUFF: "명시된 공격력/체력 채널만 변경합니다.", SET_STATS: "대상의 공격력과 체력을 지정한 값으로 설정합니다.", MODIFY_STAT: "대상의 비용, 공격력 또는 체력을 변경합니다.", MODIFY_MAX_HEALTH: "대상의 최대 체력만 변경합니다.", SET_STAT: "대상의 비용, 공격력 또는 체력을 지정한 값으로 설정합니다.", DAMAGE: "대상에게 피해를 줍니다.", HEAL: "대상의 체력을 회복합니다.",
  SILENCE: "대상의 효과와 키워드를 침묵시킵니다.", DESTROY: "대상을 파괴합니다.", RETIRE: "대상을 무덤으로 보냅니다.", ADD_GOLD: "현재 골드를 획득합니다.",
  ADD_NEXT_TURN_GOLD: "다음 내 턴의 골드를 증가시킵니다.", DRAW: "카드를 드로우합니다.", REDUCE_COST: "대상의 비용을 감소시킵니다.",
  INCREASE_COST: "대상의 비용을 증가시킵니다.", STUN: "대상을 기절시킵니다.", DISABLE_ABILITY: "대상의 능력을 비활성화합니다.", WEAKEN_TO_STUN_SILENCE: "공격력을 낮추고 0이 된 대상을 기절·침묵시킵니다.", ADD_KEYWORD: "대상에게 키워드를 부여합니다.",
  REMOVE_KEYWORD: "대상의 키워드를 제거합니다.", SWAP_STATS: "대상의 현재 공격력과 체력을 서로 교환합니다.", ADD_DAMAGE_MODIFIER: "조건에 맞는 카드의 피해량을 변경합니다.", SUMMON: "선수를 필드에 소환합니다.", GENERATE: "카드를 생성합니다.",
  CAPTURE: "대상을 포획합니다.", RELEASE_CAPTURED: "포획한 카드를 필드에 해방합니다.", SUMMON_FROM_HAND: "손패의 지정 카드를 필드에 소환합니다.", REVIVE: "무덤의 기존 선수를 체력을 회복해 필드로 되살립니다.", MOVE_TO_HAND: "대상을 손패로 이동합니다.", MOVE_TO_DECK: "대상을 덱으로 이동합니다.", STEAL: "상대 영역의 기존 카드를 내 손패로 이동합니다.", MILL: "덱 맨 위 카드를 무덤으로 보냅니다.", SPEND_GOLD_BUFF_SELF: "남은 골드를 모두 소비하고 자신을 강화합니다.", DEPLOY_CHAMPION_TOKEN: "현재 챔피언에 연결된 Champion Token을 특별 전개합니다.", REMOVE_FROM_GAME: "대상을 제거합니다.",
  SWITCH_EFFECT_BRANCH: "현재 슬롯의 왼쪽/오른쪽 분기에 맞는 효과를 실행합니다.", QUEUE_EFFECT: "다음 조건을 만족하는 카드에 효과를 예약합니다.", ADD_AGGREGATED_ATTACK: "직전에 퇴장시킨 대상의 현재 공격력 합을 대상에게 더합니다.", COPY_BEST_STATS: "후보 중 현재 공격력과 체력의 합이 가장 큰 카드의 현재 스탯을 자신에게 더합니다.", REPEAT_TURN_END: "아군 카드의 턴 종료 효과를 한 번 더 실행합니다.", TRANSFORM_SOURCE: "현재 효과의 원본 카드를 지정한 CardDefinition으로 변신시킵니다.",
  REGISTER_DELAYED: "턴 시작/종료 또는 다음 일치 이벤트에 실행할 효과를 등록합니다.", REGISTER_LISTENER: "일치하는 이벤트에 한 번 또는 반복해서 실행할 효과를 등록합니다.", PREVENT_DAMAGE: "다음 지정 피해를 막습니다.", PREVENT_RETIRE: "다음 치명적 퇴장을 체력 1로 대체합니다.",
  GRANT_RANDOM_CARD_TEXT: "현재 매치의 기존 선수 카드 텍스트를 무작위로 부여합니다.",
};

export const EFFECT_CAPABILITIES: Record<Action, { description: string; status: RegistryStatus; version: number; runtimeHandler: true }> =
  Object.fromEntries(ACTIONS.map((name) => [name, { description: ACTION_DESCRIPTIONS[name], status: "ACTIVE", version: 1, runtimeHandler: true }])) as Record<Action, { description: string; status: RegistryStatus; version: number; runtimeHandler: true }>;
export const RUNTIME_HANDLER_ACTIONS = ACTIONS;

const triggerDescriptions: Record<Trigger, string> = {
  GAME_START: "초기 손패를 나누기 전에 덱 또는 손패에 있는 카드에서 각각 한 번 발동합니다.",
  ENTER_FIELD: "선수가 어떤 정상 경로로든 필드에 들어올 때 발동합니다.", LEAVE_FIELD: "카드가 필드를 떠날 때 발동합니다.", SELF_RETIRE: "이 카드가 RETIRE로 필드를 떠날 때 발동합니다.", CARD_SUMMONED: "선수가 소환으로 필드에 들어올 때 아군 보드에서 발동합니다.", CARD_ENTERED: "아군 카드가 플레이, 소환 등으로 필드에 들어올 때 아군 보드에서 발동합니다.",
  ACTIVE: "액티브 능력을 사용할 때 발동합니다.", CARD_DRAWN: "카드가 덱에서 드로우될 때 발동합니다.", CARD_RETIRED: "아군 선수가 퇴장할 때 발동합니다.", FIRST_ATTACKED: "이 카드가 처음 공격받을 때 발동합니다.",
  SELF_ATTACK: "이 카드가 공격할 때 발동합니다.", OTHER_ALLY_ATTACK: "다른 아군 선수가 공격할 때 발동합니다.", ATTACK_SURVIVED: "적 선수를 공격하고 생존했을 때 발동합니다.", SELF_DAMAGED: "이 카드가 실제 피해를 받아 체력이 감소했을 때 발동합니다.", STAT_CHANGED: "효과로 스탯이 증가했을 때 발동합니다.", TECHNIQUE_CAST: "1G 이상 기본 비용의 기술을 손에서 사용할 때 발동합니다.",
  EXACT_ZERO_DAMAGE: "이 카드가 다른 선수의 체력을 정확히 0으로 만들 때 발동합니다.",
  TURN_START: "턴 시작 시 발동합니다.", TURN_END: "턴 종료 시 발동합니다.", BEFORE_DAMAGE: "피해를 적용하기 직전에 발동합니다.", BEFORE_RETIRE: "치명적 퇴장을 적용하기 직전에 발동합니다.",
};

export const EFFECT_LIBRARY = {
  actions: ACTIONS.map((name) => {
    const schema = ACTION_SCHEMAS[name];
    const values = {
       ...(schema.amount ? { amount: schema.signedAmount ? "number (-999..999)" : "number (0..999)" } : {}),
       ...(schema.stat ? { stat: [...STAT_NAMES] } : {}),
       ...(schema.duration ? { duration: [...EFFECT_DURATIONS] } : {}),
      ...(schema.stats ? { attack: "number (-999..999)", health: "number (-999..999)" } : {}),
       ...(schema.statMultiplier ? { attackMultiplier: "number (0..10)", healthMultiplier: "number (0..10)" } : {}),
       ...(schema.referenceStat ? { reference: [...REFERENCES], referenceStat: ["CURRENT_ATTACK", "CURRENT_HEALTH"] } : {}),
         ...(schema.dynamicValue ? { amountReference: [...DYNAMIC_VALUES] } : {}),
        ...(schema.statChannelReference ? { attackReference: [...DYNAMIC_VALUES], healthReference: [...DYNAMIC_VALUES] } : {}),
       ...(schema.minimum ? { minimum: "number (0..999)" } : {}),
       ...(schema.generatedModifiers ? { generatedModifiers: "{ cost?: number, attack?: number, health?: number, copySourceStats?: boolean, copyTargetStats?: boolean }" } : {}),
      ...(schema.keyword ? { keyword: [...KEYWORDS] } : {}),
      ...(schema.damageSource ? { damageSource: [...DAMAGE_SOURCES] } : {}),
       ...(schema.branches ? { leftEffects: "Effect[]", rightEffects: "Effect[]" } : {}),
       ...(schema.queuedEffect ? { queueTrigger: ["NEXT_ALLY_WRESTLER_PLAYED"], queuedEffect: "Effect" } : {}),
       ...(schema.cardDefinition ? { definition: "CardDefinition", definitionRef: "{ id?: string, name?: string }" } : {}),
       ...(schema.cardCount ? { count: "integer (1..20)" } : {}),
       ...(schema.destination ? { destination: '"HAND" | "DECK" | "DECK_TOP"' } : {}),
        ...(schema.aggregateStats ? { aggregateStats: "{ source: LAST_DESTROYED_TARGETS, attack: CURRENT_ATTACK_SUM, health: CURRENT_HEALTH_SUM }" } : {}),
        ...(schema.captureStats ? { captureStats: "boolean" } : {}),
        ...(name === "TRANSFORM_SOURCE" ? { definitionRef: "{ id?: string, name?: string }", causal: ["DAMAGE_CAUSED_TARGET_RETIRE"] } : {}),
       ...(schema.conditionalBuff ? { conditionalBuff: "{ healthEquals: number, attack: number, health: number }" } : {}),
    };
    return {
      name,
      label: DISPLAY_LABELS[name as keyof typeof DISPLAY_LABELS] ?? name,
      description: EFFECT_CAPABILITIES[name].description,
      status: EFFECT_CAPABILITIES[name].status,
      version: EFFECT_CAPABILITIES[name].version,
      requiredConfig: { target: schema.target, ...(Object.keys(values).length ? { values } : {}) },
    };
  }),
    triggers: TRIGGERS.map((name) => ({ name, label: DISPLAY_LABELS[name as keyof typeof DISPLAY_LABELS] ?? name, description: triggerDescriptions[name], status: "ACTIVE" as const, version: 1 })),
   conditions: CONDITIONS.map((name) => ({ name, label: DISPLAY_LABELS[name as keyof typeof DISPLAY_LABELS] ?? name, description: name === "SOURCE_IS_ONLY_WRESTLER" ? "이 카드가 내 필드의 유일한 선수인지 확인합니다." : "구조화된 조건을 확인합니다.", status: "ACTIVE" as const, version: 1 })),
    targetResolvers: [{ name: "ZONE_OWNER_SELECTION", description: "영역(여러 영역 포함), 소유자, 카드 유형, 단일 filter 객체, 선택 방식 및 수로 대상을 해석합니다.", config: { zone: [...TARGET_ZONES], zones: "TargetZone[]", defaultCardScope: [...DEFAULT_CARD_TARGET_SCOPE], owner: [...TARGET_OWNERS], filter: { isGenerated: "boolean", minCost: "integer", maxCost: "integer", isToken: "boolean", isChampionToken: "boolean", excludeSource: "boolean", isVanilla: "boolean", keyword: [...KEYWORDS], cost: "{ compare, value }", attack: "{ compare, value }", health: "{ compare, value }", tagsAny: "string[]", tagsAll: "string[]", tagsNone: "string[]" }, selection: [...TARGET_SELECTIONS], randomScope: [...RANDOM_SCOPES], count: "integer (1..20)" }, status: "ACTIVE" as const, version: 1 }],
    valueResolvers: [
      { name: "AMOUNT", description: "골드, 피해, 회복, 드로우 및 비용 수치를 해석합니다.", status: "ACTIVE" as const, version: 1 },
      { name: "STAT_PAIR", description: "+공격력/+체력 수치를 해석합니다.", status: "ACTIVE" as const, version: 1 },
      { name: "STAT_MULTIPLIER", description: "대상의 현재 공격력과 체력을 배수로 변경합니다.", config: { attackMultiplier: "number (0..10)", healthMultiplier: "number (0..10)" }, status: "ACTIVE" as const, version: 1 },
      { name: "REFERENCE_STAT", description: "마지막 공격자 등 참조 대상의 현재 능력치를 수치로 해석합니다.", config: { reference: [...REFERENCES], referenceStat: ["CURRENT_ATTACK", "CURRENT_HEALTH"] }, status: "ACTIVE" as const, version: 1 },
      { name: "STAT_CHANNEL_REFERENCE", description: "attackReference는 공격력만, healthReference는 체력과 최대 체력만 변경합니다. 생략한 채널은 변경하지 않습니다. 레거시 amountReference는 두 채널을 함께 바꾸는 이전 형식입니다.", config: { attackReference: [...DYNAMIC_VALUES], healthReference: [...DYNAMIC_VALUES] }, status: "ACTIVE" as const, version: 1 },
      { name: "KEYWORD", description: "지원 키워드를 해석합니다.", values: [...KEYWORDS], status: "ACTIVE" as const, version: 1 },
    ],
} as const;
