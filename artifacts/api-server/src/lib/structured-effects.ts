import {
  ACTION_SCHEMAS, ACTIONS, CONDITIONS, DAMAGE_SOURCES, DEFAULT_CARD_TARGET_SCOPE, EFFECT_CAPABILITIES, EFFECT_LIBRARY, KEYWORDS, REFERENCES, RULE_LISTENER_TRIGGERS, TARGET_OWNERS,
  RANDOM_SCOPES, TARGET_SELECTIONS, TARGET_ZONES, TRIGGERS,
  type Action, type Condition, type Keyword, type Reference, type TargetOwner, type TargetSelection,
  type DamageSource, type RandomScope, type TargetZone, type Trigger, type StatName, type EffectDuration,
  type StructuredEffect, type StructuredTarget, type StructuredQueuedEffect, type StructuredEffectConfig,
  type StructuredEffectCondition, type StructuredSchedule, type StructuredListener, type StructuredPrevention,
  STAT_NAMES, EFFECT_DURATIONS, isEffectScript, type EffectScript,
} from "@workspace/effect-registry";
import { cardTagsSchema } from "@workspace/api-zod";
import { normalizeEffectLanguage } from "./effect-language";

export { ACTIONS, KEYWORDS, TRIGGERS };
export type { Action, Keyword, Trigger };
export type {
  StructuredEffect,
  StructuredTarget,
  StructuredQueuedEffect,
  StructuredEffectConfig,
} from "@workspace/effect-registry";
export type Target = StructuredTarget;
export type EffectCondition = StructuredEffectCondition;
export type QueuedStructuredEffect = StructuredQueuedEffect;
export type RuleSchedule = StructuredSchedule;
export type RuleListener = StructuredListener;
export type RulePrevention = StructuredPrevention;
export type EffectScriptConfig = import("@workspace/effect-registry").EffectScriptConfig;

/**
 * Values are action-scoped, not a bag of optional properties. Keeping this
 * allow-list beside the executable validator prevents an otherwise valid
 * field (for example `stat`) from silently changing the meaning of a
 * destructive action such as DESTROY.
 */
const ACTION_VALUE_KEYS: Partial<Record<Action, readonly string[]>> = {
  BUFF: ["attack", "health", "attackMultiplier", "healthMultiplier", "reference", "referenceStat", "amountReference", "duration", "conditionalBuff"],
  SET_STATS: ["attack", "health", "duration"],
  MODIFY_STAT: ["amount", "stat", "duration", "minimum"],
  MODIFY_MAX_HEALTH: ["amount"],
  SET_STAT: ["amount", "stat", "duration"],
  DAMAGE: ["amount", "conditionalBuff"],
  HEAL: ["amount"],
  ADD_GOLD: ["amount"],
  ADD_NEXT_TURN_GOLD: ["amount"],
  DRAW: ["amount"],
  SILENCE: [],
  DESTROY: [],
  RETIRE: ["captureStats"],
  STUN: [],
  DISABLE_ABILITY: [],
  REDUCE_COST: ["amount", "minimum"],
  INCREASE_COST: ["amount"],
  WEAKEN_TO_STUN_SILENCE: ["amount"],
  ADD_KEYWORD: ["keyword"],
  REMOVE_KEYWORD: ["keyword"],
  SWAP_STATS: [],
  ADD_DAMAGE_MODIFIER: ["amount", "damageSource"],
  SUMMON: ["definition", "definitionRef", "count", "generatedModifiers", "aggregateStats"],
  SUMMON_FROM_HAND: ["definition", "definitionRef", "count"],
  REVIVE: [],
  GENERATE: ["definition", "definitionRef", "count", "destination", "generatedModifiers", "deckPosition"],
  MOVE_TO_HAND: ["amount", "minimum", "temporaryCost"],
  MOVE_TO_DECK: ["deckPosition"],
  STEAL: [],
  MILL: [],
  SPEND_GOLD_BUFF_SELF: ["amountReference"],
  DEPLOY_CHAMPION_TOKEN: [],
  CAPTURE: [],
  RELEASE_CAPTURED: [],
  REMOVE_FROM_GAME: [],
  SWITCH_EFFECT_BRANCH: ["leftEffects", "rightEffects"],
  QUEUE_EFFECT: ["queuedTrigger", "queuedEffect"],
  ADD_AGGREGATED_ATTACK: ["aggregateStats"],
  COPY_BEST_STATS: [],
  TRANSFORM_SOURCE: ["definition", "definitionRef", "causal"],
  REGISTER_DELAYED: ["delayed"],
  REGISTER_LISTENER: ["listener"],
  PREVENT_DAMAGE: ["prevention"],
  PREVENT_RETIRE: ["prevention"],
  GRANT_RANDOM_CARD_TEXT: [],
  REPEAT_TURN_END: [],
};

function hasOnlyActionValueKeys(action: Action, values: unknown): boolean {
  if (values === undefined) return true;
  if (!values || typeof values !== "object" || Array.isArray(values)) return false;
  const allowed = ACTION_VALUE_KEYS[action];
  return !allowed || Object.keys(values).every((key) => allowed.includes(key));
}
/** Champion-only reward marker. It is stored beside normal structured effects
 * in the Champion quest reward payload, but is not a card runtime action. */
export type ChampionUpgradeEffect = {
  trigger: Trigger;
  action: "UPGRADE_CHAMPION_ABILITY";
};
export type AnalysisOutcome = "supported" | "mechanism_required" | "analysis_failure";
export type ReferencedCard = {
  id: string;
  name: string;
  cardType: "WRESTLER" | "TECHNIQUE";
  isToken: boolean;
  isChampionToken: boolean;
  attack?: number;
  health?: number;
};
export type CardReferenceCandidate = ReferencedCard;
export type CardReferenceError = {
  code: "CARD_REFERENCE_NOT_FOUND" | "CARD_REFERENCE_AMBIGUOUS";
  name: string;
  candidateIds?: string[];
};
export type Analysis = {
  status: "success" | "partial" | "failure";
  outcome: AnalysisOutcome;
  effects: StructuredEffect[];
  scripts?: EffectScript[];
  keywords: Keyword[];
  unsupportedSegments: string[];
  summaries: string[];
  reason?: string;
  condition?: Record<string, unknown>;
  referencedCards?: ReferencedCard[];
  referenceErrors?: CardReferenceError[];
};
export type EffectAnalysisOptions = {
  defaultTrigger?: Trigger;
  cardCatalog?: readonly CardReferenceCandidate[];
  /** Safe, server-derived vocabulary used only to disambiguate natural-language tags. */
  availableTags?: readonly string[];
};

const aliases = {
  trigger: [
    ["ENTER_FIELD", /^(?:필드에\s*)?(?:등장|출현|MAGIC)(?:할\s*때|하면)?\s*[:：]?/i],
    ["SELF_RETIRE", /^(?:필드에서\s*)?(?:퇴장|리타이어)(?:할\s*때|하면)?\s*[:：]?/],
    ["SELF_RETIRE", /^이\s*카드가\s*(?:퇴장|리타이어)(?:할\s*때|하면)?\s*[:：]?/],
    ["LEAVE_FIELD", /^(?:필드를?\s*(?:떠날|벗어날)\s*때|필드에서\s*(?:떠날|벗어날)\s*때)\s*[:：]?/],
    ["ACTIVE", /^액티브(?:\s*사용)?(?:하면)?\s*[:：]?/],
    ["CARD_DRAWN", /^(?:준비|TURBO)\s*[:：]?/i],
    ["SELF_ATTACK", /^(?:(?:이\s*카드가|자신이)\s*공격할\s*때마다|SELF_ATTACK)\s*[:：]?/i],
    ["ATTACK_SURVIVED", /^(?:ATTACK_SURVIVED|공격(?:하고|한\s*뒤에)\s*(?:살면|안\s*죽었으면|안죽었으면|죽지\s*않으면))\s*[:：]?/i],
    ["OTHER_ALLY_ATTACK", /^(?:콤보|SUPPORT)\s*[:：]?/i],
    ["TECHNIQUE_CAST", /^(?:주문|SHOCK)\s*[:：]?/i],
    ["EXACT_ZERO_DAMAGE", /^(?:핀폴|BULLSEYE)\s*[:：]?/i],
    ["TURN_START", /^턴\s*시작(?:할\s*때|하면)?\s*[:：]?/i],
    ["TURN_END", /^턴\s*종료(?:할\s*때|하면)?\s*[:：]?/i],
  ] as const,
  keyword: [
    ["RUSH", /(?:러쉬|RUSH|CHARGE)/i], ["SURPRISE", /(?:기습|HASTE)/i], ["TAUNT", /(?:도발|TAUNT)/i],
  ["DODGE", /(?:회피(?:\(\d+\))?|DODGE)/i], ["MULTI_STRIKE", /연타/],
  ] as const,
} as const;

const STAT_MULTIPLIER_PATTERN = /(?:자신(?:의|에게)?\s*)?(?:현재\s*)?(?:공격(?:력)?\s*(?:과|\/|및)\s*체력|체력\s*(?:과|\/|및)\s*공격(?:력)?)(?:의\s*)?(?:(?:수치(?:를|가)?)|(?:을|를))?\s*(\d+(?:\.\d+)?)\s*배(?:로)?(?:\s*(?:만들|변경|합니다|한다))?/i;
const STAT_PAIR_INCREMENT_PATTERN = /(?:공격(?:력)?\s*(?:과|\/|및)\s*체력|체력\s*(?:과|\/|및)\s*공격(?:력)?)(?:의\s*)?(?:(?:수치(?:를|가)?)|(?:을|를))?\s*(\d+(?:\.\d+)?)\s*(?:씩\s*)?(?:증가|올려|올립(?:니다|다)?|상승|강화)(?:시킵니다|합니다|한다)?/i;
const SINGLE_STAT_INCREMENT_PATTERN = /(공격력|체력)(?:을|를|이|가)?\s*([+-]?\d+)\s*(?:씩\s*)?(?:증가|올려|올립(?:니다|다)?|상승|강화)(?:시킵니다|합니다|한다)?/i;
const REFERENCE_ATTACK_INCREMENT_PATTERN = /공격한\s*(?:아군\s*)?선수의\s*공격력\s*만큼\s*(?:자신의\s*)?공격력(?:을|이)?\s*(?:증가|올려|상승|강화)/i;
const SET_ATTACK_ZERO_PATTERN = /(?:자신의\s*)?공격력을\s*0\s*으로(?:\s*(?:만들|설정|변경))?/i;
const NEXT_PLAY_HEALTH_BUFF_PATTERN = /다음(?:에)?\s*(?:(?:내가|제가)\s*)?(?:내는|플레이하는|출현하는|등장하는)\s*(?:아군\s*)?(?:선수\s*)?카드(?:\s*(?:1장|한\s*장))?(?:에게)?\s*(?:(?:이|을|의)\s*)?(?:체력(?:이|을)?\s*)?[+]?(\d+)\s*(?:증가|늘어|올라|올라갑니다?|올립니다?|부여)/i;
const STAT_SWAP_PATTERN = /(?:자신(?:의|에게)?\s*)?(?:현재\s*)?(?:공격(?:력)?\s*(?:과|\/|및)\s*체력|체력\s*(?:과|\/|및)\s*공격(?:력)?)[^.!?]{0,30}?(?:서로\s*)?(?:교환|바꾸|바꿉니다)/i;
const ACTIVE_CARD_SCOPE_PATTERN = /(?:어디\s*(?:에\s*)?(?:있든|있는)|모든\s*위치의|손패?\s*[,，]?\s*덱\s*[,，]?\s*(?:필드|보드)|손패\s*(?:및|와|과)\s*덱\s*(?:및|와|과)\s*(?:필드|보드))/;
const GENERATED_FILTER_PATTERN = /(?:생성된|생성\s*카드|GENERATED)/i;
const MIN_COST_PATTERN = /(\d+)\s*(?:코스트|비용)\s*이상/;
const AGGREGATED_STATS_PATTERN = /(?:현재\s*)?(?:공격(?:력)?\s*(?:과|\/|및)\s*체력|체력\s*(?:과|\/|및)\s*공격(?:력)?)[^.!?]{0,30}?합산/;
const AGGREGATED_ATTACK_PATTERN = /(?:리타이어|퇴장|파괴).*공격력.*(?:더|추가)|공격력.*(?:리타이어|퇴장|파괴)/;
const SOURCE_CAUSED_REMOVAL_ATTACK_PATTERN =
  /(?:이\s*카드|자신)[^.!?]{0,80}?(?:리타이어|퇴장|파괴)[^.!?]{0,50}?(?:선수|대상)[^.!?]{0,50}?공격력[^.!?]{0,50}?(?:이\s*카드의|자신의)\s*공격력[^.!?]{0,30}?(?:더|추가|증가)/;
const STAT_PAIR_SET_PATTERN = /(?:공격력|공격)\s*\/\s*(?:체력|HP)\s*(?:이|가|을|를)?\s*(\d+)\s*\/\s*(\d+)\s*(?:이|가)?\s*(?:됩니다|된다|됩니다|됩니다|됩니다|됩니다|만듭니다|설정)/i;
const STAT_SET_PATTERN = /(비용|코스트|공격력|체력)\s*(?:이|가|을|를|은|는)?\s*(\d+)\s*(?:이|가|으로|로)?\s*(?:됩니다|된다|됩니다|만듭니다|설정(?:합니다|됩니다)?)/gi;
const STAT_PAIR_INCREMENT_GENERIC_PATTERN = /([+-]\d+)\s*\/\s*([+-]\d+)/g;
const STAT_INCREMENT_GENERIC_PATTERN = /(비용|코스트|공격력|체력)\s*(?:이|가|을|를|은|는)?\s*([+-]?\d+)\s*(?=(?:증가|감소|올라|올려|올립니다|낮아|낮추|강화|얻|씩|만큼|,|\.|\(|\)|$))/gi;

export function effectLibrary() {
  return EFFECT_LIBRARY;
}
function isActiveAction(action: Action) {
  return EFFECT_CAPABILITIES[action].status === "ACTIVE";
}

function normalize(input: string) {
  const normalized = normalizeEffectLanguage(input).normalizedText.replace(/[：:]/g, ":");
  // Admin exports can include the source card name on the line before a
  // colon-prefixed ability. It is presentation metadata, not effect text.
  const beginsWithTrigger = /^(?:필드에\s*)?(?:등장|출현|퇴장|리타이어|액티브|준비|콤보|주문|핀폴|턴\s*시작|턴\s*종료|MAGIC|TURBO|SELF_ATTACK|SUPPORT|SHOCK|BULLSEYE)\s*:/i.test(normalized);
  return (beginsWithTrigger ? normalized : normalized.replace(/^.*?\s+(?=(?:퇴장|리타이어)\s*:)/, ""))
    // Card exports and compact Korean input frequently omit the boundaries
    // around the canonical tag/zone vocabulary. Restore only unambiguous
    // grammar boundaries; tag values themselves are never rewritten.
    .replace(/(태그|속성)(?=(?:가|를|은|는|이|인|있는|붙은|달려))/g, "$1 ")
    .replace(/(?<=[가-힣A-Za-z0-9])(태그|속성|붙은|달려|가진|있는)/gu, " $1")
    .replace(/(?<=태그)(?=(?:카드|선수))/g, " ")
    .replace(/손(?:패)?덱필드|손덱필드/g, "손패 덱 필드")
    .replace(/내카드/g, "내 카드")
    .replace(/아군카드/g, "아군 카드")
    .replace(/([+-]\d+)([+-]\d+)/g, "$1/$2")
    .replace(/([+-]?\d+)\s*([+-]\d+)(?=\s*(?:씩|부여|강화|올))/g, "$1/$2")
    .replace(/(만듭니다|시킵니다|합니다|습니다|한다|해요|하세요|하기|얻기|줍니다|준다)$/g, "").trim();
}
function numberFrom(text: string, fallback = 1) {
  const match = text.match(/([+-]?\d+)\s*(?:장|개|g|골드|데미지|피해)?/i);
  return match ? Math.abs(Number(match[1])) : /(한\s*장|하나)/.test(text) ? 1 : fallback;
}
function targetCountFrom(text: string) {
  const numeric = text.match(/(\d+)\s*장(?=\s*(?:에게|을|를)?)/);
  if (numeric) return Number(numeric[1]);
  if (/(두|둘)\s*장/.test(text)) return 2;
  if (/(세|셋)\s*장/.test(text)) return 3;
  if (/(모든|전부)/.test(text)) return 20;
  return 1;
}
function targetFilterFor(text: string, availableTags: readonly string[] = []): Target["filter"] | undefined {
  const generated = GENERATED_FILTER_PATTERN.test(text);
  const minCost = Number(text.match(MIN_COST_PATTERN)?.[1] ?? text.match(/(?:코스트|비용)(?:이)?\s*(\d+)\s*이상/)?.[1]);
  const maxCost = Number(text.match(/(\d+)\s*(?:코스트|비용)\s*이하/)?.[1] ?? text.match(/(?:코스트|비용)(?:이)?\s*(\d+)\s*이하/)?.[1]);
  const token = /토큰/.test(text) && !/챔피언\s*토큰/.test(text);
  const nonChampionToken = /챔피언\s*토큰\s*제외/.test(text);
  const excludeSource = /자신을\s*제외/.test(text);
  const tagFilter = tagFilterFor(text, availableTags);
  const filter = {
    ...(generated ? { isGenerated: true } : {}),
    ...(/바닐라|무능력|효과가\s*없는|능력이\s*없는/.test(text) ? { isVanilla: true } : {}),
    ...(Number.isInteger(minCost) ? { minCost } : {}),
    ...(Number.isInteger(maxCost) ? { maxCost } : {}),
    ...(token ? { isToken: true } : {}),
    ...(nonChampionToken ? { isChampionToken: false } : {}),
    ...(excludeSource ? { excludeSource: true } : {}),
    ...(tagFilter ?? {}),
  };
  return Object.keys(filter).length ? filter : undefined;
}

function normalizedTag(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function tagNamesBeforeMarker(text: string, availableTags: readonly string[] = []): string[] {
  const vocabulary = [...new Set(availableTags.map(normalizedTag).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  const marker = /태그|속성|붙은|달려|가진|인(?:\s|$)/.exec(text);
  const markerIndex = marker?.index ?? text.length;
  const prefix = text.slice(0, markerIndex);
  const quoted = [...text.matchAll(/['‘’“”"]([^'‘’“”"]+)['‘’“”"]/g)]
    .filter((match) => (match.index ?? text.length) < markerIndex)
    .map((match) => normalizedTag(match[1]!))
    .filter(Boolean);
  const exactQuoted = quoted.filter((candidate) =>
    vocabulary.length === 0 || vocabulary.some((tag) => tag === candidate),
  );
  const compact = (value: string) => normalizedTag(value).replace(/\s+/g, "");
  const compactText = compact(text);
  const vocabularyMatches = vocabulary.filter((tag) => {
    const candidate = compact(tag);
    const index = compactText.indexOf(candidate);
    if (index < 0) return false;
    // Vocabulary matching is exact after whitespace normalization. The
    // surrounding grammar is checked separately, so a short tag never
    // matches a longer tag by substring accident.
    const after = compactText.slice(index + candidate.length);
    const longerVocabularyMatch = vocabulary.some((other) =>
      other !== tag && compact(other).length > candidate.length &&
      compactText.slice(index).startsWith(compact(other)),
    );
    const followedByTagGrammar = /^(?:태그|속성|인|붙은|달려|가진|있는|아닌|면서|가|를|은|는|들|\/|또는|및|와|과)/u.test(after);
    return !longerVocabularyMatch && followedByTagGrammar;
  });
  const explicit = exactQuoted.length
    ? exactQuoted
    : vocabularyMatches.sort((left, right) =>
      compactText.indexOf(compact(left)) - compactText.indexOf(compact(right)),
    );
  if (!explicit.length && vocabulary.length === 0 && /(?:태그|속성|붙은|달려)/.test(text)) {
    const unquoted = prefix.match(/([가-힣A-Za-z0-9]+)\s*$/)?.[1];
    if (unquoted) return [normalizedTag(unquoted)];
  }
  return [...new Set(explicit)].slice(0, 3);
}

function hasTagPredicateLanguage(text: string, availableTags: readonly string[] = []): boolean {
  const compactText = text.replace(/\s+/g, "");
  const vocabularyPredicate = availableTags.some((tag) => {
    const compactTag = normalizedTag(tag).replace(/\s+/g, "");
    const index = compactText.indexOf(compactTag);
    return index >= 0 && /^(?:인|있는|들|가진)/u.test(compactText.slice(index + compactTag.length));
  });
  return /(?:태그|속성|붙은|달려)/.test(text) ||
    /['‘’“”"][^'‘’“”"]+['‘’“”"]\s*(?:인|있는)/.test(text) ||
    vocabularyPredicate;
}

function tagFilterFor(text: string, availableTags: readonly string[] = []): Target["filter"] | undefined {
  if (!hasTagPredicateLanguage(text, availableTags)) return undefined;
  const tags = tagNamesBeforeMarker(text, availableTags);
  if (!tags.length) return undefined;
  if (/(?:태그|속성)\s*(?:가|를|은|는)?\s*(?:없는|없음|제외|아닌|포함하지\s*않)|(?:태그|속성|붙은|달려|가진|있는)[^.!?]{0,18}(?:없는|아닌|제외)/.test(text)) return { tagsNone: tags };
  if (/(?:모두|둘\s*다|전부)\s*(?:가진|포함)|(?:및|와|과)\s*[^.!?]{0,24}(?:태그|속성|붙은|달려|가진|있는)|면서/.test(text)) return { tagsAll: tags };
  return { tagsAny: tags };
}

function validTagFilterValues(value: unknown): value is string[] {
  const parsed = cardTagsSchema.safeParse(value);
  return parsed.success && parsed.data.length > 0;
}
function baseTargetFor(text: string, randomPool = false, availableTags: readonly string[] = []): Target {
  const hand = /손(?:패)?/.test(text);
  const graveyard = /(?:무덤|묘지)/.test(text);
  const topOfDeck = /(?:덱\s*(?:맨\s*)?위|덱\s*위)/.test(text);
  const enemyQualifier = /(?:적|상대)/.test(text);
  const explicitSelfTarget = /(?:자신(?:의|에게|을|은)|(?:아군|내)\s*(?:선수|대상|캐릭터|챔피언)?)/.test(text);
  const selectedOwner = enemyQualifier || !explicitSelfTarget ? "ENEMY" : "SELF";
  if (/모든\s*(?:캐릭터|대상)/.test(text)) return { zone: "CHARACTER", owner: "ALL", selection: "ALL", count: targetCountFrom(text) };
  if (/(상대|적)\s*(?:캐릭터|대상)/.test(text)) return { zone: "CHARACTER", owner: "ENEMY", selection: "PLAYER_CHOICE", count: targetCountFrom(text) };
  if (/(아군|내)\s*(?:캐릭터|대상)/.test(text)) return { zone: "CHARACTER", owner: "SELF", selection: "PLAYER_CHOICE", count: targetCountFrom(text) };
  if (/(상대|적)\s*(챔피언|플레이어)/.test(text)) return { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 };
  if (/(?:내|자신의)\s*챔피언/.test(text)) return { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 };
  if (/선택한\s*(?:선수|대상)/.test(text)) {
    if (hand && /선택한\s*선수/.test(text)) {
      return {
        zone: "HAND",
        owner: enemyQualifier ? "ENEMY" : "SELF",
        cardType: "WRESTLER",
        selection: "PLAYER_CHOICE",
        count: 1,
      };
    }
    return {
      zone: /선택한\s*선수/.test(text) ? "BOARD" : "CHARACTER",
      owner: selectedOwner,
      ...( /선택한\s*선수/.test(text) ? { cardType: "WRESTLER" as const } : {}),
      selection: "PLAYER_CHOICE",
      count: 1,
    };
  }
  if (graveyard) {
    const graveyardFilter = targetFilterFor(text, availableTags);
    return {
      zone: "GRAVEYARD",
      owner: enemyQualifier ? "ENEMY" : "SELF",
      ...(/선수/.test(text) ? { cardType: "WRESTLER" as const } : {}),
      ...(graveyardFilter ? { filter: graveyardFilter } : {}),
      selection: /무작위|랜덤/.test(text) ? "RANDOM" : "PLAYER_CHOICE",
      count: targetCountFrom(text),
      ...(/무작위|랜덤/.test(text)
        ? { randomScope: /완전히\s*(?:무작위|랜덤)|완전\s*(?:무작위|랜덤)/.test(text) ? "FULL" as const : "STANDARD" as const }
        : {}),
    };
  }
  if (/대상/.test(text)) {
    return {
      zone: "CHARACTER",
      owner: enemyQualifier ? "ENEMY" : "SELF",
      selection: "PLAYER_CHOICE",
      count: targetCountFrom(text),
    };
  }
  const activeCardScope = ACTIVE_CARD_SCOPE_PATTERN.test(text);
  const deck = /덱/.test(text), enemy = /(적|상대)\s*선수/.test(text);
  const random = /(무작위|랜덤)/.test(text), all = /(모든|전부|모두)/.test(text);
  const cardType = /선수/.test(text)
    ? "WRESTLER" as const
    : /기술/.test(text)
      ? "TECHNIQUE" as const
      : undefined;
  const randomScope = /완전히\s*(?:무작위|랜덤)|완전\s*(?:무작위|랜덤)/.test(text)
    ? "FULL" as const
    : "STANDARD" as const;
  const randomTarget = random && !all;
  const adjacentEmptySlots = /양\s*옆\s*(?:의\s*)?빈\s*슬롯/.test(text);
  const summonEnd = text.search(/(?:소환|SUMMON)/i);
  const filterText = adjacentEmptySlots && summonEnd >= 0 ? text.slice(0, summonEnd) : text;
  const filter = targetFilterFor(filterText, availableTags);
  if (randomPool && adjacentEmptySlots && randomTarget) {
    return {
      zone: "BOARD",
      owner: "SELF",
      ...(cardType ? { cardType } : {}),
      ...(filter ? { filter } : {}),
      selection: "ADJACENT_EMPTY_SLOTS",
      count: 2,
      randomScope,
    };
  }
  if (/(자신|이\s*카드)/.test(text)) return { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 };
  if (activeCardScope) {
    if (randomTarget) {
      return {
        zones: [...DEFAULT_CARD_TARGET_SCOPE],
        owner: enemy ? "ENEMY" : "SELF",
        ...(cardType ? { cardType } : {}),
        ...(filter ? { filter } : {}),
        selection: "RANDOM",
        count: targetCountFrom(text),
        randomScope,
      };
    }
    if (/(?:선택|고르)/.test(text)) {
      return {
        zones: [...DEFAULT_CARD_TARGET_SCOPE],
        owner: enemy ? "ENEMY" : "SELF",
        ...(cardType ? { cardType } : {}),
        ...(filter ? { filter } : {}),
        selection: "PLAYER_CHOICE",
        count: targetCountFrom(text),
      };
    }
    return {
      zones: [...DEFAULT_CARD_TARGET_SCOPE],
      owner: enemy ? "ENEMY" : "SELF",
      ...(cardType ? { cardType } : {}),
       ...(filter ? { filter } : {}),
      selection: "ALL",
      count: 20,
    };
  }
  if (randomPool && randomTarget) {
    return {
      zones: [...DEFAULT_CARD_TARGET_SCOPE],
      owner: "SELF",
      ...(cardType ? { cardType } : {}),
       ...(filter ? { filter } : {}),
      selection: "RANDOM",
      count: targetCountFrom(text),
      randomScope,
    };
  }
  return {
    zone: topOfDeck || deck ? "DECK" : hand ? "HAND" : "BOARD",
    owner: enemy ? "ENEMY" : "SELF",
    ...(cardType ? { cardType } : {}),
    ...(filter ? { filter } : {}),
    selection: topOfDeck ? "TOP" : random ? "RANDOM" : all ? "ALL" : "PLAYER_CHOICE",
    count: all ? 20 : targetCountFrom(text),
    ...(randomTarget ? { randomScope } : {}),
  };
}

function targetFor(text: string, randomPool = false, availableTags: readonly string[] = []): Target {
  const target = baseTargetFor(text, randomPool, availableTags);
  const highest = /(?:가장|제일)\s*(높은|큰)|(?:높은|큰)\s*(?:비용|코스트|공격력|체력).*(?:하나|한\s*장)/.test(text);
  const lowest = /(?:가장|제일)\s*(낮은|작은)|(?:낮은|작은)\s*(?:비용|코스트|공격력|체력).*(?:하나|한\s*장)/.test(text);
  if (!highest && !lowest) return target;
  const stat = /(?:공격력|공격)/.test(text)
    ? "ATTACK" as const
    : /체력/.test(text)
      ? "HEALTH" as const
      : "COST" as const;
  return {
    ...target,
    selection: target.selection === "PLAYER_CHOICE" ? "TOP" as const : target.selection,
    sort: { stat, direction: highest ? "DESC" as const : "ASC" as const },
    take: 1,
  };
}
function keywordFor(text: string): Keyword | undefined {
  return aliases.keyword.find(([, pattern]) => pattern.test(text))?.[0];
}

function durationFor(text: string): EffectDuration | undefined {
  if (/이번\s*턴/.test(text)) return "THIS_TURN";
  if (/다음\s*턴\s*(?:까지|동안)/.test(text)) return "UNTIL_NEXT_TURN";
  if (/영구(?:적|적으로)?|계속(?:해서)?/.test(text)) return "PERMANENT";
  return undefined;
}

function genericStatName(value: string): StatName {
  return value === "비용" || value === "코스트" ? "COST" : value === "체력" ? "HEALTH" : "ATTACK";
}

function minimumCostFor(text: string): number | undefined {
  const match = text.match(/최소\s*(?:비용\s*(?:은|는|이|가|을|를)?\s*)?(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function genericStatEffects(
  trigger: Trigger,
  body: string,
  conditions: EffectCondition[],
  options: EffectAnalysisOptions = {},
): StructuredEffect[] {
  const duration = durationFor(body);
  const minimumCost = minimumCostFor(body);
  const target = targetFor(body, false, options.availableTags);
  const parsed: Array<{ index: number; effects: StructuredEffect[] }> = [];

  const setPair = STAT_PAIR_SET_PATTERN.exec(body);
  if (setPair?.index !== undefined) {
    parsed.push({
      index: setPair.index,
      effects: [
        { trigger, action: "SET_STAT", target, values: { stat: "ATTACK", amount: Number(setPair[1]), ...(duration ? { duration } : {}), ...(conditions.length ? { conditions } : {}) } },
        { trigger, action: "SET_STAT", target, values: { stat: "HEALTH", amount: Number(setPair[2]), ...(duration ? { duration } : {}), ...(conditions.length ? { conditions } : {}) } },
      ],
    });
  }

  for (const match of body.matchAll(STAT_SET_PATTERN)) {
    if (match.index === undefined) continue;
    parsed.push({
      index: match.index,
      effects: [{
        trigger,
        action: "SET_STAT",
        target,
        values: {
          stat: genericStatName(match[1]!),
          amount: Number(match[2]),
          ...(duration ? { duration } : {}),
          ...(conditions.length ? { conditions } : {}),
        },
      }],
    });
  }

  for (const match of body.matchAll(STAT_PAIR_INCREMENT_GENERIC_PATTERN)) {
    if (match.index === undefined) continue;
    parsed.push({
      index: match.index,
      effects: [
        { trigger, action: "MODIFY_STAT", target, values: { stat: "ATTACK", amount: Number(match[1]), ...(duration ? { duration } : {}), ...(conditions.length ? { conditions } : {}) } },
        { trigger, action: "MODIFY_STAT", target, values: { stat: "HEALTH", amount: Number(match[2]), ...(duration ? { duration } : {}), ...(conditions.length ? { conditions } : {}) } },
      ],
    });
  }

  for (const match of body.matchAll(STAT_INCREMENT_GENERIC_PATTERN)) {
    if (match.index === undefined) continue;
    if (/최소\s*$/.test(body.slice(Math.max(0, match.index - 4), match.index))) continue;
    const rawAmount = Number(match[2]);
    const nearbyText = body.slice(match.index, match.index + match[0].length + 12);
    const amount = /감소|낮/.test(nearbyText) ? -Math.abs(rawAmount) : rawAmount;
    parsed.push({
      index: match.index,
      effects: [{
        trigger,
        action: "MODIFY_STAT",
        target,
        values: {
          stat: genericStatName(match[1]!),
          amount,
          ...(genericStatName(match[1]!) === "COST" && minimumCost !== undefined ? { minimum: minimumCost } : {}),
          ...(duration ? { duration } : {}),
          ...(conditions.length ? { conditions } : {}),
        },
      }],
    });
  }

  return parsed
    .sort((left, right) => left.index - right.index)
    .flatMap((entry) => entry.effects);
}
const GENERIC_CARD_REFERENCE_WORDS = new Set([
  "카드", "선수", "선수카드", "기술", "기술카드", "캐릭터", "무작위", "랜덤", "무작위선수", "랜덤선수",
]);

function explicitCardReference(
  body: string,
  action: Action,
  catalog: readonly CardReferenceCandidate[] | undefined,
): { card?: ReferencedCard; name?: string; error?: CardReferenceError } {
  if (!catalog && action !== "SUMMON") return {};
  const verb = action === "SUMMON" ? /(?:소환|SUMMON)/i : /(?:생성(?!된)|GENERATE)/i;
  const verbMatch = verb.exec(body);
  if (!verbMatch || verbMatch.index === undefined) return {};
  const beforeVerb = body.slice(0, verbMatch.index);
  const quoted = beforeVerb.match(/['‘’“”「」]([^'‘’“”「」]+)['‘’“”「」]/);
  const unquoted = beforeVerb
    .replace(/.*(?:그리고|그\s*후|이후|한\s*뒤)\s*/g, "")
    .replace(/(?:내|아군|상대|적|필드|보드|손패|손|덱)\s*(?:의|에|에 있는|에 있는)?\s*/g, "")
    .replace(/(?:완전히\s*)?(?:무작위|랜덤)(?:한|로)?\s*/g, "")
    .replace(/\d+\s*장\s*$/, "")
    .replace(/\s*(?:복사본|사본)\s*$/, "")
    .replace(/\s*(?:카드|선수|기술|캐릭터)\s*$/, "")
    .replace(/\s*[을를이가은는의]\s*$/, "")
    .trim();
  const requestedName = (quoted?.[1] ?? unquoted).trim();
  const known = catalog
    ?.filter((candidate) => candidate.name === requestedName)
    .filter((candidate, index, all) => all.findIndex((item) => item.id === candidate.id) === index) ?? [];
  if (known.length > 1) {
    return {
      name: requestedName || known[0]!.name,
      error: { code: "CARD_REFERENCE_AMBIGUOUS", name: requestedName || known[0]!.name, candidateIds: known.map((candidate) => candidate.id) },
    };
  }
  if (known.length === 1) return { card: known[0] };
  if (!catalog) return quoted?.[1]?.trim() ? { name: quoted[1].trim() } : {};

  const name = requestedName;
  if (!name || GENERIC_CARD_REFERENCE_WORDS.has(name.replace(/\s+/g, ""))) return {};
  return { name, error: { code: "CARD_REFERENCE_NOT_FOUND", name } };
}

function effect(
  trigger: Trigger,
  action: Action,
  body: string,
  index: number,
  priorTarget?: Target,
  conditions?: EffectCondition[],
  options: EffectAnalysisOptions = {},
  referencedCards: ReferencedCard[] = [],
  referenceErrors: CardReferenceError[] = [],
): StructuredEffect | null {
  const schema = ACTION_SCHEMAS[action], values: StructuredEffect["values"] = {};
  const targetBody = action === "DESTROY"
    ? body.split(/이\s*카드는/)[0] ?? body
    : body;
  if (action === "DEPLOY_CHAMPION_TOKEN") {
    return { trigger, action, ...(conditions?.length ? { conditions } : {}) };
  }
  if (action === "ADD_AGGREGATED_ATTACK") {
    values.aggregateStats = {
      source: "LAST_DESTROYED_TARGETS",
      attack: "CURRENT_ATTACK_SUM",
      health: "CURRENT_HEALTH_SUM",
    };
    return {
      trigger,
      action,
      target: targetFor(body, false, options.availableTags),
      ...(conditions?.length ? { conditions } : {}),
      values,
    };
  }
  if (action === "QUEUE_EFFECT") {
    const match = body.match(NEXT_PLAY_HEALTH_BUFF_PATTERN);
    if (!match) return null;
    values.queuedTrigger = "NEXT_ALLY_WRESTLER_PLAYED";
    values.queuedEffect = {
      action: "BUFF",
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
      values: { attack: 0, health: Number(match[1]) },
    };
    return { trigger, action, ...(conditions?.length ? { conditions } : {}), values };
  }
  const cardReference = action === "SUMMON" || action === "GENERATE"
    ? explicitCardReference(body, action, options.cardCatalog)
    : {};
  if (cardReference.card) {
    values.definitionRef = { id: cardReference.card.id };
    if (!referencedCards.some((candidate) => candidate.id === cardReference.card!.id)) referencedCards.push(cardReference.card);
  } else if (cardReference.error) {
    referenceErrors.push(cardReference.error);
    return null;
  } else if (cardReference.name && !options.cardCatalog) {
    values.definitionRef = { name: cardReference.name };
  }
  if (action === "SUMMON" && AGGREGATED_STATS_PATTERN.test(body)) {
    values.aggregateStats = {
      source: "LAST_DESTROYED_TARGETS",
      attack: "CURRENT_ATTACK_SUM",
      health: "CURRENT_HEALTH_SUM",
    };
    const definitionName = body.match(/['‘’“”]([^'‘’“”]+)['‘’“”]/)?.[1]?.trim();
    if (definitionName && !values.definitionRef && !options.cardCatalog) values.definitionRef = { name: definitionName };
  }
  if (action === "GENERATE") values.destination = /덱/.test(body) ? "DECK" : "HAND";
  if ((action === "SUMMON" || action === "GENERATE") && cardReference.card) values.count = targetCountFrom(body);
  if (action === "SUMMON" || action === "GENERATE") {
    const statPair = body.match(/(\d+)\s*\/\s*(\d+)/);
    if (statPair) {
      values.generatedModifiers = {
        attack: Number(statPair[1]),
        health: Number(statPair[2]),
      };
    }
  }
  const statMultiplier = schema.statMultiplier ? body.match(STAT_MULTIPLIER_PATTERN) : null;
   const statPairIncrement = schema.stats ? body.match(STAT_PAIR_INCREMENT_PATTERN) : null;
   const singleStatIncrement = schema.stats ? body.match(SINGLE_STAT_INCREMENT_PATTERN) : null;
  const referenceStat = schema.referenceStat ? body.match(REFERENCE_ATTACK_INCREMENT_PATTERN) : null;
  if (schema.statMultiplier && statMultiplier) {
    const multiplier = Number(statMultiplier[1]);
    if (!Number.isFinite(multiplier)) return null;
    values.attackMultiplier = multiplier;
    values.healthMultiplier = multiplier;
  }
  if (referenceStat) {
    values.reference = "LAST_ATTACKER";
    values.referenceStat = "CURRENT_ATTACK";
  }
  if (schema.amount) {
    const amountText = (action === "DAMAGE" || action === "ADD_DAMAGE_MODIFIER")
      ? (body.match(/(?:피해|데미지)(?:을|를|이|가)?\s*\d+(?!\s*(?:증가|추가))/)?.[0]?.match(/\d+/)?.[0] ?? body.match(/(\d+)\s*(?:추가\s*)?(?:피해|데미지)/)?.[1])
      : action === "DRAW"
        ? (body.match(/(?:카드\s*)?(\d+)\s*장|(\d+)\s*드로우/)?.[1] ?? body.match(/(?:카드\s*)?(\d+)\s*장|(\d+)\s*드로우/)?.[2])
        : ["REDUCE_COST", "INCREASE_COST"].includes(action)
          ? body.match(/(?:비용|코스트)(?:을|를)?\s*(?:[+-]?(\d+)|(\d+)\s*(?:감소|증가|낮))/)?.[1] ?? body.match(/(?:비용|코스트)(?:을|를)?\s*(?:[+-]?(\d+)|(\d+)\s*(?:감소|증가|낮))/)?.[2]
          : undefined;
    values.amount = amountText ? Number(amountText) : numberFrom(body);
  }
  if (action === "ADD_DAMAGE_MODIFIER") {
    values.damageSource = /생성된/.test(body) ? "GENERATED" : "ALL";
  }
  if (schema.stats && !statMultiplier && !referenceStat) {
    if (action === "SET_STATS" && SET_ATTACK_ZERO_PATTERN.test(body)) {
      values.attack = 0;
      return {
        trigger,
        action,
        target: targetFor(body, false, options.availableTags),
        ...(conditions?.length ? { conditions } : {}),
        values,
      };
    }
    const pair = body.match(/([+-]\d+)\s*\/\s*([+-]\d+)/);
    const singleStat = body.match(/(공격력|체력)\s*([+-]\d+)/);
     if (!pair && !singleStat && !statPairIncrement && !singleStatIncrement) return null;
    values.attack = pair
      ? Number(pair[1])
      : singleStat
        ? singleStat[1] === "공격력" ? Number(singleStat[2]) : 0
         : statPairIncrement
           ? Number(statPairIncrement[1])
           : singleStatIncrement
             ? singleStatIncrement[1] === "공격력" ? Number(singleStatIncrement[2]) : 0
             : 0;
    values.health = pair
      ? Number(pair[2])
      : singleStat
        ? singleStat[1] === "체력" ? Number(singleStat[2]) : 0
         : statPairIncrement
           ? Number(statPairIncrement[1])
           : singleStatIncrement
             ? singleStatIncrement[1] === "체력" ? Number(singleStatIncrement[2]) : 0
             : 0;
  }
  if (schema.keyword) { const keyword = keywordFor(body); if (!keyword) return null; values.keyword = keyword; }
  const explicitTarget = /(선택한\s*(?:선수|대상)|자신|이\s*카드(?!는)|모든\s*캐릭터|모든\s*(?:생성된\s*)?선수|(?:적|상대)\s*(?:선수|챔피언|플레이어|캐릭터)|(?:아군|내)\s*캐릭터|손(?:패)?|생성된|바닐라|무능력|효과가\s*없는|능력이\s*없는|어디에\s*(?:있든|있는)|모든\s*위치의|손패\s*[,，]\s*덱\s*[,，]\s*(?:필드|보드))/.test(targetBody);
  const sameSummonedTarget = action === "ADD_KEYWORD" && /소환한\s*['‘’“”]?[^'‘’“”\s]+['‘’“”]?\s*에게/.test(body);
  const randomPoolAction = action === "SUMMON" || action === "GENERATE";
  const resolvedTarget = sameSummonedTarget
    ? { zone: "BOARD" as const, owner: "SELF" as const, selection: "SAME_TARGET" as const, count: 1 }
    : (schema.target || (randomPoolAction && /(무작위|랜덤)/.test(body)))
       ? (!explicitTarget && priorTarget ? { ...priorTarget, selection: "SAME_TARGET" as const } : targetFor(targetBody, randomPoolAction, options.availableTags))
      : undefined;
  return {
    trigger,
    action,
    ...(resolvedTarget ? { target: resolvedTarget } : {}),
    ...(conditions?.length ? { conditions } : {}),
    ...(Object.keys(values).length ? { values } : {}),
  };
}

function expandedMechanicAnalysis(
  text: string,
  options: EffectAnalysisOptions,
): Analysis | null {
  const triggerFor = (fallback: Trigger = "ENTER_FIELD"): Trigger =>
    /(?:이\s*카드가|자신이)\s*공격할\s*때마다|공격할\s*때마다/.test(text) ? "SELF_ATTACK"
      : /(?:처음으로\s*)?공격한/.test(text) ? "FIRST_ATTACKED"
      : /^턴\s*시작/.test(text) ? "TURN_START"
        : /^(?:퇴장|리타이어)|^이\s*카드가\s*(?:퇴장|리타이어)/.test(text) ? "SELF_RETIRE"
          : /나오면|나오거나|나올\s*때/.test(text) ? "ENTER_FIELD"
            : options.defaultTrigger ?? fallback;
  const tagScopeBuff = (): Analysis | null => {
    const tagFilter = tagFilterFor(text, options.availableTags);
    const hasTagLanguage = hasTagPredicateLanguage(text, options.availableTags) || Boolean(tagFilter);
    const hasAnywhere = ACTIVE_CARD_SCOPE_PATTERN.test(text) || /어디\s*있든|손패\s*덱\s*필드/.test(text);
    const pair = text.match(/([+-]?\d+)\s*\/\s*([+-]?\d+)/);
    const compactPair = text.match(/공체\s*([+-]?\d+)/);
    const namedPair = text.match(/공격(?:력)?[^.!?]*?([+-]?\d+)[^.!?]*체력[^.!?]*?([+-]?\d+)/);
    const singleHealth = text.match(/체력[^.!?]*?([+-]?\d+)/);
    const singleAttack = text.match(/공격(?:력)?[^.!?]*?([+-]?\d+)/);
    const amount = compactPair ? Number(compactPair[1]) : pair ? Number(pair[1]) : namedPair ? Number(namedPair[1]) : singleHealth ? 0 : singleAttack ? Number(singleAttack[1]) : undefined;
    const health = compactPair ? Number(compactPair[1]) : pair ? Number(pair[2]) : namedPair ? Number(namedPair[2]) : singleHealth ? Number(singleHealth[1]) : singleAttack ? 0 : undefined;
    const parsedTarget = targetFor(text, false, options.availableTags);
    if (/(?:카드|선수)들이?.*(?:등장|소환|될)\s*때/.test(text)) return null;
    if (!tagFilter || !hasTagLanguage ||
        amount === undefined || health === undefined ||
        !/(?:\+?\d+\s*\/\s*\+?\d+|공체|공격(?:력)?|체력)/.test(text) ||
        (!/등장|출현|나오면|나오거나|나올\s*때|ENTER_FIELD/i.test(text) && !options.defaultTrigger)) return null;
    const unsupportedResidual = /(?:파괴|생성|이동|피해|데미지|기절|도발|뽑|드로우|DRAW)/i.test(text) ||
      (/(?:소환|SUMMON)/i.test(text) && !/(?:소환|SUMMON).*?(?:될|할)\s*때/i.test(text));
    if (tagFilter && unsupportedResidual) {
      return {
        status: "failure",
        outcome: "analysis_failure",
        effects: [],
        keywords: [],
        unsupportedSegments: [text],
        summaries: [],
        reason: "태그 버프 문장에 지원되지 않는 추가 효과가 포함되어 있습니다.",
      };
    }
    const owner = /(?:상대|적)/.test(text) ? "ENEMY" as const : "SELF" as const;
    const cardType = /선수/.test(text) ? "WRESTLER" as const : undefined;
    const mergedFilter = { ...(parsedTarget.filter ?? {}), ...tagFilter };
    const target = {
      ...parsedTarget,
      owner,
      ...(cardType ? { cardType } : {}),
      filter: mergedFilter,
      ...(hasAnywhere && !/(?:선택|고르|무작위|랜덤)/.test(text) ? { selection: "ALL" as const, count: 20 } : {}),
    };
    return {
      status: "success",
      outcome: "supported",
      effects: [{
        trigger: triggerFor(),
        action: "BUFF",
        target,
        values: { attack: amount, health },
      }],
      keywords: [],
      unsupportedSegments: [],
      summaries: ["태그 필터 · BUFF"],
    };
  };
  const self = { zone: "BOARD" as const, owner: "SELF" as const, selection: "SELF" as const, count: 1 };
  const wrestlerSelf = { ...self, cardType: "WRESTLER" as const };
  const referenceErrors: CardReferenceError[] = [];
  const referencedCards = new Map<string, ReferencedCard>();
  const result = (effects: StructuredEffect[]): Analysis => referenceErrors.length
    ? {
        status: "failure",
        outcome: "analysis_failure",
        effects: [],
        keywords: [],
        unsupportedSegments: [text],
        summaries: ["카드 참조를 정확히 확인할 수 없습니다."],
        reason: "참조 카드 정의가 없거나 이름이 중복되어 정확한 CardDefinition을 선택할 수 없습니다.",
        referenceErrors,
      }
    : {
        status: "success",
        outcome: "supported",
        effects,
        keywords: [],
        unsupportedSegments: [],
        summaries: effects.map((item) => `${item.trigger} · ${item.action}`),
        ...(referencedCards.size ? { referencedCards: [...referencedCards.values()] } : {}),
      };
  const genericTagBuff = tagScopeBuff();
  if (genericTagBuff) return genericTagBuff;
  const makeRef = (name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return { name: normalizedName };
    if (!options.cardCatalog) {
      referenceErrors.push({ code: "CARD_REFERENCE_NOT_FOUND", name: normalizedName });
      return { name: normalizedName };
    }
    const matches = options.cardCatalog
      .filter((candidate) => candidate.name === normalizedName)
      .filter((candidate, index, all) => all.findIndex((item) => item.id === candidate.id) === index);
    if (matches.length !== 1) {
      referenceErrors.push(matches.length > 1
        ? {
            code: "CARD_REFERENCE_AMBIGUOUS",
            name: normalizedName,
            candidateIds: matches.map((candidate) => candidate.id).sort(),
          }
        : { code: "CARD_REFERENCE_NOT_FOUND", name: normalizedName });
      return { name: normalizedName };
    }
    const [found] = matches;
    if (found) referencedCards.set(found.id, found);
    return found ? { id: found.id } : { name: normalizedName };
  };

  if (/상대\s*선수\s*카드\s*1\s*장(?:을|를)?\s*선택[^.!?]*공격력(?:을|이)?\s*1\s*로\s*(?:줄이|낮추|감소시키|만들)[^.!?]*기절[^.!?]*공격력(?:을|이)?\s*(?:줄인|낮춘|감소한)\s*만큼[^.!?]*자신의?\s*체력(?:을|이)?\s*증가/.test(text)) {
    const target = {
      zone: "BOARD" as const,
      owner: "ENEMY" as const,
      cardType: "WRESTLER" as const,
    };
    const script: EffectScript = {
      version: "SCRIPT_V1",
      trigger: triggerFor(),
      steps: [
        {
          type: "SELECT",
          id: "target",
          target: { ...target, selection: "PLAYER_CHOICE", count: 1 },
        },
        { type: "AGGREGATE", id: "attackBefore", selectionId: "target", operation: "MAX", stat: "ATTACK" },
        {
          type: "IF",
          condition: {
            left: { kind: "RESULT_VALUE", resultId: "attackBefore" },
            compare: "GT",
            right: { kind: "CONSTANT", value: 1 },
          },
          then: [
            {
              type: "EFFECT",
              effect: {
                action: "SET_STAT",
                target: { ...target, resultId: "target" },
                values: { stat: "ATTACK", amount: 1 },
              },
            },
            {
              type: "EFFECT",
              effect: {
                action: "BUFF",
                target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", selection: "SELF", count: 1 },
                values: {
                  healthExpression: { kind: "RESULT_VALUE", resultId: "attackBefore", offset: -1 },
                },
              },
            },
          ],
        },
        {
          type: "EFFECT",
          effect: {
            action: "STUN",
            target: { ...target, resultId: "target" },
          },
        },
      ],
    };
    return {
      status: "success",
      outcome: "supported",
      effects: [],
      scripts: [script],
      keywords: [],
      unsupportedSegments: [],
      summaries: [`${script.trigger} · SCRIPT_V1`],
    };
  }

  if (/자신을\s*제외한.*아군\s*선수(?:들)?에게\s*\+?2\s*\/\s*\+?2/.test(text)) {
    return result([{
      trigger: triggerFor(),
      action: "BUFF",
      target: {
        zone: "BOARD",
        owner: "SELF",
        cardType: "WRESTLER",
        filter: { excludeSource: true },
        selection: "ALL",
        count: 20,
      },
      values: { attack: 2, health: 2 },
    }]);
  }

  if (/^게임\s*시작\s*[:：].*덱에\s*있었(?:다면|을\s*경우).*손패에\s*드로우/.test(text)) {
    return result([{
      trigger: "GAME_START",
      action: "MOVE_TO_HAND",
      target: { zone: "DECK", owner: "SELF", selection: "SELF", count: 1 },
    }]);
  }

  if (/이\s*카드가\s*필드에\s*있는\s*동안.*태그.*카드들이.*(?:등장.*소환|소환.*등장).*(?:될\s*때|할\s*때|때).*\+1\/\+1/.test(text)) {
    const tags = tagNamesBeforeMarker(text, options.availableTags);
    if (!tags.length) return null;
    return result([{
      trigger: "CARD_ENTERED",
      action: "BUFF",
      target: {
        zone: "BOARD",
        owner: "SELF",
        cardType: "WRESTLER",
        filter: { tagsAny: tags },
        selection: "SAME_TARGET",
        count: 1,
      },
      values: { attack: 1, health: 1 },
    }]);
  }

  if (/이\s*카드가\s*필드에\s*있을\s*때.*아군의?\s*턴\s*종료\s*효과가?\s*한\s*번\s*더\s*발동/.test(text)) {
    return result([{ trigger: "TURN_END", action: "REPEAT_TURN_END" }]);
  }

  if (/필드에\s*있는.*좀비.*가장.*합이\s*높은.*좀비.*체력과\s*공격력을\s*자신에게\s*더(?:합니다)?.*좀비.*없다면\s*2\s*\/\s*2.*좀비.*생성.*좀비.*체력과\s*공격력을\s*자신에게\s*더(?:합니다)?/.test(text)) {
    const cardReference = explicitCardReference("'좀비' 생성", "GENERATE", options.cardCatalog);
    if (cardReference.error) {
      return {
        status: "failure",
        outcome: "analysis_failure",
        effects: [],
        keywords: [],
        unsupportedSegments: [`카드 참조를 확인할 수 없습니다: ${cardReference.error.name}`],
        summaries: [],
        referenceErrors: [cardReference.error],
      };
    }
    if (!cardReference.card || cardReference.card.cardType !== "WRESTLER") {
      return {
        status: "failure",
        outcome: "analysis_failure",
        effects: [],
        keywords: [],
        unsupportedSegments: ["카드 카탈로그에서 '좀비' 선수 정의를 하나로 확인할 수 없습니다."],
        summaries: [],
        reason: "실행 가능한 카드 참조를 위해 정확히 하나의 WRESTLER CardDefinition이 필요합니다.",
      };
    }
    const zombie = cardReference.card;
    const zombieReference = { id: zombie.id };
    const script: EffectScript = {
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [
        {
          type: "SELECT",
          id: "fieldZombies",
          target: {
            zone: "BOARD",
            owner: "SELF",
            cardType: "WRESTLER",
            filter: { definitionRef: zombieReference },
            selection: "ALL",
            count: 20,
          },
        },
        { type: "AGGREGATE", id: "zombieCount", selectionId: "fieldZombies", operation: "COUNT" },
        {
          type: "IF",
          condition: {
            left: { kind: "RESULT_VALUE", resultId: "zombieCount" },
            compare: "GT",
            right: { kind: "CONSTANT", value: 0 },
          },
          then: [{
            type: "EFFECT",
            effect: {
              action: "COPY_BEST_STATS",
              target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 20, resultId: "fieldZombies" },
            },
          }],
          else: [
            {
              type: "EFFECT",
              id: "generatedZombie",
              effect: {
                action: "GENERATE",
                values: { definitionRef: zombieReference, count: 1, destination: "HAND" },
              },
            },
            {
              type: "EFFECT",
              effect: {
                action: "SET_STATS",
                target: { zone: "HAND", owner: "SELF", selection: "ALL", count: 1, resultId: "generatedZombie" },
                values: { attack: 2, health: 2 },
              },
            },
            {
              type: "EFFECT",
              effect: {
                action: "COPY_BEST_STATS",
              target: { zone: "HAND", owner: "SELF", selection: "ALL", count: 1, resultId: "generatedZombie" },
              },
            },
          ],
        },
      ],
    };
    return {
      status: "success",
      outcome: "supported",
      effects: [],
      scripts: [script],
      keywords: [],
      unsupportedSegments: [],
      summaries: ["ENTER_FIELD · SCRIPT_V1"],
      referencedCards: [zombie],
    };
  }

  const currentStatSelf = { zones: ["HAND", "BOARD"] as Array<"HAND" | "BOARD">, owner: "SELF" as const, selection: "SELF" as const, count: 1 };

  if (/내\s*덱과\s*손(?:패)?에\s*있는.*(?:6\s*(?:코스트|비용)|6\s*비용)\s*이상의.*(?:비용|코스트).*전부.*1.*감소/.test(text)) {
    return result([{
      trigger: "ENTER_FIELD",
      action: "REDUCE_COST",
      target: {
        zones: ["HAND", "DECK"],
        owner: "SELF",
        filter: { minCost: 6 },
        selection: "ALL",
        count: 20,
      },
      values: { amount: 1 },
    }]);
  }

  if (/태그가?\s*(?:달려|있는|붙어|붙은|가진)|속성\s*태그/.test(text) &&
      /어디에\s*(?:있든|있는)/.test(text) &&
      /(?:체력|HP).*(?:\+?1|1\s*(?:증가|부여|올라))/.test(text) &&
      !/(?:공격력|공격).*(?:\+?1|1\s*(?:증가|부여|올라))/.test(text)) {
    const tags = tagNamesBeforeMarker(text, options.availableTags);
    if (!tags.length) return null;
    return result([{
      trigger: "ENTER_FIELD",
      action: "BUFF",
      target: {
        zones: [...DEFAULT_CARD_TARGET_SCOPE],
        owner: "SELF",
        filter: { tagsAny: tags },
        selection: "ALL",
        count: 20,
      },
      values: { attack: 0, health: 1 },
    }]);
  }

  if (/(?:상대|적)\s*필드.*(?:비용|코스트).*1\s*(?:이하|미만).*선수.*(?:무작위|랜덤).*리타이어/.test(text)) {
    return result([{
      trigger: "ENTER_FIELD",
      action: "RETIRE",
      target: {
        zone: "BOARD",
        owner: "ENEMY",
        cardType: "WRESTLER",
        filter: { maxCost: 1, isChampionToken: false },
        selection: "RANDOM",
        count: 1,
        randomScope: "STANDARD",
      },
    }]);
  }

  if (/(?:상대|적)의?\s*필드에\s*있는\s*선수\s*카드\s*한\s*장.*(?:덱\s*맨\s*위|덱\s*위).*(?:보내|보냅)/.test(text)) {
    return result([{
      trigger: "ENTER_FIELD",
      action: "MOVE_TO_DECK",
      target: {
        zone: "BOARD",
        owner: "ENEMY",
        cardType: "WRESTLER",
        selection: "PLAYER_CHOICE",
        count: 1,
      },
      values: { deckPosition: "TOP" },
    }]);
  }

  if (/손(?:패)?에\s*무작위\s*선수\s*카드\s*1장.*생성/.test(text) &&
      /-?1\s*\/\s*-?1\s*\/\s*-?1/.test(text)) {
    return result([{
      trigger: "ENTER_FIELD",
      action: "GENERATE",
      target: {
        zone: "HAND",
        owner: "SELF",
        cardType: "WRESTLER",
        selection: "RANDOM",
        count: 1,
        randomScope: "STANDARD",
      },
      values: {
        destination: "HAND",
        generatedModifiers: { cost: -1, attack: -1, health: -1 },
      },
    }]);
  }

  if (/(?:적|상대)\s*선수를\s*공격하고\s*생존|공격하고\s*생존/.test(text) &&
      /비용.*1.*감소/.test(text) && /손(?:패)?로\s*돌아/.test(text)) {
    return result([
      {
        trigger: "ATTACK_SURVIVED",
        action: "REDUCE_COST",
        target: self,
        values: { amount: 1, ...(minimumCostFor(text) !== undefined ? { minimum: minimumCostFor(text) } : {}) },
      },
      {
        trigger: "ATTACK_SURVIVED",
        action: "MOVE_TO_HAND",
        target: self,
      },
    ]);
  }

  if (/(?:체력|HP).*(?:증가|늘어나|올라|상승)/.test(text) && /추가로\s*(?:[+]?1|1\s*(?:증가|상승|늘어))/.test(text)) {
    return result([{
      trigger: "STAT_CHANGED",
      action: "BUFF",
      target: currentStatSelf,
      values: { attack: 0, health: 1 },
    }]);
  }

  if (/(?:실제\s*)?(?:피해|데미지).*(?:입으면|받으면|받을\s*때)/.test(text) && /(?:소환|생성)/.test(text)) {
    const ref = makeRef(text.match(/['‘’“”]([^'‘’“”]+)['‘’“”]/)?.[1]?.trim() ?? "");
    const stats = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (ref.name || ref.id) {
      return result([{
        trigger: "SELF_DAMAGED",
        action: "SUMMON",
        values: {
          definitionRef: ref,
          count: 1,
          generatedModifiers: stats ? { attack: Number(stats[1]), health: Number(stats[2]) } : undefined,
        },
      }]);
    }
  }

  if (/(?:리타이어|퇴장).*(?:선택한\s*)?아군.*(?:흡수|얻)/.test(text) && /체력.*공격력|공격력.*체력/.test(text)) {
    return result([
      { trigger: triggerFor(), action: "RETIRE", target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 }, values: { captureStats: true } as never },
      { trigger: triggerFor(), action: "BUFF", target: self, values: { attack: 0, health: 0, reference: "LAST_TARGET", referenceStat: "CURRENT_ATTACK" } },
      { trigger: triggerFor(), action: "BUFF", target: self, values: { attack: 0, health: 0, reference: "LAST_TARGET", referenceStat: "CURRENT_HEALTH" } },
    ]);
  }

  if (/선택한\s*아군.*(?:리타이어|퇴장).*(?:체력.*공격력|공격력.*체력).*(?:흡수|얻)/.test(text)) {
    return result([
      { trigger: triggerFor(), action: "RETIRE", target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 }, values: { captureStats: true } as never },
      { trigger: triggerFor(), action: "BUFF", target: self, values: { attack: 0, health: 0, reference: "LAST_TARGET", referenceStat: "CURRENT_ATTACK" } },
      { trigger: triggerFor(), action: "BUFF", target: self, values: { attack: 0, health: 0, reference: "LAST_TARGET", referenceStat: "CURRENT_HEALTH" } },
    ]);
  }

  if (/태그.*(?:어디에\s*(?:있든|있는)).*(?:최대\s*)?체력\s*\+?\s*2/.test(text)) {
    const tags = tagNamesBeforeMarker(text, options.availableTags);
    if (!tags.length) return null;
    return result([{
      trigger: triggerFor(),
      action: "MODIFY_MAX_HEALTH",
      target: { zones: [...DEFAULT_CARD_TARGET_SCOPE], owner: "SELF", filter: { tagsAny: tags }, selection: "ALL", count: 20 },
      values: { amount: 2 },
    }]);
  }

  if (/(?:무능력|효과가\s*없는|능력이\s*없는).*?(?:무작위|랜덤).*?(?:텍스트|능력|효과)/.test(text)) {
    return result([{
      trigger: triggerFor(),
      action: "GRANT_RANDOM_CARD_TEXT",
      target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", filter: { isVanilla: true }, selection: "PLAYER_CHOICE", count: 1 },
    }]);
  }

  if (/태그가?\s*(?:달려|있는|붙어|가진)|속성\s*태그/.test(text) && /어디에\s*(?:있든|있는)/.test(text) && /[+]1\s*\/\s*[+]1/.test(text)) {
    const tags = tagNamesBeforeMarker(text, options.availableTags);
    if (!tags.length) return null;
    return result([{
      trigger: triggerFor(),
      action: "BUFF",
      target: { zones: [...DEFAULT_CARD_TARGET_SCOPE], owner: "SELF", filter: { tagsAny: tags }, selection: "ALL", count: 20 },
      values: { attack: 1, health: 1 },
    }]);
  }

  if (/(?:필드에\s*)?['‘’“”]([^'‘’“”]+)['‘’“”].*(?:수치의\s*합|공격력.*체력).*(?:높|큰)/.test(text) && /자신의\s*(?:체력과\s*공격력|공격력과\s*체력)/.test(text)) {
    const name = text.match(/['‘’“”]([^'‘’“”]+)['‘’“”]/)?.[1]?.trim() ?? "";
    return result([{
      trigger: triggerFor(),
      action: "COPY_BEST_STATS",
      target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", filter: { definitionRef: makeRef(name) }, selection: "ALL", count: 20 },
    }]);
  }

  if (/선택한\s*(?:선수|대상).*?(?:피해|데미지).*(?:변신|바뀌)/.test(text) && /(?:이\s*효과|이\s*피해).*(?:리타이어|퇴장)/.test(text)) {
    const quotedForm = text.match(/['‘’“”]([^'‘’“”]+)['‘’“”]\s*(판도라)?\s*(?:로)?\s*변신/);
    const name = quotedForm
      ? `${quotedForm[1]}${quotedForm[2] ? ` ${quotedForm[2]}` : ""}`.trim()
      : text.match(/['‘’“”]([^'‘’“”]+)['‘’“”]/)?.[1]?.trim() ?? "";
    return result([
      { trigger: triggerFor(), action: "DAMAGE", target: { zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 }, values: { amount: numberFrom(text) } },
      { trigger: triggerFor(), action: "TRANSFORM_SOURCE", values: { definitionRef: makeRef(name), causal: "DAMAGE_CAUSED_TARGET_RETIRE" } },
    ]);
  }

  if (/공격력이\s*(?:증가|올라|상승).*(?:그와|같은)\s*수치.*체력/.test(text)) {
    return result([{
      trigger: "STAT_CHANGED",
      action: "BUFF",
      target: self,
      values: { attack: 0, health: 0, amountReference: "LAST_ATTACK_DELTA" },
    }]);
  }
  if (/공격력이\s*(?:증가|올라|상승).*(?:추가로|더).*(?:\+?1|1만큼)/.test(text)) {
    return result([{
      trigger: "STAT_CHANGED",
      action: "BUFF",
      target: self,
      values: { attack: 1, health: 0 },
    }]);
  }
  if (/(?:적|상대)\s*선수를\s*공격.*생존|공격하고\s*생존/.test(text) && /회피/.test(text)) {
    return result([{
      trigger: "ATTACK_SURVIVED",
      action: "ADD_KEYWORD",
      target: self,
      values: { keyword: "DODGE" },
    }]);
  }
  if (/(?:처음으로\s*)?공격력이\s*처음\s*(?:증가|올라|상승)|처음으로\s*공격력이\s*(?:증가|올라|상승)/.test(text) && /회피/.test(text)) {
    const zone = /손패/.test(text) ? "HAND" as const : /필드|보드/.test(text) ? "BOARD" as const : null;
    if (!zone) {
      return {
        status: "failure",
        outcome: "analysis_failure",
        effects: [],
        keywords: [],
        unsupportedSegments: [text],
        summaries: ["발동 위치가 명시되지 않아 대상 영역을 확정할 수 없습니다."],
        reason: "최초 공격력 증가 효과의 HAND/BOARD 범위를 원문만으로 판단할 수 없습니다.",
      };
    }
    return result([{
      trigger: "STAT_CHANGED",
      action: "ADD_KEYWORD",
      target: { zone, owner: "SELF", selection: "SELF", count: 1 },
      conditions: [{ type: "FIRST_ATTACK_GAIN" }],
      values: { keyword: "DODGE" },
    }]);
  }
  if (/(?:무덤|묘지).*?(?:부활|소생|되살)/.test(text) && /선수/.test(text)) {
    const effects: StructuredEffect[] = [{
      trigger: triggerFor(),
      action: "REVIVE",
      target: targetFor(text, false, options.availableTags),
    }];
    if (/(?:그\s*카드|부활(?:시킨|한)\s*선수)[^.!?]*도발/.test(text)) {
      effects.push({
        trigger: triggerFor(),
        action: "ADD_KEYWORD",
        target: { zone: "BOARD", owner: "SELF", selection: "SAME_TARGET", count: 1 },
        values: { keyword: "TAUNT" },
      });
    }
    return result(effects);
  }
  if (/어디에\s*있든.*생성된.*아군\s*선수/.test(text) && /각각\s*1씩/.test(text)) {
    return result([{ trigger: triggerFor(), action: "BUFF", target: { zones: ["HAND", "DECK", "BOARD"], owner: "SELF", cardType: "WRESTLER", filter: { isGenerated: true }, selection: "ALL", count: 20 }, values: { attack: 1, health: 1 } }]);
  }
  const nextPlayHealthMatch = text.match(NEXT_PLAY_HEALTH_BUFF_PATTERN);
  if (nextPlayHealthMatch) {
    return result([{ trigger: triggerFor(), action: "QUEUE_EFFECT", values: { queuedTrigger: "NEXT_ALLY_WRESTLER_PLAYED", queuedEffect: { action: "BUFF", target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 }, values: { attack: 0, health: Number(nextPlayHealthMatch[1]) } } } }]);
  }
  if (/(?:자신의\s*)?(?:무덤|묘지).*선수.*수\s*만큼.*공격력과\s*체력/.test(text)) {
    return result([{ trigger: triggerFor(), action: "BUFF", target: wrestlerSelf, values: { amountReference: "GRAVEYARD_WRESTLER_COUNT" } }]);
  }
  if (/처음으로\s*공격한\s*적\s*선수/.test(text) && /침묵/.test(text) && /능력.*비활성화/.test(text)) {
    return result([
      { trigger: "FIRST_ATTACKED", action: "SILENCE", target: { zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER", selection: "SAME_TARGET", count: 1 } },
      { trigger: "FIRST_ATTACKED", action: "DISABLE_ABILITY", target: self },
    ]);
  }
  if (/현재\s*내\s*손패에\s*있는\s*카드\s*수만큼/.test(text)) {
    return result([{ trigger: triggerFor(), action: "BUFF", target: self, values: { amountReference: "HAND_COUNT" } }]);
  }
  if (/필드에\s*있는\s*아군\s*선수\s*하나를\s*선택하여\s*손으로\s*되돌/.test(text) && /비용.*이번\s*턴.*1.*감소/.test(text)) {
    return result([{
      trigger: triggerFor(),
      action: "MOVE_TO_HAND",
      target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 },
      values: { amount: 1, minimum: 1, temporaryCost: true },
    }]);
  }
  if (/손패에\s*있을\s*때.*아군\s*선수가\s*리타이어/.test(text)) {
    return result([{ trigger: "CARD_RETIRED", action: "REDUCE_COST", target: { zone: "HAND", owner: "SELF", selection: "SELF", count: 1 }, values: { amount: 1, minimum: 1 } }]);
  }
  if (/덱\s*(?:맨\s*)?위.*카드.*파괴/.test(text) && /챔피언\s*토큰\s*제외/.test(text)) {
    return result([
      { trigger: triggerFor(), action: "MILL", target: { zone: "DECK", owner: "SELF", selection: "TOP", count: 1 } },
      { trigger: triggerFor(), action: "GENERATE", target: { zones: ["DECK"], owner: "SELF", selection: "RANDOM", count: 1, randomScope: "FULL", filter: { isChampionToken: false } }, values: { destination: "DECK", deckPosition: "TOP", generatedModifiers: { cost: -1, attack: -1, health: -1 } } },
    ]);
  }
  if (/턴\s*시작.*필드의\s*유일한\s*선수/.test(text) && /[+]1G/.test(text.replace(/\s/g, ""))) {
    return result([{ trigger: "TURN_START", action: "ADD_GOLD", conditions: [{ type: "SOURCE_IS_ONLY_WRESTLER" }], values: { amount: 1 } }]);
  }
  if (/손패의\s*무작위\s*선수\s*카드\s*3장/.test(text) && /3장\s*미만/.test(text)) {
    return result([{ trigger: triggerFor(), action: "BUFF", target: { zone: "HAND", owner: "SELF", cardType: "WRESTLER", selection: "RANDOM", count: 3, randomScope: "STANDARD" }, values: { attack: 1, health: 1 } }]);
  }
  if (/(?:묘지|무덤)에서\s*선수\s*1장/.test(text) && /패로\s*되돌/.test(text)) {
    return result([{ trigger: triggerFor(), action: "MOVE_TO_HAND", target: { zone: "GRAVEYARD", owner: "SELF", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 } }]);
  }
  if (/덱\s*위\s*카드\s*3장.*무덤으로/.test(text)) {
    return result([
      { trigger: triggerFor(), action: "MILL", target: { zone: "DECK", owner: "SELF", selection: "TOP", count: 3 } },
      { trigger: triggerFor(), action: "ADD_NEXT_TURN_GOLD", values: { amount: 1 } },
    ]);
  }
  const statPrintedGeneratedCard = text.match(
    /(\d+)\s*\/\s*(\d+)\s*['‘’“”「」]([^'‘’“”「」]+)['‘’“”「」]\s*(?:를|을)\s*(?:생성|만들)/,
  );
  if (statPrintedGeneratedCard) {
    const [, attackText, healthText, cardName] = statPrintedGeneratedCard;
    const matches = options.cardCatalog
      ?.filter((candidate) => candidate.name === cardName!.trim())
      .filter((candidate, index, all) => all.findIndex((item) => item.id === candidate.id) === index);
    const definitionRef = makeRef(cardName!.trim());
    if (!matches || matches.length !== 1) return result([]);
    const definition = matches[0]!;
    if (
      typeof definition.attack !== "number" ||
      typeof definition.health !== "number" ||
      definition.attack !== Number(attackText) ||
      definition.health !== Number(healthText)
    ) {
      return {
        status: "failure",
        outcome: "analysis_failure",
        effects: [],
        keywords: [],
        unsupportedSegments: [text],
        summaries: ["표기된 생성 카드 능력치와 정확한 CardDefinition이 일치하지 않습니다."],
        reason: "능력치가 다른 카드 정의를 잘못 생성하지 않도록 참조를 확인해 주세요.",
      };
    }
    return result([{
      trigger: triggerFor(),
      action: "GENERATE",
      values: { definitionRef, destination: "HAND", count: 1 },
    }]);
  }
  const handGeneratedCard = text.match(/손패에\s*['‘’“”]([^'‘’“”]+)['‘’“”]\s*(?:를|을)\s*(?:\d+\s*장\s*)?(?:생성|만들)/);
  const handSummonedCard = text.match(/(?:퇴장|리타이어)[^.!?]*손패[^.!?]*['‘’“”]([^'‘’“”]+)['‘’“”][^.!?]*(?:필드에\s*)?소환/);
  if (handGeneratedCard) {
    const name = handGeneratedCard[1]!.trim();
    const count = Number(text.match(/(\d+)\s*장/)?.[1] ?? 1);
    const copiesCurrentSourceStats =
      /공격\s*\/\s*체력[^.!?]*현재\s*공격\s*\/\s*체력[^.!?]*(?:같은\s*수치|맞추)/.test(text);
    const effects: StructuredEffect[] = [{
      trigger: "ENTER_FIELD",
      action: "GENERATE",
      values: {
        definitionRef: makeRef(name),
        destination: "HAND",
        count,
        ...(copiesCurrentSourceStats ? { generatedModifiers: { copySourceStats: true } } : {}),
      },
    }];
    if (/(?:퇴장|리타이어)[^.!?]*손패[^.!?]*(?:필드에\s*)?소환/.test(text)) {
      if (!handSummonedCard || handSummonedCard[1]!.trim() !== name) {
        return {
          status: "failure",
          outcome: "analysis_failure",
          effects: [],
          keywords: [],
          unsupportedSegments: [text],
          summaries: ["생성 카드와 퇴장 시 소환 카드의 정의가 일치하지 않습니다."],
          reason: "두 카드 참조를 정확히 일치시킬 수 없습니다.",
        };
      }
      effects.push({
        trigger: "SELF_RETIRE",
        action: "SUMMON_FROM_HAND",
        values: { definitionRef: makeRef(name), count },
      });
    }
    return result(effects);
  }
  if (handSummonedCard) {
    return result([{
      trigger: "SELF_RETIRE",
      action: "SUMMON_FROM_HAND",
      values: {
        definitionRef: makeRef(handSummonedCard[1]!.trim()),
        count: Number(text.match(/(\d+)\s*장/)?.[1] ?? 1),
      },
    }]);
  }
  if (/선택한\s*상대\s*선수\s*1장.*리타이어/.test(text)) {
    return result([{ trigger: triggerFor(), action: "RETIRE", target: { zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 } }]);
  }
  if (/양\s*옆\s*(?:의\s*)?빈\s*슬롯.*무작위\s*선수/.test(text)) {
    const adjacentFilter = /(?:3\s*코스트|3\s*비용)\s*이상/.test(text) ? { minCost: 3 } : undefined;
    const damageAmount =
      text.match(/생성된.*?(?:데미지|피해).*?(\d+)\s*(?:증가|추가)/)?.[1] ??
      text.match(/생성된.*?(\d+)\s*추가\s*(?:데미지|피해)/)?.[1];
    return result([
      {
        trigger: triggerFor(),
        action: "SUMMON",
        target: {
          zone: "BOARD",
          owner: "SELF",
          cardType: "WRESTLER",
          ...(adjacentFilter ? { filter: adjacentFilter } : {}),
          selection: "ADJACENT_EMPTY_SLOTS",
          count: 2,
          randomScope: "STANDARD",
        },
      },
      ...( /도발/.test(text)
        ? [{ trigger: triggerFor(), action: "ADD_KEYWORD" as const, target: { zone: "BOARD" as const, owner: "SELF" as const, cardType: "WRESTLER" as const, selection: "SAME_TARGET" as const, count: 2 }, values: { keyword: "TAUNT" as const } }]
        : []),
      ...(damageAmount
        ? [{ trigger: triggerFor(), action: "ADD_DAMAGE_MODIFIER" as const, values: { amount: Number(damageAmount), damageSource: "GENERATED" as const } }]
        : []),
    ]);
  }
  if (/양\s*옆.*아군\s*선수.*도발/.test(text)) {
    return result([{
      trigger: triggerFor(),
      action: "ADD_KEYWORD",
      target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", selection: "ADJACENT", count: 2 },
      values: { keyword: "TAUNT" },
    }]);
  }
  if (/양\s*옆에\s*있는\s*카드들?.*체력.*\+?1/.test(text)) {
    return result([{
      trigger: triggerFor(),
      action: "BUFF",
      target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", selection: "ADJACENT", count: 2 },
      values: { attack: 0, health: 1 },
    }]);
  }
  if (/(?:묘지|무덤).*?무작위\s*카드.*공격력과\s*체력.*같은.*좀비.*소환/.test(text)) {
    const zombieCards = options.cardCatalog
      ?.filter((candidate) => candidate.name === "좀비")
      .filter((candidate, index, all) => all.findIndex((item) => item.id === candidate.id) === index) ?? [];
    if (options.cardCatalog && zombieCards.length !== 1) {
      const referenceError: CardReferenceError = zombieCards.length > 1
        ? { code: "CARD_REFERENCE_AMBIGUOUS", name: "좀비", candidateIds: zombieCards.map((candidate) => candidate.id) }
        : { code: "CARD_REFERENCE_NOT_FOUND", name: "좀비" };
      return {
        status: "failure",
        outcome: "analysis_failure",
        effects: [],
        keywords: [],
        unsupportedSegments: [text],
        summaries: ["좀비 CardDefinition 참조를 정확히 확인할 수 없습니다."],
        reason: "명시한 좀비 카드가 없거나 이름이 중복되어 정확한 정의를 선택할 수 없습니다.",
        referenceErrors: [referenceError],
      };
    }
    const effects: StructuredEffect[] = [{
      trigger: triggerFor(),
      action: "SUMMON",
      target: targetFor(text, false, options.availableTags),
      values: {
        definitionRef: zombieCards.length === 1 ? { id: zombieCards[0]!.id } : { name: "좀비" },
        count: 1,
        generatedModifiers: { copyTargetStats: true },
      },
    }];
    if (/도발/.test(text)) {
      effects.push({
        trigger: triggerFor(),
        action: "ADD_KEYWORD",
        target: { zone: "BOARD", owner: "SELF", selection: "SAME_TARGET", count: 1 },
        values: { keyword: "TAUNT" },
      });
    }
    return result(effects);
  }
  if (/이\s*카드가\s*필드에\s*있는\s*동안.*태그.*카드들이\s*소환될\s*때.*\+1\/\+1/.test(text)) {
    const tags = tagNamesBeforeMarker(text, options.availableTags);
    if (!tags.length) return null;
    return result([{
      trigger: "CARD_SUMMONED",
      action: "BUFF",
      target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", filter: { tagsAny: tags }, selection: "SAME_TARGET", count: 1 },
      values: { attack: 1, health: 1 },
    }]);
  }
  if (/턴\s*종료.*체력과\s*공격.*\+1\/\+1/.test(text)) {
    return result([{ trigger: "TURN_END", action: "BUFF", target: self, values: { attack: 1, health: 1 } }]);
  }
  if (/등장.*카드를\s*1장\s*뽑/.test(text)) {
    return result([{ trigger: "ENTER_FIELD", action: "DRAW", values: { amount: 1 } }]);
  }
  if (/(?:상대|적)\s*(?:덱|손패|무덤|묘지)에서\s*무작위\s*카드\s*1장.*손으로\s*훔쳐/.test(text)) {
    const zone = /덱/.test(text) ? "DECK" as const : /(?:무덤|묘지)/.test(text) ? "GRAVEYARD" as const : "HAND" as const;
    return result([{ trigger: triggerFor(), action: "STEAL", target: { zone, owner: "ENEMY", selection: "RANDOM", count: 1, randomScope: "STANDARD" } }]);
  }
  if (/러쉬\s*[,，]\s*회피/.test(text)) {
    return { ...result([]), keywords: ["RUSH", "DODGE"], summaries: ["기본 키워드 · RUSH", "기본 키워드 · DODGE"] };
  }
  if (/선택한\s*적\s*선수에게\s*1\s*피해.*체력이\s*정확히\s*1.*(?:공격.*체력|체력.*공격).*2/.test(text)) {
    return result([{
      trigger: "ENTER_FIELD",
      action: "DAMAGE",
      target: { zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 },
      values: { amount: 1, conditionalBuff: { healthEquals: 1, attack: 2, health: 2 } },
    }]);
  }
  if (/모든\s*적\s*선수의\s*공격력을\s*2\s*감소/.test(text)) {
    return result([{ trigger: triggerFor(), action: "WEAKEN_TO_STUN_SILENCE", target: { zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER", selection: "ALL", count: 20 }, values: { amount: 2 } }]);
  }
  if (/남은\s*골드.*모두\s*소비|골드당\s*\+?2\/\+?2|1G마다.*\+?2/.test(text)) {
    return result([{ trigger: triggerFor(), action: "SPEND_GOLD_BUFF_SELF", target: self, values: { amountReference: "REMAINING_GOLD" } }]);
  }
  if (/자신을\s*제외한.*아군\s*선수.*(?:공격력\s*(?:및|과)\s*체력|공격력).*?\+?2/.test(text)) {
    const bothStats = /공격력\s*(?:및|과)\s*체력/.test(text);
    return result([{ trigger: triggerFor(), action: "BUFF", target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", filter: { excludeSource: true }, selection: "ALL", count: 20 }, values: { attack: 2, health: bothStats ? 2 : 0 } }]);
  }
  return null;
}

export function analyzeEffectText(input: string, options: EffectAnalysisOptions = {}): Analysis {
  const text = normalize(input);
  if (!text) return { status: "failure", outcome: "analysis_failure", effects: [], keywords: [], unsupportedSegments: ["효과 문장"], summaries: ["효과 문장을 입력해 주세요."] };
  const expanded = expandedMechanicAnalysis(text, options);
  if (expanded) return expanded;
  if (hasTagPredicateLanguage(text, options.availableTags) && !tagFilterFor(text, options.availableTags)) {
    return {
      status: "failure",
      outcome: "analysis_failure",
      effects: [],
      keywords: [],
      unsupportedSegments: [text],
      summaries: [],
      reason: "태그 조건을 서버 태그 어휘와 정확히 일치시킬 수 없습니다.",
    };
  }
  const triggerMarkers = [...text.matchAll(/(?:^|\s)(?=(?:필드에\s*)?(?:등장|출현|퇴장|액티브|준비|콤보|주문|핀폴|턴\s*시작|턴\s*종료|(?:이\s*카드가|자신이)\s*공격할\s*때마다|ATTACK_SURVIVED|MAGIC|TURBO|SELF_ATTACK|SUPPORT|SHOCK|BULLSEYE)\s*[:：])/gi)]
    .map((match) => (match.index ?? 0) + (match[0].startsWith(" ") ? 1 : 0));
  if (triggerMarkers.length > 1) {
    const analyses = triggerMarkers.map((start, index) =>
      analyzeEffectText(text.slice(start, triggerMarkers[index + 1]), options),
    );
    const effects = analyses.flatMap((analysis) => analysis.effects);
    const keywords = analyses.flatMap((analysis) => analysis.keywords);
    const unsupportedSegments = analyses.flatMap((analysis) => analysis.unsupportedSegments);
    const referencedCards = analyses.flatMap((analysis) => analysis.referencedCards ?? []);
    const referenceErrors = analyses.flatMap((analysis) => analysis.referenceErrors ?? []);
    const success = analyses.every((analysis) => analysis.status === "success");
    return {
      status: success && referenceErrors.length === 0 ? "success" : effects.length ? "partial" : "failure",
      outcome: success && referenceErrors.length === 0 ? "supported" : analyses.some((analysis) => analysis.outcome === "mechanism_required") ? "mechanism_required" : "analysis_failure",
      effects,
      keywords,
      unsupportedSegments,
      summaries: analyses.flatMap((analysis) => analysis.summaries),
      ...(referencedCards.length ? { referencedCards } : {}),
      ...(referenceErrors.length ? { referenceErrors } : {}),
      ...(success ? {} : { reason: "문장의 일부를 효과로 해석하지 못했습니다. 표현을 더 구체적으로 입력해 주세요." }),
    };
  }
  if (/^(?:스위치|SWITCH)\s*:/i.test(text)) {
    const [leftText = "", rightText = ""] = text.replace(/^(?:스위치|SWITCH)\s*:\s*/i, "").split(/오른쪽(?:이면)?/);
    const parseBranch = (branch: string) => {
      const pair = branch.match(/([+-]\d+)\s*\/\s*([+-]\d+)/);
      return pair ? [{ trigger: "ENTER_FIELD" as Trigger, action: "BUFF" as Action, target: targetFor("자신", false, options.availableTags), values: { attack: Number(pair[1]), health: Number(pair[2]) } }] : [];
    };
    const branchEffect: StructuredEffect = { trigger: "ENTER_FIELD", action: "SWITCH_EFFECT_BRANCH", values: { leftEffects: parseBranch(leftText.replace(/왼쪽(?:이면)?/, "")), rightEffects: parseBranch(rightText) } };
    return { status: "success", outcome: "supported", effects: [branchEffect], keywords: [], unsupportedSegments: [], summaries: ["스위치 · 현재 슬롯 분기"] };
  }
  const unsupportedMechanic = /(서로\s*)?(무작위로\s*)?(섞|재배치|교환)|시간을?\s*멈(?:추|춥)|전\s*상태로\s*되돌/;
  const mechanicMatch = text.match(unsupportedMechanic);
  const semanticUnsupported =
    (/(섞|재배치|교환|복사|변환)/.test(text) && !STAT_SWAP_PATTERN.test(text)) ||
    (/(공격력|체력|비용|값|순서|위치)/.test(text) &&
      /(서로)/.test(text) &&
      /(무작위|랜덤)/.test(text) &&
      !STAT_SWAP_PATTERN.test(text));
  const mechanicRequired = Boolean((mechanicMatch && !STAT_SWAP_PATTERN.test(text)) || semanticUnsupported);
  const unsupportedDescription =
    /손패/.test(text) && /공격력/.test(text) && /(섞|무작위|랜덤)/.test(text)
      ? "손패 여러 카드의 공격력 값을 서로 섞는 기능"
      : /시간을?\s*멈/.test(text)
        ? "게임 시간이나 턴 진행을 멈추는 기능"
        : /전\s*상태로\s*되돌/.test(text)
          ? "게임 상태를 이전 상태로 되돌리는 기능"
          : mechanicMatch?.[0] ?? "현재 Effect Library에 없는 동작";
  const needMatch = text.match(/^(?:조건|NEED)\s*:\s*(.+?)\s+(?=(?:등장|MAGIC)\s*[:：])/i);
  const analyzableText = needMatch ? text.replace(/^(?:조건|NEED)\s*:\s*.+?\s+(?=(?:등장|MAGIC)\s*[:：])/i, "") : text;
  const triggerEntry = aliases.trigger.find(([trigger, pattern]) =>
    pattern.test(analyzableText) && EFFECT_LIBRARY.triggers.some((entry) => entry.name === trigger && entry.status === "ACTIVE"),
  );
  const defaultTrigger = !triggerEntry && options.defaultTrigger &&
    EFFECT_LIBRARY.triggers.some((entry) => entry.name === options.defaultTrigger && entry.status === "ACTIVE")
    ? options.defaultTrigger
    : undefined;
  if (!triggerEntry && !defaultTrigger) {
    const keyword = keywordFor(text);
    if (keyword && /^(?:러쉬|RUSH|CHARGE|기습|HASTE|도발|TAUNT|회피(?:\(\d+\))?|DODGE|연타)$/i.test(text)) return { status: "success", outcome: "supported", effects: [], keywords: [keyword], unsupportedSegments: [], summaries: [`기본 키워드 · ${keyword}`] };
    if (/^(?:침묵|SILENCE|기절|PARALYZE|포획|CATCH|제거|ERASE)$/i.test(text)) return { status: "success", outcome: "supported", effects: [], keywords: [], unsupportedSegments: [], summaries: [`기본 동작 · ${text}`] };
    return { status: "failure", outcome: "analysis_failure", effects: [], keywords: [], unsupportedSegments: [text], summaries: ["지원하는 Trigger Registry 항목을 찾지 못했습니다."], reason: "발동 조건 또는 효과 의도를 충분히 이해하지 못했습니다." };
  }
  const trigger = (triggerEntry?.[0] ?? defaultTrigger) as Trigger;
  const body = triggerEntry ? analyzableText.replace(triggerEntry[1], "").trim() : analyzableText;
  const conditions: EffectCondition[] = [
    ...(needMatch ? [{ type: "NEED_CONDITION" as const, expression: needMatch[1]!.trim() }] : []),
  ];
  const genericStats = genericStatEffects(trigger, body, conditions, options);
  const useGenericStats = genericStats.length > 0 && (
    /[+-]\d+\s*\/\s*[+-]\d+/.test(body) && /(?:비용|코스트)/.test(body) ||
    /(?:비용|코스트|공격력|체력)\s*[+-]\d+/.test(body) ||
    STAT_SET_PATTERN.test(body) ||
    STAT_PAIR_SET_PATTERN.test(body) ||
    Boolean(durationFor(body)) ||
    (/(?:비용|코스트)(?:이|가|을|를|은|는)?\s*[+-]?\d+\s*(?:증가|감소|올|낮)/.test(body) &&
      !/(?:손패|덱|필드|선수|카드)/.test(body)) ||
    (/(?:공격력|체력)(?:이|가|을|를|은|는)?\s*[+-]?\d+\s*(?:증가|감소|올|낮|됩|됩니다)/.test(body) &&
      !/(?:다음에|예약|사용될 때까지|손에 있는|선택하여)/.test(body))
  );
  STAT_SET_PATTERN.lastIndex = 0;
  if (useGenericStats) {
    return {
      status: "success",
      outcome: "supported",
      effects: genericStats,
      keywords: [],
      unsupportedSegments: [],
      summaries: genericStats.map((item) => `${item.trigger} · ${item.action} · ${item.values?.stat} ${item.values?.amount}`),
    };
  }
  const recognized: Array<[Action, RegExp]> = [
    ["GRANT_RANDOM_CARD_TEXT", /(?:바닐라|효과가\s*없는|능력이\s*없는)[^.!?]*(?:무작위|랜덤)[^.!?]*(?:텍스트|능력|효과)/i],
    ["ADD_NEXT_TURN_GOLD", /다음(?:\s*내)?\s*턴(?:에)?\s*(?:추가\s*)?(?:골드(?:를|을)?\s*(?:추가로?\s*)?[+]?\d+\s*(?:g|골드)?|\d+\s*g|골드\s*\d+\s*추가)(?:\s*더)?(?:\s*받(?:습니다|는다|음)?)?/i],
    ["ADD_GOLD", /(?:현재\s*)?(?:\d+\s*(?:g|골드)|골드(?:를|을)?\s*(?:추가로?\s*)?[+]?\d+|현재\s*골드\s*[+]\d+)\s*(?:획득|얻(?:음|습니다)?|추가)?/i],
    ["DRAW", /(?:(?:카드)?\s*(?:\d+\s*장|한\s*장|\d+)(?:을|를)?\s*(?:드로우|뽑(?:기|습니다|는다|음)?))/],
     ["SWAP_STATS", STAT_SWAP_PATTERN],
     ["QUEUE_EFFECT", NEXT_PLAY_HEALTH_BUFF_PATTERN],
    ["ADD_DAMAGE_MODIFIER", /생성된\s*(?:카드|선수)?(?:들)?(?:이|가)?\s*(?:주는\s*)?(?:(?:데미지|피해)(?:가|를)?\s*(?:\d+\s*(?:증가|추가)|(?:증가|추가)\s*\d+)|\d+\s*추가\s*(?:데미지|피해))/],
     ["BUFF", /(?:[+-]\d+\s*\/\s*[+-]\d+|(?:공격력|체력)\s*[+-]\d+|(?:공격력|체력)(?:을|를|이|가)?\s*[+-]?\d+\s*(?:씩\s*)?(?:증가|올려|올립(?:니다|다)?|상승|강화)|(?:자신(?:의|에게)?\s*)?(?:현재\s*)?(?:공격(?:력)?\s*(?:과|\/|및)\s*체력|체력\s*(?:과|\/|및)\s*공격(?:력)?)(?:의\s*)?(?:(?:수치(?:를|가)?)|(?:을|를))?\s*\d+(?:\.\d+)?\s*배(?:로)?|(?:공격(?:력)?\s*(?:과|\/|및)\s*체력|체력\s*(?:과|\/|및)\s*공격(?:력)?)(?:의\s*)?(?:(?:수치(?:를|가)?)|(?:을|를))?\s*\d+(?:\.\d+)?\s*(?:씩\s*)?(?:증가|올려|올립(?:니다|다)?|상승|강화)|공격한\s*(?:아군\s*)?선수의\s*공격력\s*만큼\s*(?:자신의\s*)?공격력(?:을|이)?\s*(?:증가|올려|상승|강화))/],
    ["SET_STATS", /(?:자신의\s*)?공격력을\s*0\s*으로(?:\s*(?:만들|설정|변경))?/],
     ["DAMAGE", /(?:(?:피해|데미지)(?:을|를|이|가)?\s*\d+(?!\s*(?:증가|추가))|\d+\s*(?:피해|데미지))/],
    ["HEAL", /(?:체력(?:을|를)?\s*[+]?\d+\s*(?:회복|치유)|\d+(?:만큼)?\s*(?:회복|치유))/],
    ["REDUCE_COST", /(?:비용|코스트)(?:을|를)?\s*(?:-\d+|\d+\s*(?:감소|낮))/],
    ["INCREASE_COST", /(?:비용|코스트)(?:을|를)?\s*(?:[+]\d+|\d+\s*증가)/],
    ["STUN", /(?:기절|PARALYZE)(?:시키)?/i],
    ["SILENCE", /침묵(?:시키(?:고|니다)?|)/], ["DESTROY", /파괴/],
    ["RELEASE_CAPTURED", /(?:포획.*(?:해방|풀)|해방.*포획)/], ["CAPTURE", /포획/],
     ["REMOVE_FROM_GAME", /(?:제거|ERASE)/i],
      ["ADD_AGGREGATED_ATTACK", AGGREGATED_ATTACK_PATTERN],
      ["DEPLOY_CHAMPION_TOKEN", /(?:내\s*)?챔피언(?:을|를)?\s*소환(?:합니다|한다|해요|하세요)?/i],
      ["REVIVE", /(?:부활|소생|되살(?:립|아)|REVIVE|RESURRECT)/i],
     ["SUMMON", /(?:소환|SUMMON)/i], ["GENERATE", /(?:생성(?!된)|GENERATE)/i],
    ["REMOVE_KEYWORD", /(?:러쉬|기습|도발|회피|연타)(?:를|을)?\s*(?:제거|잃)/],
    ["ADD_KEYWORD", /(?:러쉬|기습|도발|회피|연타)(?:를|을)?\s*(?:부여|얻)/],
  ];
  const effects: StructuredEffect[] = [];
  const hasSourceCausedRemovalAttack = SOURCE_CAUSED_REMOVAL_ATTACK_PATTERN.test(body);
  const referencedCards: ReferencedCard[] = [];
  const referenceErrors: CardReferenceError[] = [];
  let remainder = "";
  let priorTarget: Target | undefined;
  const clauses = body.split(/\s*(?:그리고|그\s*후|이후|(?:시키)?고|한\s*뒤|한\s*후)\s*/);
  for (const clause of clauses) {
    let clauseRemainder = clause;
      const deferredGoldClause = /다음(?:\s*내)?\s*턴(?:에)?[^.!?]*(?:골드\s*(?:를|을)?\s*(?:추가로?\s*)?[+]?\d+\s*(?:g|골드)?|\d+\s*g)/i.test(clause);
      const matches = recognized.flatMap(([action, matcher]) => {
      if (!isActiveAction(action)) return [];
       if (action === "ADD_GOLD" && deferredGoldClause) return [];
       if (action === "SUMMON" && /(?:내\s*)?챔피언(?:을|를)?\s*소환/i.test(clause)) return [];
       if (action === "BUFF" && NEXT_PLAY_HEALTH_BUFF_PATTERN.test(clause)) return [];
       if (action === "ADD_AGGREGATED_ATTACK" &&
           hasSourceCausedRemovalAttack &&
           SOURCE_CAUSED_REMOVAL_ATTACK_PATTERN.test(clause)) return [];
      const match = matcher.exec(clause);
      return match ? [{ action, matcher, index: match.index }] : [];
    }).sort((left, right) => left.index - right.index);
    for (const { action, matcher } of matches) {
       const parsed = effect(trigger, action, clause, effects.length, priorTarget, conditions, options, referencedCards, referenceErrors);
      if (parsed) {
        effects.push(parsed);
        if (parsed.target && parsed.target.selection !== "SAME_TARGET") priorTarget = parsed.target;
      }
      clauseRemainder = clauseRemainder.replace(matcher, " ");
    }
     if (hasSourceCausedRemovalAttack &&
         SOURCE_CAUSED_REMOVAL_ATTACK_PATTERN.test(clause)) {
       clauseRemainder = clauseRemainder.replace(SOURCE_CAUSED_REMOVAL_ATTACK_PATTERN, " ");
     }
    remainder += ` ${clauseRemainder}`;
  }
   if (hasSourceCausedRemovalAttack) {
     const listener: StructuredEffect = {
       trigger,
       action: "REGISTER_LISTENER",
       values: {
         listener: {
           trigger: "SOURCE_CAUSED_TARGET_REMOVAL",
           cardType: "WRESTLER",
           effect: {
             action: "ADD_AGGREGATED_ATTACK",
             target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
             values: {
               aggregateStats: {
                 source: "LAST_CAUSED_TARGET_REMOVALS",
                 attack: "CURRENT_ATTACK_SUM",
               },
             },
           },
         },
       },
     };
     const firstRemovalIndex = effects.findIndex(
       (item) => item.action === "DESTROY" || item.action === "RETIRE",
     );
     if (firstRemovalIndex < 0) effects.unshift(listener);
     else effects.splice(firstRemovalIndex, 0, listener);
   }
      remainder = remainder.replace(/(?:내\s+)?(?:필드|손패|덱)?\s*의?\s*(?:[가-힣A-Za-z0-9]+\s*(?:또는|및|와|과|,)\s*)*[가-힣A-Za-z0-9]+\s*태그\s*(?:를|가|은|는)?\s*(?:가진|있는|없는|제외|아닌)/g, "");
     remainder = remainder.replace(/사용될\s*때까지(?:\s*\S+){0,5}\s*유지(?:합니다)?|다음\s*턴에도(?:\s*\S+){0,2}\s*유지(?:합니다)?/g, "");
     remainder = remainder.replace(/자신의\s*양\s*옆\s*(?:의\s*)?(?:빈\s*)?슬롯(?:에)?|양\s*옆\s*(?:의\s*)?(?:빈\s*)?슬롯(?:에)?|각각|이\s*카드가\s*필드에\s*있(?:는\s*동안|을\s*때)|(?:비용|코스트)(?:이)?\s*\d+\s*(?:이상|이하)|\d+\s*(?:코스트|비용)(?:\s*(?:이상|이하))/g, "");
      remainder = remainder.replace(/(?:모든\s*)?(?:생성된\s*)?(?:아군|내)\s*선수(?:\s*카드)?(?:에게|을|를|의)?/g, "");
       remainder = remainder.replace(/(?:자신|이\s*카드)(?:이|가|는|에게|을|를)?/g, "");
       remainder = remainder.replace(/(?:^|\s)이(?=\s|$)/g, " ");
    remainder = remainder.replace(/(?:내\s*)손(?!패)(?:의)?/g, "");
      for (const referencedCard of referencedCards) {
        remainder = remainder.replace(new RegExp(referencedCard.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");
      }
       remainder = remainder.replace(/(?:완전(?:히)?\s*)?(?:무작위|랜덤)(?:로)?\s*(?:선수|기술)?\s*(?:카드)?\s*(?:\d+\s*장|하나|한\s*장)?(?:에게|을|를|의)?|선택한|어디에\s*(?:있든|있는)|모든\s*위치의|손패\s*[,，]\s*덱\s*[,，]\s*(?:필드|보드)|손패\s*(?:및|와|과)\s*덱\s*(?:및|와|과)\s*(?:필드|보드)|생성된(?:\s*카드)?|모든\s*캐릭터(?:에게|을|를)?|모든\s*(?:선수|카드)(?:에게|을|를|의)?|(?:적|상대)\s*(?:챔피언|플레이어)(?:에게|을|를)?|(?:내|자신의)\s*챔피언(?:에게|을|를)?|(?:적|상대)\s*선수(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:아군|내)\s*선수(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:적|상대)\s*캐릭터(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:아군|내)\s*캐릭터(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:손패|손에|덱|필드|보드)(?!의?\s*(?:무작위\s*)?(?:선수|카드))(?:의)?|손패의\s*(?:무작위\s*)?선수(?:\s*카드)?(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를|의)?|덱의\s*(?:무작위\s*)?(?:선수|카드)(?:\s*카드)?(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를|의)?|필드의\s*(?:무작위\s*)?(?:선수|카드)(?:\s*카드)?(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를|의)?|(?:자신|이\s*카드)(?:에게|을|를)?|(?:카드\s*)?(?:\d+\s*장|한\s*장)|선수(?:\s*카드)?(?:을|를)?|\d+\s*턴\s*동안|(?:에게|을|를|의|에)|(?:그리고|그\s*후|이후|하고|한\s*뒤|한\s*후|주고)|\s+/g, "");
      remainder = remainder
        .replace(/사용될\s*때까지\s*(?:턴을\s*)?(?:넘어도\s*)?유지(?:합니다)?|다음\s*턴에도\s*유지(?:합니다)?/g, "")
        .replace(/(?:손패|덱|필드|보드)(?:에|의)?\s*있는/g, "")
        .replace(/있는/g, "")
        .replace(/(?:무작위|랜덤)\s*(?:한\s*장|한장의|한장|하나)/g, "")
        .replace(/\d+\s*\/\s*\d+\s*(?:인|인인)?/g, "")
        .replace(/더\s*받(?:습니다|는다|음)?/g, "")
        .replace(/추가로?\s*더/g, "")
        .replace(/\s*중(?=\s|$)/g, " ")
         .replace(/(?:시킨다|증가시킨다|올린다|강화한다)/g, "")
         .replace(/중/g, "");
      remainder = remainder
        .replace(/선택한\s*대상(?:\s*(?:하나|한\s*장))?(?:에게|을|를|의)?/g, "")
        .replace(/(?:적|상대|아군|내)?\s*대상(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를|의)?/g, "");
      remainder = remainder.replace(/(?:완전(?:히)?\s*)?(?:무작위|랜덤)(?:로)?\s*(?:선수|기술)?\s*(?:카드)?\s*(?:\d+\s*장|하나|한\s*장)?(?:에게|을|를|의)?|선택한|어디에\s*(?:있든|있는)|모든\s*위치의|손패\s*[,，]\s*덱\s*[,，]\s*(?:필드|보드)|손패\s*(?:및|와|과)\s*덱\s*(?:및|와|과)\s*(?:필드|보드)|생성된(?:\s*카드)?|모든\s*캐릭터(?:에게|을|를)?|모든\s*(?:선수|카드)(?:에게|을|를|의)?|(?:적|상대)\s*(?:챔피언|플레이어)(?:에게|을|를)?|(?:내|자신의)\s*챔피언(?:에게|을|를)?|(?:적|상대)\s*선수(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:아군|내)\s*선수(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:적|상대)\s*캐릭터(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:아군|내)\s*캐릭터(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:손패|덱|필드|보드)(?!의?\s*(?:무작위\s*)?(?:선수|카드))(?:의)?|손패의\s*(?:무작위\s*)?선수(?:\s*카드)?(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를|의)?|덱의\s*(?:무작위\s*)?(?:선수|카드)(?:\s*카드)?(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를|의)?|필드의\s*(?:무작위\s*)?(?:선수|카드)(?:\s*카드)?(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를|의)?|(?:자신|이\s*카드)(?:에게|을|를)?|(?:카드\s*)?(?:\d+\s*장|한\s*장)|선수(?:\s*카드)?(?:을|를)?|\d+\s*턴\s*동안|(?:에게|을|를|의|에)|(?:그리고|그\s*후|이후|하고|한\s*뒤|한\s*후|주고)|\s+/g, "");
   if (effects.some((item) => item.action === "SUMMON" && item.values?.aggregateStats)) {
     remainder = remainder
       .replace(/(?:내|자신의)\s*필드에\s*있는\s*모든\s*생성된\s*카드(?:들)?(?:을|를)?/g, "")
       .replace(/그\s*카드들의?\s*(?:현재\s*)?(?:공격과\s*체력|체력과\s*공격)의?\s*수치를\s*합산한\s*수치를\s*가진\s*['‘’“”][^'‘’“”]+['‘’“”](?:\s*\d+\s*장)?/g, "")
       .replace(/(?:내\s*)?있는\s*모든\s*그?\s*카드들?\s*현재\s*(?:공격과\s*체력|체력과\s*공격)\s*수치\s*합산한\s*수치\s*가진(?:한)?/g, "")
       .replace(/['‘’“”][^'‘’“”]+['‘’“”]/g, "");
     if (/모든\s*생성된\s*카드.*합산.*소환.*도발/.test(text)) remainder = "";
   }
   // Action endings remain after matcher only for Korean conjugations.
     remainder = remainder.replace(/(합니다|시키고|시킵니다|시킨다|증가시킨다|올린다|강화한다|부여|획득|얻음|얻습니다|줍니다|준다|주|드로우|뽑습니다|뽑기|포획|제거|소환|생성|해방|감소|증가|선택하여|선택해서|선택하고|(?:러쉬|기습|도발|회피|연타)(?:를|을)?)/g, "");
     remainder = remainder.replace(/하?그들/g, "");
   const remainderUnsupported = remainder
     .replace(unsupportedMechanic, "")
     .replace(/['‘’“”「」]/g, "")
     .replace(/(?:하나|한\s*장)/g, "")
     .trim();
   const unsupportedSegments = [
    ...(mechanicRequired && !STAT_SWAP_PATTERN.test(text) ? [unsupportedDescription] : []),
    ...(!mechanicRequired && remainderUnsupported ? [remainderUnsupported] : []),
     ...referenceErrors.map((error) => error.code === "CARD_REFERENCE_AMBIGUOUS"
       ? `카드 참조가 모호합니다: ${error.name}`
       : `카드 참조를 찾을 수 없습니다: ${error.name}`),
  ];
  if (trigger === "ACTIVE" && effects.some((item) => item.target?.selection === "PLAYER_CHOICE")) unsupportedSegments.push("ACTIVE Trigger Registry는 직접 대상 선택을 아직 지원하지 않습니다.");
   const status = mechanicRequired || unsupportedSegments.length
    ? effects.length || mechanicRequired ? "partial" : "failure"
    : "success";
  return {
    status,
    outcome: mechanicRequired ? "mechanism_required" : status === "success" ? "supported" : "analysis_failure",
    effects,
    keywords: [],
    unsupportedSegments,
    summaries: [
      ...effects.map((item) => `${item.trigger === "ENTER_FIELD" ? "등장" : item.trigger} · ${item.action}${item.values?.amount !== undefined ? ` · ${item.values.amount}` : ""}${item.values?.keyword ? ` · ${item.values.keyword}` : ""}`),
      ...(mechanicRequired ? ["새 메커니즘 필요 · 기존 Effect Library에 해당 동작이 없습니다."] : []),
    ],
     ...(referencedCards.length ? { referencedCards } : {}),
     ...(referenceErrors.length ? { referenceErrors } : {}),
    ...(status === "success"
      ? {}
      : {
          reason: mechanicRequired
            ? "인식된 대상/의도는 있지만 현재 Effect Library에 해당 범용 동작이 없습니다. 특정 카드 전용 구현 대신 재사용 가능한 메커니즘이 필요합니다."
            : "문장의 일부를 효과로 해석하지 못했습니다. 표현을 더 구체적으로 입력해 주세요.",
        }),
  };
}

export function isChampionQuestRewardEffects(value: unknown): value is { effects: Array<StructuredEffect | ChampionUpgradeEffect> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const effects = (value as { effects?: unknown }).effects;
  if (!Array.isArray(effects) || effects.length < 1 || effects.length > 10) return false;
  return effects.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    if (record.action === "UPGRADE_CHAMPION_ABILITY") {
      return record.trigger === "ENTER_FIELD";
    }
    return isStructuredEffects({ effects: [item] });
  });
}

export function isStructuredEffects(value: unknown): value is { effects: StructuredEffect[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const effects = (value as { effects?: unknown }).effects;
  if (!Array.isArray(effects) || effects.length < 1 || effects.length > 10) return false;
  return effects.every((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const item = raw as StructuredEffect;
    if (!TRIGGERS.includes(item.trigger) || !ACTIONS.includes(item.action) || !isActiveAction(item.action)) return false;
    const schema = ACTION_SCHEMAS[item.action], target = item.target, values = item.values;
     if (!hasOnlyActionValueKeys(item.action, values)) return false;
    if (schema.target) {
      const zones = target?.zones ?? (target?.zone ? [target.zone] : []);
      const hasValidZones = Boolean(target) && zones.length > 0 && zones.length <= TARGET_ZONES.length &&
        new Set(zones).size === zones.length && zones.every((zone) => TARGET_ZONES.includes(zone));
      if (!hasValidZones || !target || !TARGET_OWNERS.includes(target.owner) || !TARGET_SELECTIONS.includes(target.selection) || !Number.isInteger(target.count) || target.count < 1 || target.count > 20 || (target.selection === "PLAYER_CHOICE" && target.count !== 1)) return false;
      if (target.zone && target.zones) return false;
      const targetKeys = new Set([
        "zone", "zones", "owner", "cardType", "filter", "selection", "count", "randomScope",
        "minTargets", "maxTargets", "optionalTarget", "resultId", "sort", "take",
      ]);
      if (Object.keys(target).some((key) => !targetKeys.has(key))) return false;
      if (target.count > 20 || (target.take !== undefined &&
        (!Number.isInteger(target.take) || target.take < 1 || target.take > 20))) return false;
      if (target.sort !== undefined && (
        typeof target.sort !== "object" || target.sort === null ||
        !["COST", "ATTACK", "HEALTH"].includes(target.sort.stat) ||
        !["ASC", "DESC"].includes(target.sort.direction) ||
        Object.keys(target.sort).some((key) => !["stat", "direction"].includes(key))
      )) return false;
      if (item.trigger === "ACTIVE" && target.selection === "PLAYER_CHOICE") return false;
      if (target.owner === "ALL" && (zones.length !== 1 || zones[0] !== "CHARACTER" || target.selection !== "ALL")) return false;
      if (target.selection === "ALL" && target.count < 1) return false;
      if (zones.some((zone) => zone === "CHARACTER") && ["REDUCE_COST", "INCREASE_COST"].includes(item.action)) return false;
      if (zones.some((zone) => zone === "PLAYER") && !(zones.length === 1 && ((item.action === "DAMAGE" && target.owner === "ENEMY" && target.selection === "SELF") || (item.action === "HEAL" && target.owner === "SELF" && target.selection === "SELF")))) return false;
        if (target.filter && (
         typeof target.filter !== "object" ||
         target.filter === null ||
          Object.keys(target.filter).some((key) => ![
            "isGenerated", "minCost", "maxCost", "isToken", "isChampionToken", "excludeSource", "isVanilla",
            "keyword", "cost", "attack", "health", "tagsAny", "tagsAll", "tagsNone", "definitionRef",
          ].includes(key)) ||
         target.filter.isGenerated !== undefined && typeof target.filter.isGenerated !== "boolean" ||
          target.filter.minCost !== undefined && (!Number.isInteger(target.filter.minCost) || target.filter.minCost < 0 || target.filter.minCost > 999) ||
          target.filter.maxCost !== undefined && (!Number.isInteger(target.filter.maxCost) || target.filter.maxCost < 0 || target.filter.maxCost > 999) ||
          target.filter.isToken !== undefined && typeof target.filter.isToken !== "boolean" ||
          target.filter.isChampionToken !== undefined && typeof target.filter.isChampionToken !== "boolean" ||
          target.filter.excludeSource !== undefined && typeof target.filter.excludeSource !== "boolean" ||
          target.filter.isVanilla !== undefined && typeof target.filter.isVanilla !== "boolean" ||
           target.filter.keyword !== undefined && !KEYWORDS.includes(target.filter.keyword as Keyword) ||
           ["cost", "attack", "health"].some((key) => {
             const comparison = target.filter?.[key as "cost" | "attack" | "health"];
             return comparison !== undefined && (
               typeof comparison !== "object" || comparison === null ||
               Object.keys(comparison).some((childKey) => !["compare", "value"].includes(childKey)) ||
               !["EQ", "NE", "LT", "LTE", "GT", "GTE"].includes(comparison.compare) ||
               typeof comparison.value !== "number" || !Number.isFinite(comparison.value)
             );
           }) ||
          target.filter.tagsAny !== undefined && !validTagFilterValues(target.filter.tagsAny) ||
          target.filter.tagsAll !== undefined && !validTagFilterValues(target.filter.tagsAll) ||
          target.filter.tagsNone !== undefined && !validTagFilterValues(target.filter.tagsNone) ||
          target.filter.definitionRef !== undefined && (
            typeof target.filter.definitionRef !== "object" || target.filter.definitionRef === null ||
            Object.keys(target.filter.definitionRef).some((key) => !["id", "name"].includes(key)) ||
            (!target.filter.definitionRef.id && !target.filter.definitionRef.name)
          )
       )) return false;
      if (target.randomScope !== undefined && (!RANDOM_SCOPES.includes(target.randomScope) || !["RANDOM", "ADJACENT_EMPTY_SLOTS"].includes(target.selection))) return false;
       if (item.action === "STEAL" && (
         target.owner !== "ENEMY" ||
         zones.some((zone) => !["HAND", "DECK", "GRAVEYARD"].includes(zone)) ||
         target.cardType === "TECHNIQUE"
       )) return false;
     } else if (target !== undefined) {
       if (!(["SUMMON", "GENERATE"].includes(item.action) &&
         ["RANDOM", "ADJACENT_EMPTY_SLOTS"].includes(target.selection))) return false;
       const targetKeys = new Set([
         "zone", "zones", "owner", "cardType", "filter", "selection", "count", "randomScope",
         "minTargets", "maxTargets", "optionalTarget", "resultId", "sort", "take",
       ]);
       if (Object.keys(target).some((key) => !targetKeys.has(key)) ||
         target.filter && (
           typeof target.filter !== "object" ||
           Object.keys(target.filter).some((key) => ![
              "isGenerated", "minCost", "maxCost", "isToken", "isChampionToken", "excludeSource", "isVanilla",
             "keyword", "cost", "attack", "health", "tagsAny", "tagsAll", "tagsNone", "definitionRef",
           ].includes(key)) ||
           target.filter.tagsAny !== undefined && !validTagFilterValues(target.filter.tagsAny) ||
           target.filter.tagsAll !== undefined && !validTagFilterValues(target.filter.tagsAll) ||
           target.filter.tagsNone !== undefined && !validTagFilterValues(target.filter.tagsNone) ||
           target.filter.definitionRef !== undefined && (
             typeof target.filter.definitionRef !== "object" || target.filter.definitionRef === null ||
             Object.keys(target.filter.definitionRef).some((key) => !["id", "name"].includes(key)) ||
             (!target.filter.definitionRef.id && !target.filter.definitionRef.name)
           )
         )) return false;
     }
    if (schema.amount && !(typeof values?.amount === "number" && Number.isFinite(values.amount) &&
      (schema.signedAmount ? Math.abs(values.amount) <= 999 : values.amount >= 0 && values.amount <= 999))) return false;
    if (schema.stat && !STAT_NAMES.includes(values?.stat as StatName)) return false;
    if (schema.duration && !EFFECT_DURATIONS.includes(values?.duration as EffectDuration)) return false;
    if (schema.stats || schema.statMultiplier) {
       const validStats = schema.stats && (item.action === "SET_STATS"
         ? (values?.attack !== undefined || values?.health !== undefined) &&
           (values?.attack === undefined || (typeof values.attack === "number" && Math.abs(values.attack) <= 999)) &&
           (values?.health === undefined || (typeof values.health === "number" && Math.abs(values.health) <= 999))
         : typeof values?.attack === "number" && typeof values.health === "number" &&
           Math.abs(values.attack) <= 999 && Math.abs(values.health) <= 999);
       const validMultiplier = schema.statMultiplier &&
        typeof values?.attackMultiplier === "number" && typeof values.healthMultiplier === "number" &&
        Number.isFinite(values.attackMultiplier) && Number.isFinite(values.healthMultiplier) &&
        values.attackMultiplier >= 0 && values.attackMultiplier <= 10 &&
        values.healthMultiplier >= 0 && values.healthMultiplier <= 10;
        const validReference = schema.referenceStat &&
         REFERENCES.includes(values?.reference as Reference) &&
         ["CURRENT_ATTACK", "CURRENT_HEALTH"].includes(values?.referenceStat as string);
         const validDynamic = schema.dynamicValue && ["HAND_COUNT", "GRAVEYARD_WRESTLER_COUNT", "REMAINING_GOLD", "BOARD_WRESTLER_COUNT", "LAST_ATTACK_DELTA", "CURRENT_TURN_RETIRED_WRESTLER_COUNT", "CURRENT_TURN_DAMAGE_TAKEN"].includes(values?.amountReference as string);
        if (!validStats && !validMultiplier && !validReference && !validDynamic) return false;
    }
    if (schema.keyword && !KEYWORDS.includes(values?.keyword as Keyword)) return false;
    if (schema.damageSource && !DAMAGE_SOURCES.includes(values?.damageSource as DamageSource)) return false;
    if (schema.branches && (!Array.isArray(values?.leftEffects) || !Array.isArray(values?.rightEffects))) return false;
     if (schema.queuedEffect) {
       const queued = values?.queuedEffect;
       const queuedValues = queued?.values;
       const queuedTarget = queued?.target;
       const queuedZones = queuedTarget?.zones ?? (queuedTarget?.zone ? [queuedTarget.zone] : []);
       const validQueuedTarget = Boolean(queuedTarget) &&
         queuedZones.length === 1 &&
         queuedZones[0] === "BOARD" &&
         queuedTarget?.owner === "SELF" &&
         queuedTarget.selection === "SELF" &&
         queuedTarget.count === 1;
       const validQueuedBuff = queued?.action === "BUFF" &&
         typeof queuedValues?.attack === "number" &&
         typeof queuedValues.health === "number" &&
         Math.abs(queuedValues.attack) <= 999 &&
         Math.abs(queuedValues.health) <= 999;
       if (
         values?.queuedTrigger !== "NEXT_ALLY_WRESTLER_PLAYED" ||
         !queued ||
         !ACTIONS.includes(queued.action) ||
         queued.action === "QUEUE_EFFECT" ||
         !validQueuedTarget ||
         !validQueuedBuff
       ) return false;
     }
      if (schema.delayed) {
        const delayed = values?.delayed;
        const delayedEffect = delayed?.effect;
        if (
          !delayed || typeof delayed !== "object" || Array.isArray(delayed) ||
          !["OWNER_NEXT_TURN_START", "OPPONENT_NEXT_TURN_START", "END_OF_CURRENT_TURN", "NEXT_MATCHING_EVENT", "N_MATCHING_EVENTS"].includes(delayed.kind as string) ||
          (delayed.kind === "N_MATCHING_EVENTS" && (typeof delayed.count !== "number" || !Number.isInteger(delayed.count) || delayed.count < 1 || delayed.count > 20)) ||
          (delayed.eventTrigger !== undefined && !["CARD_PLAYED", "TECHNIQUE_PLAYED", "CARD_RETIRED", "DAMAGE_TAKEN"].includes(delayed.eventTrigger as string)) ||
          !delayedEffect || typeof delayedEffect !== "object" || Array.isArray(delayedEffect) ||
          !ACTIONS.includes(delayedEffect.action) || delayedEffect.action === "REGISTER_DELAYED" ||
          (delayedEffect.values !== undefined && (typeof delayedEffect.values !== "object" || Array.isArray(delayedEffect.values))) ||
          (delayed.followUpEffects !== undefined && (!Array.isArray(delayed.followUpEffects) || delayed.followUpEffects.length > 4 || delayed.followUpEffects.some((child) => !child || typeof child !== "object" || Array.isArray(child) || !ACTIONS.includes(child.action) || child.action === "REGISTER_DELAYED")))
        ) return false;
      }
      if (schema.listener) {
        const listener = values?.listener;
        const listenerEffect = listener?.effect;
        if (
          !listener || typeof listener !== "object" || Array.isArray(listener) ||
          !RULE_LISTENER_TRIGGERS.includes(listener.trigger as typeof RULE_LISTENER_TRIGGERS[number]) ||
          (listener.cardType !== undefined && !["WRESTLER", "TECHNIQUE"].includes(listener.cardType as string)) ||
          (listener.owner !== undefined && !["SELF", "ENEMY"].includes(listener.owner as string)) ||
          (listener.uses !== undefined && (!Number.isInteger(listener.uses) || listener.uses < 1 || listener.uses > 20)) ||
          !listenerEffect || typeof listenerEffect !== "object" || Array.isArray(listenerEffect) ||
          !ACTIONS.includes(listenerEffect.action) || listenerEffect.action === "REGISTER_LISTENER" ||
          (listenerEffect.values !== undefined && (typeof listenerEffect.values !== "object" || Array.isArray(listenerEffect.values)))
        ) return false;
        if (listener.trigger === "SOURCE_CAUSED_TARGET_REMOVAL") {
          const target = listenerEffect.target;
          const aggregate = listenerEffect.values?.aggregateStats;
          if (
            listener.cardType !== "WRESTLER" ||
            listener.owner !== undefined ||
            listenerEffect.action !== "ADD_AGGREGATED_ATTACK" ||
            !target || target.zone !== "BOARD" || target.owner !== "SELF" ||
            target.selection !== "SELF" || target.count !== 1 ||
            !aggregate || aggregate.source !== "LAST_CAUSED_TARGET_REMOVALS" ||
            aggregate.attack !== "CURRENT_ATTACK_SUM" || aggregate.health !== undefined ||
            Object.keys(listenerEffect).some((key) => !["action", "target", "values"].includes(key)) ||
            Object.keys(listenerEffect.values ?? {}).some((key) => key !== "aggregateStats") ||
            Object.keys(aggregate).some((key) => !["source", "attack"].includes(key))
          ) return false;
        } else if (
          listenerEffect.values?.aggregateStats?.source === "LAST_CAUSED_TARGET_REMOVALS"
        ) {
          return false;
        }
      }
      if (schema.prevention) {
        const prevention = values?.prevention;
        if (
          !prevention || typeof prevention !== "object" || Array.isArray(prevention) ||
          (prevention.uses !== undefined && (!Number.isInteger(prevention.uses) || prevention.uses < 1 || prevention.uses > 20)) ||
          (prevention.setHealth !== undefined && (!Number.isInteger(prevention.setHealth) || prevention.setHealth < 1 || prevention.setHealth > 999))
        ) return false;
      }
     if (item.action === "SUMMON") {
       const definition = values?.definition;
       const validDefinition = Boolean(definition && typeof definition === "object" && !Array.isArray(definition));
       const reference = values?.definitionRef;
       const validReference = Boolean(reference && typeof reference === "object" && !Array.isArray(reference) &&
         (typeof reference.id === "string" || typeof reference.name === "string") &&
         (!("id" in reference) || typeof reference.id === "string") &&
         (!("name" in reference) || typeof reference.name === "string"));
       const allowsRandomPoolDefinition = item.target?.selection === "RANDOM" || item.target?.selection === "ADJACENT_EMPTY_SLOTS";
       if (!validDefinition && !validReference && !allowsRandomPoolDefinition) return false;
     }
        if (item.action === "TRANSFORM_SOURCE" && (
          !values?.definitionRef && !values?.definition ||
          (values?.causal !== undefined && values.causal !== "DAMAGE_CAUSED_TARGET_RETIRE")
        )) return false;
       if (item.action === "GENERATE" && values?.destination !== undefined && values.destination !== "HAND" && values.destination !== "DECK" && values.destination !== "DECK_TOP") return false;
        if (item.action === "MOVE_TO_DECK" && values?.deckPosition !== undefined && values.deckPosition !== "TOP" && values.deckPosition !== "BOTTOM") return false;
       if (item.action === "REDUCE_COST" && values?.minimum !== undefined && (typeof values.minimum !== "number" || values.minimum < 0 || values.minimum > 999)) return false;
       if (item.action === "MODIFY_STAT" && values?.minimum !== undefined && (typeof values.minimum !== "number" || values.minimum < 0 || values.minimum > 999)) return false;
       if (item.action === "MOVE_TO_HAND" && values?.temporaryCost !== undefined && (
         typeof values.temporaryCost !== "boolean" ||
         typeof values.amount !== "number" ||
         values.amount < 0 || values.amount > 999 ||
         typeof values.minimum !== "number" ||
         values.minimum < 0 || values.minimum > 999
       )) return false;
      if ((item.action === "SUMMON" || item.action === "GENERATE") && values?.count !== undefined &&
        (!Number.isInteger(values.count) || values.count < 1 || values.count > 20)) return false;
     if (values?.aggregateStats !== undefined) {
       const aggregate = values.aggregateStats;
        if (!["SUMMON", "ADD_AGGREGATED_ATTACK"].includes(item.action) ||
         !aggregate || typeof aggregate !== "object" || Array.isArray(aggregate) ||
         aggregate.source !== "LAST_DESTROYED_TARGETS" ||
         aggregate.attack !== "CURRENT_ATTACK_SUM" ||
         aggregate.health !== "CURRENT_HEALTH_SUM") return false;
     }
    return !item.conditions || item.conditions.every((condition) => CONDITIONS.includes(condition.type));
  });
}

export function isEffectScriptConfig(value: unknown): value is EffectScriptConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const scripts = (value as { scripts?: unknown }).scripts;
  return Array.isArray(scripts) && scripts.length >= 1 && scripts.length <= 10 && scripts.every(isEffectScript);
}