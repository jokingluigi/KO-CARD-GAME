import {
  ACTION_SCHEMAS, ACTIONS, CONDITIONS, DEFAULT_CARD_TARGET_SCOPE, EFFECT_CAPABILITIES, EFFECT_LIBRARY, KEYWORDS, TARGET_OWNERS,
  RANDOM_SCOPES, TARGET_SELECTIONS, TARGET_ZONES, TRIGGERS,
  type Action, type Condition, type Keyword, type TargetOwner, type TargetSelection,
  type RandomScope, type TargetZone, type Trigger,
} from "@workspace/effect-registry";

export { ACTIONS, KEYWORDS, TRIGGERS };
export type { Action, Keyword, Trigger };
export type Target = {
  zone?: TargetZone;
  zones?: TargetZone[];
  owner: TargetOwner;
  cardType?: "WRESTLER" | "TECHNIQUE";
  filter?: { isGenerated?: boolean };
  selection: TargetSelection;
  count: number;
  randomScope?: RandomScope;
};
export type EffectCondition = { type: Condition; expression?: string };
export type StructuredEffect = { trigger: Trigger; action: Action; target?: Target; conditions?: EffectCondition[]; values?: { attack?: number; health?: number; attackMultiplier?: number; healthMultiplier?: number; amount?: number; keyword?: Keyword; leftEffects?: StructuredEffect[]; rightEffects?: StructuredEffect[] } };
export type AnalysisOutcome = "supported" | "mechanism_required" | "analysis_failure";
export type Analysis = { status: "success" | "partial" | "failure"; outcome: AnalysisOutcome; effects: StructuredEffect[]; keywords: Keyword[]; unsupportedSegments: string[]; summaries: string[]; reason?: string };

const aliases = {
  trigger: [
    ["ENTER_FIELD", /^(?:필드에\s*)?(?:등장|MAGIC)(?:할\s*때|하면)?\s*[:：]?/i],
    ["LEAVE_FIELD", /^(?:필드에서\s*)?퇴장(?:할\s*때|하면)?\s*[:：]?/],
    ["ACTIVE", /^액티브(?:\s*사용)?(?:하면)?\s*[:：]?/],
    ["CARD_DRAWN", /^(?:준비|TURBO)\s*[:：]?/i],
    ["OTHER_ALLY_ATTACK", /^(?:콤보|SUPPORT)\s*[:：]?/i],
    ["TECHNIQUE_CAST", /^(?:주문|SHOCK)\s*[:：]?/i],
    ["CARD_PLAYED_THIS_TURN", /^(?:태그|SYNERGY)\s*[:：]?/i],
    ["EXACT_ZERO_DAMAGE", /^(?:핀폴|BULLSEYE)\s*[:：]?/i],
  ] as const,
  keyword: [
    ["RUSH", /(?:러쉬|RUSH|CHARGE)/i], ["SURPRISE", /(?:기습|HASTE)/i], ["TAUNT", /(?:도발|TAUNT)/i],
    ["DODGE", /(?:회피(?:\(\d+\))?|DODGE)/i], ["MULTI_STRIKE", /연타/],
  ] as const,
} as const;

const STAT_MULTIPLIER_PATTERN = /(?:자신(?:의|에게)?\s*)?(?:현재\s*)?(?:공격(?:력)?\s*(?:과|\/|및)\s*체력|체력\s*(?:과|\/|및)\s*공격(?:력)?)(?:의\s*)?(?:(?:수치(?:를|가)?)|(?:을|를))?\s*(\d+(?:\.\d+)?)\s*배(?:로)?(?:\s*(?:만들|변경|합니다|한다))?/i;
const STAT_SWAP_PATTERN = /(?:자신(?:의|에게)?\s*)?(?:현재\s*)?(?:공격(?:력)?\s*(?:과|\/|및)\s*체력|체력\s*(?:과|\/|및)\s*공격(?:력)?)[^.!?]{0,30}?(?:서로\s*)?(?:교환|바꾸|바꿉니다)/i;
const ACTIVE_CARD_SCOPE_PATTERN = /(?:어디에\s*(?:있든|있는)|모든\s*위치의|손패\s*[,，]\s*덱\s*[,，]\s*(?:필드|보드)|손패\s*(?:및|와|과)\s*덱\s*(?:및|와|과)\s*(?:필드|보드))/;
const GENERATED_FILTER_PATTERN = /(?:생성된|생성\s*카드|GENERATED)/i;

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
function targetFor(text: string, randomPool = false): Target {
  if (/모든\s*캐릭터/.test(text)) return { zone: "CHARACTER", owner: "ALL", selection: "ALL", count: targetCountFrom(text) };
  if (/(상대|적)\s*캐릭터/.test(text)) return { zone: "CHARACTER", owner: "ENEMY", selection: "PLAYER_CHOICE", count: targetCountFrom(text) };
  if (/(아군|내)\s*캐릭터/.test(text)) return { zone: "CHARACTER", owner: "SELF", selection: "PLAYER_CHOICE", count: targetCountFrom(text) };
  if (/(상대|적)\s*(챔피언|플레이어)/.test(text)) return { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 };
  if (/(?:내|자신의)\s*챔피언/.test(text)) return { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 };
  const generated = GENERATED_FILTER_PATTERN.test(text);
  const activeCardScope = ACTIVE_CARD_SCOPE_PATTERN.test(text);
  if (/(자신|이\s*카드)/.test(text)) return { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 };
  const hand = /손패/.test(text), deck = /덱/.test(text), enemy = /(적|상대)\s*선수/.test(text);
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
  if (activeCardScope) {
    return {
      zones: [...DEFAULT_CARD_TARGET_SCOPE],
      owner: enemy ? "ENEMY" : "SELF",
      ...(cardType ? { cardType } : {}),
      ...(generated ? { filter: { isGenerated: true } } : {}),
      selection: "ALL",
      count: 20,
    };
  }
  if (randomPool && randomTarget) {
    return {
      zones: [...DEFAULT_CARD_TARGET_SCOPE],
      owner: "SELF",
      ...(cardType ? { cardType } : {}),
      ...(generated ? { filter: { isGenerated: true } } : {}),
      selection: "RANDOM",
      count: targetCountFrom(text),
      randomScope,
    };
  }
  return {
    zone: deck ? "DECK" : hand ? "HAND" : "BOARD",
    owner: enemy ? "ENEMY" : "SELF",
    ...(cardType ? { cardType } : {}),
    ...(generated ? { filter: { isGenerated: true } } : {}),
    selection: random ? "RANDOM" : all ? "ALL" : "PLAYER_CHOICE",
    count: all ? 20 : targetCountFrom(text),
    ...(randomTarget ? { randomScope } : {}),
  };
}
function keywordFor(text: string): Keyword | undefined {
  return aliases.keyword.find(([, pattern]) => pattern.test(text))?.[0];
}
function effect(trigger: Trigger, action: Action, body: string, index: number, priorTarget?: Target, conditions?: EffectCondition[]): StructuredEffect | null {
  const schema = ACTION_SCHEMAS[action], values: StructuredEffect["values"] = {};
  const statMultiplier = schema.statMultiplier ? body.match(STAT_MULTIPLIER_PATTERN) : null;
  if (schema.statMultiplier && statMultiplier) {
    const multiplier = Number(statMultiplier[1]);
    if (!Number.isFinite(multiplier)) return null;
    values.attackMultiplier = multiplier;
    values.healthMultiplier = multiplier;
  }
  if (schema.amount) {
    const amountText = action === "DAMAGE"
      ? (body.match(/(?:피해|데미지)\s*(\d+)|(\d+)\s*(?:피해|데미지)/)?.[1] ?? body.match(/(?:피해|데미지)\s*(\d+)|(\d+)\s*(?:피해|데미지)/)?.[2])
      : action === "DRAW"
        ? (body.match(/(?:카드\s*)?(\d+)\s*장|(\d+)\s*드로우/)?.[1] ?? body.match(/(?:카드\s*)?(\d+)\s*장|(\d+)\s*드로우/)?.[2])
        : ["REDUCE_COST", "INCREASE_COST"].includes(action)
          ? body.match(/(?:비용|코스트)(?:을|를)?\s*(?:[+-]?(\d+)|(\d+)\s*(?:감소|증가|낮))/)?.[1] ?? body.match(/(?:비용|코스트)(?:을|를)?\s*(?:[+-]?(\d+)|(\d+)\s*(?:감소|증가|낮))/)?.[2]
          : undefined;
    values.amount = amountText ? Number(amountText) : numberFrom(body);
  }
  if (schema.stats && !statMultiplier) {
    const pair = body.match(/([+-]\d+)\s*\/\s*([+-]\d+)/);
    const singleStat = body.match(/(공격력|체력)\s*([+-]\d+)/);
    if (!pair && !singleStat) return null;
    values.attack = pair ? Number(pair[1]) : singleStat?.[1] === "공격력" ? Number(singleStat[2]) : 0;
    values.health = pair ? Number(pair[2]) : singleStat?.[1] === "체력" ? Number(singleStat[2]) : 0;
  }
  if (schema.keyword) { const keyword = keywordFor(body); if (!keyword) return null; values.keyword = keyword; }
  const explicitTarget = /(자신|이\s*카드|모든\s*캐릭터|모든\s*(?:생성된\s*)?선수|(?:적|상대)\s*(?:선수|챔피언|플레이어|캐릭터)|(?:아군|내)\s*캐릭터|손패|생성된|어디에\s*(?:있든|있는)|모든\s*위치의|손패\s*[,，]\s*덱\s*[,，]\s*(?:필드|보드))/.test(body);
  const randomPoolAction = action === "SUMMON" || action === "GENERATE";
  return {
    trigger,
    action,
    ...((schema.target || (randomPoolAction && /(무작위|랜덤)/.test(body)))
      ? { target: !explicitTarget && priorTarget ? { ...priorTarget, selection: "SAME_TARGET" } : targetFor(body, randomPoolAction) }
      : {}),
    ...(conditions?.length ? { conditions } : {}),
    ...(Object.keys(values).length ? { values } : {}),
  };
}

export function analyzeEffectText(input: string): Analysis {
  const text = normalize(input);
  if (!text) return { status: "failure", outcome: "analysis_failure", effects: [], keywords: [], unsupportedSegments: ["효과 문장"], summaries: ["효과 문장을 입력해 주세요."] };
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
    (/(공격력|체력|비용|값|순서|위치)/.test(text) && /(무작위|랜덤|서로)/.test(text) && !STAT_SWAP_PATTERN.test(text));
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
  if (!triggerEntry) {
    const keyword = keywordFor(text);
    if (keyword && /^(?:러쉬|RUSH|CHARGE|기습|HASTE|도발|TAUNT|회피(?:\(\d+\))?|DODGE|연타)$/i.test(text)) return { status: "success", outcome: "supported", effects: [], keywords: [keyword], unsupportedSegments: [], summaries: [`기본 키워드 · ${keyword}`] };
    if (/^(?:침묵|SILENCE|기절|PARALYZE|포획|CATCH|제거|ERASE)$/i.test(text)) return { status: "success", outcome: "supported", effects: [], keywords: [], unsupportedSegments: [], summaries: [`기본 동작 · ${text}`] };
    return { status: "failure", outcome: "analysis_failure", effects: [], keywords: [], unsupportedSegments: [text], summaries: ["지원하는 Trigger Registry 항목을 찾지 못했습니다."], reason: "발동 조건 또는 효과 의도를 충분히 이해하지 못했습니다." };
  }
  const trigger = triggerEntry[0] as Trigger;
  const body = analyzableText.replace(triggerEntry[1], "").trim();
  const conditions: EffectCondition[] = [
    ...(needMatch ? [{ type: "NEED_CONDITION" as const, expression: needMatch[1]!.trim() }] : []),
    ...(trigger === "CARD_PLAYED_THIS_TURN" ? [{ type: "HAS_MATCHING_TAG_PLAYED_THIS_TURN" as const }] : []),
  ];
  const recognized: Array<[Action, RegExp]> = [
    ["ADD_NEXT_TURN_GOLD", /다음(?:\s*내)?\s*턴(?:에)?\s*(?:추가\s*)?(?:골드\s*[+]?\d+|\d+\s*g|골드\s*\d+\s*추가)/i],
    ["ADD_GOLD", /(?:현재\s*)?(?:\d+\s*(?:g|골드)|골드(?:를|을)?\s*[+]?\d+|현재\s*골드\s*[+]\d+)\s*(?:획득|얻(?:음|습니다)?|추가)?/i],
    ["DRAW", /(?:(?:카드)?\s*(?:\d+\s*장|한\s*장|\d+)(?:을|를)?\s*(?:드로우|뽑(?:기|습니다|는다|음)?))/],
    ["SWAP_STATS", STAT_SWAP_PATTERN],
    ["BUFF", /(?:[+-]\d+\s*\/\s*[+-]\d+|(?:공격력|체력)\s*[+-]\d+|(?:자신(?:의|에게)?\s*)?(?:현재\s*)?(?:공격(?:력)?\s*(?:과|\/|및)\s*체력|체력\s*(?:과|\/|및)\s*공격(?:력)?)(?:의\s*)?(?:(?:수치(?:를|가)?)|(?:을|를))?\s*\d+(?:\.\d+)?\s*배(?:로)?)/],
    ["DAMAGE", /(?:(?:피해|데미지)\s*\d+|\d+\s*(?:피해|데미지))/],
    ["HEAL", /(?:체력(?:을|를)?\s*[+]?\d+\s*(?:회복|치유)|\d+(?:만큼)?\s*(?:회복|치유))/],
    ["REDUCE_COST", /(?:비용|코스트)(?:을|를)?\s*(?:-\d+|\d+\s*(?:감소|낮))/],
    ["INCREASE_COST", /(?:비용|코스트)(?:을|를)?\s*(?:[+]\d+|\d+\s*증가)/],
    ["STUN", /(?:기절|PARALYZE)(?:시키)?/i],
    ["SILENCE", /침묵(?:시키(?:고|니다)?|)/], ["DESTROY", /파괴/],
    ["RELEASE_CAPTURED", /(?:포획.*(?:해방|풀)|해방.*포획)/], ["CAPTURE", /포획/],
    ["REMOVE_FROM_GAME", /(?:제거|ERASE)/i], ["SUMMON", /(?:소환|SUMMON)/i], ["GENERATE", /(?:생성(?!된)|GENERATE)/i],
    ["REMOVE_KEYWORD", /(?:러쉬|기습|도발|회피|연타)(?:를|을)?\s*(?:제거|잃)/],
    ["ADD_KEYWORD", /(?:러쉬|기습|도발|회피|연타)(?:를|을)?\s*(?:부여|얻)/],
  ];
  const effects: StructuredEffect[] = [];
  let remainder = "";
  let priorTarget: Target | undefined;
  const clauses = body.split(/\s*(?:그리고|그\s*후|이후|(?:시키)?고|한\s*뒤|한\s*후)\s*/);
  for (const clause of clauses) {
    let clauseRemainder = clause;
    for (const [action, matcher] of recognized) {
      if (!isActiveAction(action)) continue;
      const match = matcher.exec(clause);
      if (!match) continue;
       const parsed = effect(trigger, action, clause, effects.length, priorTarget, conditions);
      if (parsed) {
        effects.push(parsed);
        if (parsed.target && parsed.target.selection !== "SAME_TARGET") priorTarget = parsed.target;
      }
      clauseRemainder = clauseRemainder.replace(matcher, " ");
    }
    remainder += ` ${clauseRemainder}`;
  }
    remainder = remainder.replace(/(?:완전(?:히)?\s*)?(?:무작위|랜덤)(?:로)?\s*(?:선수|기술)?\s*(?:카드)?\s*(?:\d+\s*장|하나|한\s*장)?(?:에게|을|를|의)?|선택한|어디에\s*(?:있든|있는)|모든\s*위치의|손패\s*[,，]\s*덱\s*[,，]\s*(?:필드|보드)|손패\s*(?:및|와|과)\s*덱\s*(?:및|와|과)\s*(?:필드|보드)|생성된(?:\s*카드)?|모든\s*캐릭터(?:에게|을|를)?|모든\s*(?:선수|카드)(?:에게|을|를|의)?|(?:적|상대)\s*(?:챔피언|플레이어)(?:에게|을|를)?|(?:내|자신의)\s*챔피언(?:에게|을|를)?|(?:적|상대)\s*선수(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:아군|내)\s*선수(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:적|상대)\s*캐릭터(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:아군|내)\s*캐릭터(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:손패|덱|필드|보드)(?!의?\s*(?:무작위\s*)?(?:선수|카드))(?:의)?|손패의\s*(?:무작위\s*)?선수(?:\s*카드)?(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를|의)?|덱의\s*(?:무작위\s*)?(?:선수|카드)(?:\s*카드)?(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를|의)?|필드의\s*(?:무작위\s*)?(?:선수|카드)(?:\s*카드)?(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를|의)?|(?:자신|이\s*카드)(?:에게|을|를)?|(?:카드\s*)?(?:\d+\s*장|한\s*장)|선수(?:\s*카드)?(?:을|를)?|\d+\s*턴\s*동안|(?:에게|을|를|의|에)|(?:그리고|그\s*후|이후|하고|한\s*뒤|한\s*후|주고)|\s+/g, "");
  // Action endings remain after matcher only for Korean conjugations.
   remainder = remainder.replace(/(합니다|시키고|시킵니다|부여|획득|얻음|얻습니다|줍니다|준다|주|드로우|뽑습니다|뽑기|포획|제거|소환|생성|해방|감소|증가)/g, "");
  const remainderUnsupported = remainder.replace(unsupportedMechanic, "").trim();
  const unsupportedSegments = [
    ...(mechanicRequired && !STAT_SWAP_PATTERN.test(text) ? [unsupportedDescription] : []),
    ...(!mechanicRequired && remainderUnsupported ? [remainderUnsupported] : []),
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
    ...(status === "success"
      ? {}
      : {
          reason: mechanicRequired
            ? "인식된 대상/의도는 있지만 현재 Effect Library에 해당 범용 동작이 없습니다. 특정 카드 전용 구현 대신 재사용 가능한 메커니즘이 필요합니다."
            : "문장의 일부를 효과로 해석하지 못했습니다. 표현을 더 구체적으로 입력해 주세요.",
        }),
  };
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
      if (target.filter && (typeof target.filter !== "object" || target.filter === null || target.filter.isGenerated !== undefined && typeof target.filter.isGenerated !== "boolean")) return false;
      if (target.randomScope !== undefined && (!RANDOM_SCOPES.includes(target.randomScope) || target.selection !== "RANDOM")) return false;
    } else if (target !== undefined && !(["SUMMON", "GENERATE"].includes(item.action) && target.selection === "RANDOM")) return false;
    if (schema.amount && !(typeof values?.amount === "number" && Number.isFinite(values.amount) && values.amount >= 0 && values.amount <= 999)) return false;
    if (schema.stats || schema.statMultiplier) {
      const validStats = schema.stats &&
        typeof values?.attack === "number" && typeof values.health === "number" &&
        Math.abs(values.attack) <= 999 && Math.abs(values.health) <= 999;
      const validMultiplier = schema.statMultiplier &&
        typeof values?.attackMultiplier === "number" && typeof values.healthMultiplier === "number" &&
        Number.isFinite(values.attackMultiplier) && Number.isFinite(values.healthMultiplier) &&
        values.attackMultiplier >= 0 && values.attackMultiplier <= 10 &&
        values.healthMultiplier >= 0 && values.healthMultiplier <= 10;
      if (!validStats && !validMultiplier) return false;
    }
    if (schema.keyword && !KEYWORDS.includes(values?.keyword as Keyword)) return false;
    if (schema.branches && (!Array.isArray(values?.leftEffects) || !Array.isArray(values?.rightEffects))) return false;
    return !item.conditions || item.conditions.every((condition) => CONDITIONS.includes(condition.type));
  });
}