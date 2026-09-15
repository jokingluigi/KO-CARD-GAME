import {
  ACTION_SCHEMAS, ACTIONS, CONDITIONS, DAMAGE_SOURCES, DEFAULT_CARD_TARGET_SCOPE, EFFECT_CAPABILITIES, EFFECT_LIBRARY, KEYWORDS, REFERENCES, TARGET_OWNERS,
  RANDOM_SCOPES, TARGET_SELECTIONS, TARGET_ZONES, TRIGGERS,
  type Action, type Condition, type Keyword, type Reference, type TargetOwner, type TargetSelection,
  type DamageSource, type RandomScope, type TargetZone, type Trigger,
} from "@workspace/effect-registry";

export { ACTIONS, KEYWORDS, TRIGGERS };
export type { Action, Keyword, Trigger };
export type Target = {
  zone?: TargetZone;
  zones?: TargetZone[];
  owner: TargetOwner;
  cardType?: "WRESTLER" | "TECHNIQUE";
  filter?: { isGenerated?: boolean; minCost?: number };
  selection: TargetSelection;
  count: number;
  randomScope?: RandomScope;
};
export type EffectCondition = { type: Condition; expression?: string };
export type QueuedStructuredEffect = {
  action: Action;
  target?: Target;
  values?: {
    attack?: number;
    health?: number;
    attackMultiplier?: number;
    healthMultiplier?: number;
    amount?: number;
    keyword?: Keyword;
    damageSource?: DamageSource;
    reference?: Reference;
    referenceStat?: "CURRENT_ATTACK" | "CURRENT_HEALTH";
  };
};
export type StructuredEffect = {
  trigger: Trigger;
  action: Action;
  target?: Target;
  conditions?: EffectCondition[];
  values?: {
    attack?: number;
    health?: number;
    attackMultiplier?: number;
    healthMultiplier?: number;
    amount?: number;
    keyword?: Keyword;
    damageSource?: DamageSource;
    reference?: Reference;
    referenceStat?: "CURRENT_ATTACK" | "CURRENT_HEALTH";
    queuedTrigger?: "NEXT_ALLY_WRESTLER_PLAYED";
    queuedEffect?: QueuedStructuredEffect;
    definition?: Record<string, unknown>;
    definitionRef?: { id?: string; name?: string };
    count?: number;
    destination?: "HAND" | "DECK";
    aggregateStats?: {
      source: "LAST_DESTROYED_TARGETS";
      attack: "CURRENT_ATTACK_SUM";
      health: "CURRENT_HEALTH_SUM";
    };
    leftEffects?: StructuredEffect[];
    rightEffects?: StructuredEffect[];
  };
};
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
  keywords: Keyword[];
  unsupportedSegments: string[];
  summaries: string[];
  reason?: string;
  condition?: Record<string, unknown>;
  referencedCards?: ReferencedCard[];
  referenceErrors?: CardReferenceError[];
};
export type EffectAnalysisOptions = { defaultTrigger?: Trigger; cardCatalog?: readonly CardReferenceCandidate[] };

const aliases = {
  trigger: [
    ["ENTER_FIELD", /^(?:필드에\s*)?(?:등장|MAGIC)(?:할\s*때|하면)?\s*[:：]?/i],
    ["LEAVE_FIELD", /^(?:필드에서\s*)?퇴장(?:할\s*때|하면)?\s*[:：]?/],
    ["ACTIVE", /^액티브(?:\s*사용)?(?:하면)?\s*[:：]?/],
    ["CARD_DRAWN", /^(?:준비|TURBO)\s*[:：]?/i],
    ["SELF_ATTACK", /^(?:(?:이\s*카드가|자신이)\s*공격할\s*때마다|SELF_ATTACK)\s*[:：]?/i],
    ["OTHER_ALLY_ATTACK", /^(?:콤보|SUPPORT)\s*[:：]?/i],
    ["TECHNIQUE_CAST", /^(?:주문|SHOCK)\s*[:：]?/i],
    ["CARD_PLAYED_THIS_TURN", /^(?:태그|SYNERGY)\s*[:：]?/i],
    ["EXACT_ZERO_DAMAGE", /^(?:핀폴|BULLSEYE)\s*[:：]?/i],
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
const NEXT_PLAY_HEALTH_BUFF_PATTERN = /다음(?:에)?\s*(?:(?:내가|제가)\s*)?내는\s*(?:아군\s*)?선수\s*카드\s*(?:1장|한\s*장)(?:(?:이|을|의)\s*)?(?:체력(?:이|을)?\s*)?(\d+)\s*(?:증가|늘어|올라|올라갑니다?|올립니다?)/i;
const STAT_SWAP_PATTERN = /(?:자신(?:의|에게)?\s*)?(?:현재\s*)?(?:공격(?:력)?\s*(?:과|\/|및)\s*체력|체력\s*(?:과|\/|및)\s*공격(?:력)?)[^.!?]{0,30}?(?:서로\s*)?(?:교환|바꾸|바꿉니다)/i;
const ACTIVE_CARD_SCOPE_PATTERN = /(?:어디에\s*(?:있든|있는)|모든\s*위치의|손패\s*[,，]\s*덱\s*[,，]\s*(?:필드|보드)|손패\s*(?:및|와|과)\s*덱\s*(?:및|와|과)\s*(?:필드|보드))/;
const GENERATED_FILTER_PATTERN = /(?:생성된|생성\s*카드|GENERATED)/i;
const MIN_COST_PATTERN = /(\d+)\s*(?:코스트|비용)\s*이상/;
const AGGREGATED_STATS_PATTERN = /(?:현재\s*)?(?:공격(?:력)?\s*(?:과|\/|및)\s*체력|체력\s*(?:과|\/|및)\s*공격(?:력)?)[^.!?]{0,30}?합산/;
const AGGREGATED_ATTACK_PATTERN = /(?:리타이어|퇴장|파괴).*공격력.*(?:더|추가)|공격력.*(?:리타이어|퇴장|파괴)/;

export function effectLibrary() {
  return EFFECT_LIBRARY;
}
function isActiveAction(action: Action) {
  return EFFECT_CAPABILITIES[action].status === "ACTIVE";
}

function normalize(input: string) {
  return input.normalize("NFC").replace(/[：:]/g, ":").replace(/[.。!！?？]/g, " ").replace(/\s+/g, " ").trim()
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
function targetFilterFor(text: string): Target["filter"] | undefined {
  const generated = GENERATED_FILTER_PATTERN.test(text);
  const minCost = Number(text.match(MIN_COST_PATTERN)?.[1]);
  const filter = {
    ...(generated ? { isGenerated: true } : {}),
    ...(Number.isInteger(minCost) ? { minCost } : {}),
  };
  return Object.keys(filter).length ? filter : undefined;
}
function targetFor(text: string, randomPool = false): Target {
  const hand = /손(?:패)?/.test(text);
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
  const random = /(무작위|랜덤)/.test(text), all = /(모든|전부)/.test(text);
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
  const filter = targetFilterFor(filterText);
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
    zone: deck ? "DECK" : hand ? "HAND" : "BOARD",
    owner: enemy ? "ENEMY" : "SELF",
    ...(cardType ? { cardType } : {}),
    ...(filter ? { filter } : {}),
    selection: random ? "RANDOM" : all ? "ALL" : "PLAYER_CHOICE",
    count: all ? 20 : targetCountFrom(text),
    ...(randomTarget ? { randomScope } : {}),
  };
}
function keywordFor(text: string): Keyword | undefined {
  return aliases.keyword.find(([, pattern]) => pattern.test(text))?.[0];
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
      target: targetFor(body),
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
        target: targetFor(body),
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
  const explicitTarget = /(선택한\s*(?:선수|대상)|자신|이\s*카드(?!는)|모든\s*캐릭터|모든\s*(?:생성된\s*)?선수|(?:적|상대)\s*(?:선수|챔피언|플레이어|캐릭터)|(?:아군|내)\s*캐릭터|손(?:패)?|생성된|어디에\s*(?:있든|있는)|모든\s*위치의|손패\s*[,，]\s*덱\s*[,，]\s*(?:필드|보드))/.test(targetBody);
  const sameSummonedTarget = action === "ADD_KEYWORD" && /소환한\s*['‘’“”]?[^'‘’“”\s]+['‘’“”]?\s*에게/.test(body);
  const randomPoolAction = action === "SUMMON" || action === "GENERATE";
  const resolvedTarget = sameSummonedTarget
    ? { zone: "BOARD" as const, owner: "SELF" as const, selection: "SAME_TARGET" as const, count: 1 }
    : (schema.target || (randomPoolAction && /(무작위|랜덤)/.test(body)))
       ? (!explicitTarget && priorTarget ? { ...priorTarget, selection: "SAME_TARGET" as const } : targetFor(targetBody, randomPoolAction))
      : undefined;
  return {
    trigger,
    action,
    ...(resolvedTarget ? { target: resolvedTarget } : {}),
    ...(conditions?.length ? { conditions } : {}),
    ...(Object.keys(values).length ? { values } : {}),
  };
}

export function analyzeEffectText(input: string, options: EffectAnalysisOptions = {}): Analysis {
  const text = normalize(input);
  if (!text) return { status: "failure", outcome: "analysis_failure", effects: [], keywords: [], unsupportedSegments: ["효과 문장"], summaries: ["효과 문장을 입력해 주세요."] };
  const triggerMarkers = [...text.matchAll(/(?:^|\s)(?=(?:필드에\s*)?(?:등장|퇴장|액티브|준비|콤보|주문|태그|핀폴|턴\s*시작|턴\s*종료|(?:이\s*카드가|자신이)\s*공격할\s*때마다|MAGIC|TURBO|SELF_ATTACK|SUPPORT|SHOCK|SYNERGY|BULLSEYE)\s*[:：])/gi)]
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
      return pair ? [{ trigger: "ENTER_FIELD" as Trigger, action: "BUFF" as Action, target: targetFor("자신"), values: { attack: Number(pair[1]), health: Number(pair[2]) } }] : [];
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
    ...(trigger === "CARD_PLAYED_THIS_TURN" ? [{ type: "HAS_MATCHING_TAG_PLAYED_THIS_TURN" as const }] : []),
  ];
  const recognized: Array<[Action, RegExp]> = [
    ["ADD_NEXT_TURN_GOLD", /다음(?:\s*내)?\s*턴(?:에)?\s*(?:추가\s*)?(?:골드(?:를|을)?\s*(?:추가로?\s*)?[+]?\d+\s*(?:g|골드)?|\d+\s*g|골드\s*\d+\s*추가)(?:\s*더)?(?:\s*받(?:습니다|는다|음)?)?/i],
    ["ADD_GOLD", /(?:현재\s*)?(?:\d+\s*(?:g|골드)|골드(?:를|을)?\s*[+]?\d+|현재\s*골드\s*[+]\d+)\s*(?:획득|얻(?:음|습니다)?|추가)?/i],
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
     ["SUMMON", /(?:소환|SUMMON)/i], ["GENERATE", /(?:생성(?!된)|GENERATE)/i],
    ["REMOVE_KEYWORD", /(?:러쉬|기습|도발|회피|연타)(?:를|을)?\s*(?:제거|잃)/],
    ["ADD_KEYWORD", /(?:러쉬|기습|도발|회피|연타)(?:를|을)?\s*(?:부여|얻)/],
  ];
  const effects: StructuredEffect[] = [];
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
    remainder += ` ${clauseRemainder}`;
  }
     remainder = remainder.replace(/사용될\s*때까지(?:\s*\S+){0,5}\s*유지(?:합니다)?|다음\s*턴에도(?:\s*\S+){0,2}\s*유지(?:합니다)?/g, "");
     remainder = remainder.replace(/자신의\s*양\s*옆\s*(?:빈\s*)?슬롯(?:에)?|양\s*옆\s*(?:빈\s*)?슬롯(?:에)?|각각|이\s*카드가\s*필드에\s*있(?:는\s*동안|을\s*때)|\d+\s*(?:코스트|비용)\s*이상/g, "");
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
    remainder = remainder.replace(/(합니다|시키고|시킵니다|시킨다|증가시킨다|올린다|강화한다|부여|획득|얻음|얻습니다|줍니다|준다|주|드로우|뽑습니다|뽑기|포획|제거|소환|생성|해방|감소|증가|선택하여|선택해서|선택하고)/g, "");
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
    if (schema.target) {
      const zones = target?.zones ?? (target?.zone ? [target.zone] : []);
      const hasValidZones = Boolean(target) && zones.length > 0 && zones.length <= TARGET_ZONES.length &&
        new Set(zones).size === zones.length && zones.every((zone) => TARGET_ZONES.includes(zone));
      if (!hasValidZones || !target || !TARGET_OWNERS.includes(target.owner) || !TARGET_SELECTIONS.includes(target.selection) || !Number.isInteger(target.count) || target.count < 1 || target.count > 20 || (target.selection === "PLAYER_CHOICE" && target.count !== 1)) return false;
      if (target.zone && target.zones) return false;
      if (item.trigger === "ACTIVE" && target.selection === "PLAYER_CHOICE") return false;
      if (target.owner === "ALL" && (zones.length !== 1 || zones[0] !== "CHARACTER" || target.selection !== "ALL")) return false;
      if (target.selection === "ALL" && target.count < 1) return false;
      if (zones.some((zone) => zone === "CHARACTER") && ["REDUCE_COST", "INCREASE_COST"].includes(item.action)) return false;
      if (zones.some((zone) => zone === "PLAYER") && !(zones.length === 1 && ((item.action === "DAMAGE" && target.owner === "ENEMY" && target.selection === "SELF") || (item.action === "HEAL" && target.owner === "SELF" && target.selection === "SELF")))) return false;
       if (target.filter && (
         typeof target.filter !== "object" ||
         target.filter === null ||
         target.filter.isGenerated !== undefined && typeof target.filter.isGenerated !== "boolean" ||
         target.filter.minCost !== undefined && (!Number.isInteger(target.filter.minCost) || target.filter.minCost < 0 || target.filter.minCost > 999)
       )) return false;
      if (target.randomScope !== undefined && (!RANDOM_SCOPES.includes(target.randomScope) || !["RANDOM", "ADJACENT_EMPTY_SLOTS"].includes(target.selection))) return false;
    } else if (target !== undefined && !(["SUMMON", "GENERATE"].includes(item.action) && ["RANDOM", "ADJACENT_EMPTY_SLOTS"].includes(target.selection))) return false;
    if (schema.amount && !(typeof values?.amount === "number" && Number.isFinite(values.amount) && values.amount >= 0 && values.amount <= 999)) return false;
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
       if (!validStats && !validMultiplier && !validReference) return false;
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
      if (item.action === "GENERATE" && values?.destination !== undefined && values.destination !== "HAND" && values.destination !== "DECK") return false;
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