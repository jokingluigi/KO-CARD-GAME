import {
  ACTION_SCHEMAS, ACTIONS, EFFECT_LIBRARY, KEYWORDS, TARGET_OWNERS,
  TARGET_SELECTIONS, TARGET_ZONES, TRIGGERS,
  type Action, type Keyword, type TargetOwner, type TargetSelection,
  type TargetZone, type Trigger,
} from "@workspace/effect-registry";

export { ACTIONS, KEYWORDS, TRIGGERS };
export type { Action, Keyword, Trigger };
export type Target = { zone: TargetZone; owner: TargetOwner; cardType?: "WRESTLER"; selection: TargetSelection; count: number };
export type StructuredEffect = { trigger: Trigger; action: Action; target?: Target; values?: { attack?: number; health?: number; amount?: number; keyword?: Keyword } };
export type AnalysisOutcome = "supported" | "mechanism_required" | "analysis_failure";
export type Analysis = { status: "success" | "partial" | "failure"; outcome: AnalysisOutcome; effects: StructuredEffect[]; keywords: Keyword[]; unsupportedSegments: string[]; summaries: string[]; reason?: string };

const aliases = {
  trigger: [
    ["ENTER_FIELD", /^(?:필드에\s*)?(?:등장(?:할\s*때|하면)?|필드에\s*나올\s*때|소환될\s*때)\s*[:：]?/],
    ["LEAVE_FIELD", /^(?:필드에서\s*)?퇴장(?:할\s*때|하면)?\s*[:：]?/],
    ["ACTIVE", /^액티브(?:\s*사용)?(?:하면)?\s*[:：]?/],
  ] as const,
  keyword: [
    ["RUSH", /러쉬/], ["SURPRISE", /기습/], ["TAUNT", /도발/],
    ["DODGE", /회피/], ["MULTI_STRIKE", /연타/],
  ] as const,
} as const;

export function effectLibrary() {
  return EFFECT_LIBRARY;
}

function normalize(input: string) {
  return input.normalize("NFC").replace(/[：:]/g, ":").replace(/[.。!！?？]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/(시킵니다|합니다|습니다|한다|해요|하세요|하기|얻기|줍니다|준다)$/g, "").trim();
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
function targetFor(text: string): Target {
  if (/모든\s*캐릭터/.test(text)) return { zone: "CHARACTER", owner: "ALL", selection: "ALL", count: targetCountFrom(text) };
  if (/(상대|적)\s*캐릭터/.test(text)) return { zone: "CHARACTER", owner: "ENEMY", selection: "PLAYER_CHOICE", count: targetCountFrom(text) };
  if (/(아군|내)\s*캐릭터/.test(text)) return { zone: "CHARACTER", owner: "SELF", selection: "PLAYER_CHOICE", count: targetCountFrom(text) };
  if (/(상대|적)\s*(챔피언|플레이어)/.test(text)) return { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 };
  if (/(?:내|자신의)\s*챔피언/.test(text)) return { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 };
  if (/(자신|이\s*카드)/.test(text)) return { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 };
  const hand = /손패/.test(text), enemy = /(적|상대)\s*선수/.test(text);
  const random = /(무작위|랜덤)/.test(text), all = /(모든|전부)/.test(text);
  return { zone: hand ? "HAND" : "BOARD", owner: enemy ? "ENEMY" : "SELF", cardType: "WRESTLER", selection: random ? "RANDOM" : all ? "RANDOM" : "PLAYER_CHOICE", count: targetCountFrom(text) };
}
function keywordFor(text: string): Keyword | undefined {
  return aliases.keyword.find(([, pattern]) => pattern.test(text))?.[0];
}
function effect(trigger: Trigger, action: Action, body: string, index: number, priorTarget?: Target): StructuredEffect | null {
  const schema = ACTION_SCHEMAS[action], values: StructuredEffect["values"] = {};
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
  if (schema.stats) {
    const pair = body.match(/([+-]\d+)\s*\/\s*([+-]\d+)/);
    if (!pair) return null;
    values.attack = Number(pair[1]); values.health = Number(pair[2]);
  }
  if (schema.keyword) { const keyword = keywordFor(body); if (!keyword) return null; values.keyword = keyword; }
  const explicitTarget = /(자신|이\s*카드|모든\s*캐릭터|(?:적|상대)\s*(?:선수|챔피언|플레이어|캐릭터)|(?:아군|내)\s*캐릭터|손패)/.test(body);
  return { trigger, action, ...(schema.target ? { target: !explicitTarget && priorTarget ? { ...priorTarget, selection: "SAME_TARGET" } : targetFor(body) } : {}), ...(Object.keys(values).length ? { values } : {}) };
}

export function analyzeEffectText(input: string): Analysis {
  const text = normalize(input);
  if (!text) return { status: "failure", outcome: "analysis_failure", effects: [], keywords: [], unsupportedSegments: ["효과 문장"], summaries: ["효과 문장을 입력해 주세요."] };
  const unsupportedMechanic = /(서로\s*)?(무작위로\s*)?(섞|재배치|교환)|시간을?\s*멈(?:추|춥)|전\s*상태로\s*되돌/;
  const mechanicMatch = text.match(unsupportedMechanic);
  const triggerEntry = aliases.trigger.find(([, pattern]) => pattern.test(text));
  if (!triggerEntry) {
    const keyword = keywordFor(text);
    if (keyword && /^(러쉬|기습|도발|회피|연타)$/.test(text)) return { status: "success", outcome: "supported", effects: [], keywords: [keyword], unsupportedSegments: [], summaries: [`기본 키워드 · ${keyword}`] };
    return { status: "failure", outcome: "analysis_failure", effects: [], keywords: [], unsupportedSegments: [text], summaries: ["지원하는 Trigger Registry 항목을 찾지 못했습니다."], reason: "발동 조건 또는 효과 의도를 충분히 이해하지 못했습니다." };
  }
  const trigger = triggerEntry[0] as Trigger;
  const body = text.replace(triggerEntry[1], "").trim();
  const recognized: Array<[Action, RegExp]> = [
    ["ADD_NEXT_TURN_GOLD", /다음(?:\s*내)?\s*턴(?:에)?\s*(?:추가\s*)?(?:골드\s*[+]?\d+|\d+\s*g|골드\s*\d+\s*추가)/i],
    ["ADD_GOLD", /(?:현재\s*)?(?:\d+\s*(?:g|골드)|골드(?:를|을)?\s*[+]?\d+|현재\s*골드\s*[+]\d+)\s*(?:획득|얻(?:음|습니다)?|추가)?/i],
    ["DRAW", /(?:(?:카드)?\s*(?:\d+\s*장|한\s*장|\d+)\s*(?:드로우|뽑(?:기|습니다|는다|음)?))/],
    ["BUFF", /[+-]\d+\s*\/\s*[+-]\d+/],
    ["DAMAGE", /(?:(?:피해|데미지)\s*\d+|\d+\s*(?:피해|데미지))/],
    ["HEAL", /(?:체력(?:을|를)?\s*[+]?\d+\s*(?:회복|치유)|\d+(?:만큼)?\s*(?:회복|치유))/],
    ["REDUCE_COST", /(?:비용|코스트)(?:을|를)?\s*(?:-\d+|\d+\s*(?:감소|낮))/],
    ["INCREASE_COST", /(?:비용|코스트)(?:을|를)?\s*(?:[+]\d+|\d+\s*증가)/],
    ["STUN", /기절(?:시키)?/],
    ["SILENCE", /침묵(?:시키(?:고|니다)?|)/], ["DESTROY", /파괴/],
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
      const match = matcher.exec(clause);
      if (!match) continue;
      const parsed = effect(trigger, action, clause, effects.length, priorTarget);
      if (parsed) {
        effects.push(parsed);
        if (parsed.target && parsed.target.selection !== "SAME_TARGET") priorTarget = parsed.target;
      }
      clauseRemainder = clauseRemainder.replace(matcher, " ");
    }
    remainder += ` ${clauseRemainder}`;
  }
  remainder = remainder.replace(/선택한|모든\s*캐릭터(?:에게|을|를)?|(?:적|상대)\s*선수(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:적|상대)\s*캐릭터(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:아군|내)\s*캐릭터(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를)?|(?:적|상대)\s*(?:챔피언|플레이어)(?:에게|을|를)?|손패의\s*(?:무작위\s*)?선수(?:\s*카드)?(?:\s*(?:\d+\s*장|하나|한\s*장))?(?:에게|을|를|의)?|(?:자신|이\s*카드)(?:에게|을|를)?|(?:카드\s*)?(?:\d+\s*장|한\s*장)|\d+\s*턴\s*동안|(?:에게|을|를|의|에)|(?:그리고|그\s*후|이후|하고|한\s*뒤|한\s*후|주고)|\s+/g, "");
  // Action endings remain after matcher only for Korean conjugations.
  remainder = remainder.replace(/(합니다|시키고|시킵니다|부여|획득|얻음|얻습니다|줍니다|준다|주|드로우|뽑습니다|뽑기)/g, "");
  const unsupportedSegments = [...(mechanicMatch ? [mechanicMatch[0]] : []), ...(remainder.replace(unsupportedMechanic, "").trim() ? [remainder.replace(unsupportedMechanic, "").trim()] : [])];
  if (trigger === "ACTIVE" && effects.some((item) => item.target?.selection === "PLAYER_CHOICE")) unsupportedSegments.push("ACTIVE Trigger Registry는 직접 대상 선택을 아직 지원하지 않습니다.");
  const status = mechanicMatch || unsupportedSegments.length ? effects.length || mechanicMatch ? "partial" : "failure" : "success";
  return { status, outcome: mechanicMatch ? "mechanism_required" : status === "success" ? "supported" : "analysis_failure", effects, keywords: [], unsupportedSegments, summaries: [...effects.map((item) => `${item.trigger === "ENTER_FIELD" ? "등장" : item.trigger} · ${item.action}${item.values?.amount !== undefined ? ` · ${item.values.amount}` : ""}${item.values?.keyword ? ` · ${item.values.keyword}` : ""}`), ...(mechanicMatch ? ["새 메커니즘 필요 · 기존 Effect Library에 해당 동작이 없습니다."] : [])], ...(status === "success" ? {} : { reason: mechanicMatch ? "인식된 대상/의도는 있지만 값을 서로 섞거나 게임 시간을 멈추거나 되돌리는 범용 Effect는 현재 지원되지 않습니다. 부분 효과는 적용되지 않습니다." : "문장의 일부를 효과로 해석하지 못했습니다. 표현을 더 구체적으로 입력해 주세요." }) };
}

export function isStructuredEffects(value: unknown): value is { effects: StructuredEffect[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const effects = (value as { effects?: unknown }).effects;
  if (!Array.isArray(effects) || effects.length < 1 || effects.length > 10) return false;
  return effects.every((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const item = raw as StructuredEffect;
    if (!TRIGGERS.includes(item.trigger) || !ACTIONS.includes(item.action)) return false;
    const schema = ACTION_SCHEMAS[item.action], target = item.target, values = item.values;
    if (schema.target) {
      if (!target || !TARGET_ZONES.includes(target.zone) || !TARGET_OWNERS.includes(target.owner) || !TARGET_SELECTIONS.includes(target.selection) || !Number.isInteger(target.count) || target.count < 1 || target.count > 20 || (target.selection === "PLAYER_CHOICE" && target.count !== 1)) return false;
      if (item.trigger === "ACTIVE" && target.selection === "PLAYER_CHOICE") return false;
      if (target.owner === "ALL" && (target.zone !== "CHARACTER" || target.selection !== "ALL")) return false;
      if (target.selection === "ALL" && target.owner !== "ALL") return false;
      if (target.zone === "CHARACTER" && ["REDUCE_COST", "INCREASE_COST"].includes(item.action)) return false;
      if (target.zone === "PLAYER" && !((item.action === "DAMAGE" && target.owner === "ENEMY" && target.selection === "SELF") || (item.action === "HEAL" && target.owner === "SELF" && target.selection === "SELF"))) return false;
    } else if (target !== undefined) return false;
    if (schema.amount && !(typeof values?.amount === "number" && Number.isFinite(values.amount) && values.amount >= 0 && values.amount <= 999)) return false;
    if (schema.stats && !(typeof values?.attack === "number" && typeof values.health === "number" && Math.abs(values.attack) <= 999 && Math.abs(values.health) <= 999)) return false;
    return !schema.keyword || KEYWORDS.includes(values?.keyword as Keyword);
  });
}