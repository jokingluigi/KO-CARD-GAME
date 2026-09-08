/** The content-facing Effect DSL contract. Card and Champion administration use
 * this exact registry; English identifiers are stable implementation aliases. */
export const TRIGGERS = ["ENTER_FIELD", "LEAVE_FIELD", "ACTIVE", "CARD_DRAWN", "OTHER_ALLY_ATTACK", "TECHNIQUE_CAST", "CARD_PLAYED_THIS_TURN", "EXACT_ZERO_DAMAGE", "TURN_START", "TURN_END"] as const;
export const CONDITIONS = ["NEED_CONDITION", "HAS_MATCHING_TAG_PLAYED_THIS_TURN", "BASE_COST_GTE", "SOURCE_ON_LEFT_SIDE", "SOURCE_ON_RIGHT_SIDE"] as const;
export const REFERENCES = ["SOURCE", "LAST_TARGET", "LAST_DRAWN_CARD", "LAST_ATTACKER", "LAST_DAMAGED_TARGET", "CAPTURED_CARD", "CURRENT_SLOT"] as const;
export const ACTIONS = ["BUFF", "DAMAGE", "HEAL", "SILENCE", "DESTROY", "ADD_GOLD", "ADD_NEXT_TURN_GOLD", "DRAW", "REDUCE_COST", "INCREASE_COST", "STUN", "ADD_KEYWORD", "REMOVE_KEYWORD", "SUMMON", "GENERATE", "CAPTURE", "RELEASE_CAPTURED", "REMOVE_FROM_GAME", "SWITCH_EFFECT_BRANCH"] as const;
export const KEYWORDS = ["RUSH", "SURPRISE", "TAUNT", "DODGE", "MULTI_STRIKE"] as const;
export const TARGET_ZONES = ["BOARD", "HAND", "PLAYER", "CHARACTER"] as const;
export const TARGET_OWNERS = ["SELF", "ENEMY", "ALL"] as const;
export const TARGET_SELECTIONS = ["SELF", "PLAYER_CHOICE", "RANDOM", "SAME_TARGET", "ALL"] as const;

export type Trigger = typeof TRIGGERS[number];
export type Condition = typeof CONDITIONS[number];
export type Reference = typeof REFERENCES[number];
export type Action = typeof ACTIONS[number];
export type Keyword = typeof KEYWORDS[number];
export type TargetZone = typeof TARGET_ZONES[number];
export type TargetOwner = typeof TARGET_OWNERS[number];
export type TargetSelection = typeof TARGET_SELECTIONS[number];
export type EffectActionSchema = { target: boolean; amount?: boolean; stats?: boolean; keyword?: boolean; branches?: boolean };
export type RegistryStatus = "ACTIVE" | "DISABLED";

export const DISPLAY_LABELS = {
  ENTER_FIELD: "등장", CARD_DRAWN: "준비", OTHER_ALLY_ATTACK: "콤보", TECHNIQUE_CAST: "주문",
  CARD_PLAYED_THIS_TURN: "태그", EXACT_ZERO_DAMAGE: "핀폴",
  LEAVE_FIELD: "퇴장", ACTIVE: "액티브", TURN_START: "턴 시작", TURN_END: "턴 종료",
  NEED_CONDITION: "조건", HAS_MATCHING_TAG_PLAYED_THIS_TURN: "태그",
  SOURCE_ON_LEFT_SIDE: "스위치(왼쪽)", SOURCE_ON_RIGHT_SIDE: "스위치(오른쪽)",
  BUFF: "강화", DAMAGE: "피해", HEAL: "회복", DESTROY: "파괴", DRAW: "드로우",
  ADD_GOLD: "골드 획득", ADD_NEXT_TURN_GOLD: "다음 턴 골드", REDUCE_COST: "비용 감소",
  INCREASE_COST: "비용 증가", ADD_KEYWORD: "키워드 부여", REMOVE_KEYWORD: "키워드 제거",
  SUMMON: "소환", GENERATE: "생성", RELEASE_CAPTURED: "포획 해방",
  SWITCH_EFFECT_BRANCH: "스위치", RUSH: "러쉬", SURPRISE: "기습", TAUNT: "도발", DODGE: "회피",
  SILENCE: "침묵", STUN: "기절", CAPTURE: "포획", REMOVE_FROM_GAME: "제거",
} as const;

export const ACTION_SCHEMAS: Record<Action, EffectActionSchema> = {
  ADD_GOLD: { target: false, amount: true }, ADD_NEXT_TURN_GOLD: { target: false, amount: true }, DRAW: { target: false, amount: true },
  DAMAGE: { target: true, amount: true }, BUFF: { target: true, stats: true }, HEAL: { target: true, amount: true },
  REDUCE_COST: { target: true, amount: true }, INCREASE_COST: { target: true, amount: true }, STUN: { target: true },
  SILENCE: { target: true }, DESTROY: { target: true }, ADD_KEYWORD: { target: true, keyword: true }, REMOVE_KEYWORD: { target: true, keyword: true },
  SUMMON: { target: false }, GENERATE: { target: false }, CAPTURE: { target: true }, RELEASE_CAPTURED: { target: false },
  REMOVE_FROM_GAME: { target: true }, SWITCH_EFFECT_BRANCH: { target: false, branches: true },
};

const ACTION_DESCRIPTIONS: Record<Action, string> = {
  BUFF: "대상의 공격력과 체력을 변경합니다.", DAMAGE: "대상에게 피해를 줍니다.", HEAL: "대상의 체력을 회복합니다.",
  SILENCE: "대상의 효과와 키워드를 침묵시킵니다.", DESTROY: "대상을 파괴합니다.", ADD_GOLD: "현재 골드를 획득합니다.",
  ADD_NEXT_TURN_GOLD: "다음 내 턴의 골드를 증가시킵니다.", DRAW: "카드를 드로우합니다.", REDUCE_COST: "대상의 비용을 감소시킵니다.",
  INCREASE_COST: "대상의 비용을 증가시킵니다.", STUN: "대상을 기절시킵니다.", ADD_KEYWORD: "대상에게 키워드를 부여합니다.",
  REMOVE_KEYWORD: "대상의 키워드를 제거합니다.", SUMMON: "선수를 필드에 소환합니다.", GENERATE: "카드를 생성합니다.",
  CAPTURE: "대상을 포획합니다.", RELEASE_CAPTURED: "포획한 카드를 필드에 해방합니다.", REMOVE_FROM_GAME: "대상을 제거합니다.",
  SWITCH_EFFECT_BRANCH: "현재 슬롯의 왼쪽/오른쪽 분기에 맞는 효과를 실행합니다.",
};

export const EFFECT_CAPABILITIES: Record<Action, { description: string; status: RegistryStatus; version: number; runtimeHandler: true }> =
  Object.fromEntries(ACTIONS.map((name) => [name, { description: ACTION_DESCRIPTIONS[name], status: "ACTIVE", version: 1, runtimeHandler: true }])) as Record<Action, { description: string; status: RegistryStatus; version: number; runtimeHandler: true }>;
export const RUNTIME_HANDLER_ACTIONS = ACTIONS;

const triggerDescriptions: Record<Trigger, string> = {
  ENTER_FIELD: "선수가 어떤 정상 경로로든 필드에 들어올 때 발동합니다.", LEAVE_FIELD: "카드가 필드를 떠날 때 발동합니다.",
  ACTIVE: "액티브 능력을 사용할 때 발동합니다.", CARD_DRAWN: "카드가 덱에서 드로우될 때 발동합니다.",
  OTHER_ALLY_ATTACK: "다른 아군 선수가 공격할 때 발동합니다.", TECHNIQUE_CAST: "1G 이상 기본 비용의 기술을 손에서 사용할 때 발동합니다.",
  CARD_PLAYED_THIS_TURN: "이번 턴 손에서 플레이한 카드와 연계할 때 발동합니다.", EXACT_ZERO_DAMAGE: "이 카드가 다른 선수의 체력을 정확히 0으로 만들 때 발동합니다.",
  TURN_START: "턴 시작 시 발동합니다.", TURN_END: "턴 종료 시 발동합니다.",
};

export const EFFECT_LIBRARY = {
  actions: ACTIONS.map((name) => ({ name, label: DISPLAY_LABELS[name as keyof typeof DISPLAY_LABELS] ?? name, description: EFFECT_CAPABILITIES[name].description, status: EFFECT_CAPABILITIES[name].status, version: EFFECT_CAPABILITIES[name].version, requiredConfig: { target: ACTION_SCHEMAS[name].target, ...(ACTION_SCHEMAS[name].amount ? { values: { amount: "number (0..999)" } } : {}), ...(ACTION_SCHEMAS[name].stats ? { values: { attack: "number (-999..999)", health: "number (-999..999)" } } : {}), ...(ACTION_SCHEMAS[name].keyword ? { values: { keyword: [...KEYWORDS] } } : {}), ...(ACTION_SCHEMAS[name].branches ? { values: { leftEffects: "Effect[]", rightEffects: "Effect[]" } } : {}) } })),
  triggers: TRIGGERS.map((name) => ({ name, label: DISPLAY_LABELS[name as keyof typeof DISPLAY_LABELS] ?? name, description: triggerDescriptions[name], status: "ACTIVE" as const, version: 1 })),
  conditions: CONDITIONS.map((name) => ({ name, label: DISPLAY_LABELS[name as keyof typeof DISPLAY_LABELS] ?? name, description: name === "HAS_MATCHING_TAG_PLAYED_THIS_TURN" ? "이번 턴 먼저 플레이한 아군과 태그가 하나 이상 일치합니다." : "구조화된 조건을 확인합니다.", status: "ACTIVE" as const, version: 1 })),
  targetResolvers: [{ name: "ZONE_OWNER_SELECTION", description: "영역, 소유자, 카드 유형, 선택 방식 및 수로 대상을 해석합니다.", config: { zone: [...TARGET_ZONES], owner: [...TARGET_OWNERS], selection: [...TARGET_SELECTIONS], count: "integer (1..20)" }, status: "ACTIVE" as const, version: 1 }],
  valueResolvers: [{ name: "AMOUNT", description: "골드, 피해, 회복, 드로우 및 비용 수치를 해석합니다.", status: "ACTIVE" as const, version: 1 }, { name: "STAT_PAIR", description: "+공격력/+체력 수치를 해석합니다.", status: "ACTIVE" as const, version: 1 }, { name: "KEYWORD", description: "지원 키워드를 해석합니다.", values: [...KEYWORDS], status: "ACTIVE" as const, version: 1 }],
} as const;