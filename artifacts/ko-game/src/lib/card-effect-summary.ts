import type { CardDefinition } from "../game/cards/types";

/**
 * A plain-language fingerprint of what a card actually does in a match (its resolved abilities and
 * keywords), used by the admin card studio to tell whether a text edit changes the card's effects.
 */
const TRIGGERS: Record<string, string> = {
  ENTER_FIELD: "등장",
  LEAVE_FIELD: "퇴장",
  SELF_RETIRE: "리타이어될 때",
  ACTIVE: "필드에 있는 동안",
  POSITION: "자리 효과",
  GAME_START: "게임 시작",
  TURN_END: "턴 종료",
  TURN_START: "턴 시작",
  ON_ATTACK: "공격할 때",
  ON_DAMAGED: "데미지를 입을 때",
  ON_PLAY: "사용",
  CARD_ENTERED: "카드가 나올 때",
  SELF_ENTERED: "등장",
  OTHER_ALLY_ATTACK: "다른 아군이 공격할 때",
  SOURCE_RETIRED_TARGET: "상대를 리타이어시켰을 때",
  STAT_CHANGED: "능력치가 바뀔 때",
  SELF_DAMAGED: "데미지를 입을 때",
  EXACT_ZERO_DAMAGE: "딱 0이 될 때",
};

const KEYWORDS: Record<string, string> = {
  TAUNT: "도발", RUSH: "러쉬", SURPRISE: "기습", DODGE: "회피", DEFENSE: "방어", LIFESTEAL: "흡혈",
  HEAL: "치유", IMMUNE: "면역", MULTI_STRIKE: "연타", ARMOR: "아머", WANTED: "수배", CANNOT_ATTACK: "공격불가",
  PROGRAM: "프로그램", STUN: "기절", SILENCE: "침묵", DISABLED: "봉인", INVULNERABLE: "무적",
};

const ACTIONS: Record<string, string> = {
  DAMAGE: "데미지",
  DAMAGE_OPPONENT_CHAMPION: "상대 챔피언 데미지",
  HEAL: "회복",
  BUFF: "능력치 증가",
  MODIFY_ATTACK: "공격력 변화",
  MODIFY_HEALTH: "체력 변화",
  MODIFY_SELF_ATTACK: "자신 공격력 변화",
  GAIN_GOLD: "골드 획득",
  ADD_GOLD: "골드 획득",
  DRAW: "카드 드로우",
  DRAW_CARD: "카드 드로우",
  SUMMON: "소환",
  DESTROY: "파괴",
  RETIRE: "리타이어",
  SILENCE: "침묵",
  STUN: "기절",
  MOVE_TO_HAND: "손으로 되돌리기",
  REDUCE_COST: "비용 감소",
  GRANT_KEYWORD: "키워드 부여",
  ADD_KEYWORD: "키워드 부여",
  MODIFY_STAT: "능력치 변화",
  SET_STATS: "능력치 정하기",
  SWAP_STATS: "공격력·체력 바꾸기",
  GENERATE: "카드 만들기",
  REGISTER_LISTENER: "조건 효과 준비",
  ADD_NEXT_TURN_GOLD: "다음 턴 골드",
  PROGRAM: "프로그램",
  REVIVE: "되살리기",
  MOVE_TO_DECK: "덱으로 보내기",
  REMOVE_FROM_GAME: "소멸",
};

function value(effect: Record<string, unknown>): string {
  const parts: string[] = [];
  const labels: Record<string, string> = { amount: "", value: "", attack: "공격력 ", health: "체력 ", count: "", cost: "비용 " };
  for (const key of Object.keys(labels)) {
    const v = (effect as Record<string, unknown>)[key] ?? (effect.values as Record<string, unknown> | undefined)?.[key];
    if (typeof v === "number" && !(v === 0 && (key === "attack" || key === "health"))) parts.push(`${labels[key]}${v > 0 && labels[key] ? "+" : ""}${v}`);
  }
  return parts.join(" ");
}

function describeEffect(effect: Record<string, unknown>): string {
  const kind = String(effect.type ?? "");
  if (kind === "STRUCTURED") {
    const action = String(effect.action ?? "");
    const target = effect.target && typeof effect.target === "object" ? String((effect.target as Record<string, unknown>).type ?? (effect.target as Record<string, unknown>).kind ?? "") : "";
    return [ACTIONS[action] ?? "특수 효과", value(effect), /[가-힣]/.test(target) && `(${target})`].filter(Boolean).join(" ");
  }
  if (kind === "SCRIPT") {
    const script = effect.script as Record<string, unknown> | undefined;
    void script;
    return "특수 효과";
  }
  return [ACTIONS[kind] ?? "특수 효과", value(effect)].filter(Boolean).join(" ");
}

export function summarizeCardEffects(definition: CardDefinition): string[] {
  const lines: string[] = [];
  const abilities = (definition.abilities ?? []) as unknown as Array<Record<string, unknown>>;
  for (const ability of abilities) {
    const trigger = String(ability.trigger ?? "");
    const effects = (ability.effects as Array<Record<string, unknown>> | undefined) ?? [];
    const body = effects.map(describeEffect).filter(Boolean).join(", ") || "효과";
    lines.push(`${TRIGGERS[trigger] ?? "특수 조건"}: ${body}`);
  }
  if (definition.keywords?.length) lines.push(`키워드: ${definition.keywords.map((k) => { const [code, ...rest] = String(k).split(" "); return [KEYWORDS[code] ?? "특수 키워드", ...rest].join(" "); }).join(", ")}`);
  return lines;
}

/** Exact comparison of what two definitions do (wording and display fields ignored). */
export function sameCardEffects(a: CardDefinition, b: CardDefinition): boolean {
  const skip = new Set(["rulesText", "text", "name", "lore", "imageUrl", "effectText"]);
  const pick = (d: CardDefinition) =>
    JSON.stringify({ abilities: d.abilities, keywords: d.keywords, effectConfig: d.effectConfig }, (k, v) => (skip.has(k) ? undefined : v));
  return pick(a) === pick(b);
}
