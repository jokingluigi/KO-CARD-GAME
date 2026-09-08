export const TRIGGERS = ["ENTER_FIELD", "LEAVE_FIELD", "ACTIVE"] as const;
export const ACTIONS = ["BUFF", "DAMAGE", "HEAL", "SILENCE", "DESTROY", "ADD_GOLD", "ADD_NEXT_TURN_GOLD", "DRAW", "REDUCE_COST", "INCREASE_COST", "STUN", "ADD_KEYWORD", "REMOVE_KEYWORD"] as const;
export const KEYWORDS = ["RUSH", "SURPRISE", "TAUNT", "DODGE", "MULTI_STRIKE"] as const;
export const TARGET_ZONES = ["BOARD", "HAND", "PLAYER", "CHARACTER"] as const;
export const TARGET_OWNERS = ["SELF", "ENEMY", "ALL"] as const;
export const TARGET_SELECTIONS = ["SELF", "PLAYER_CHOICE", "RANDOM", "SAME_TARGET", "ALL"] as const;

export type Trigger = typeof TRIGGERS[number];
export type Action = typeof ACTIONS[number];
export type Keyword = typeof KEYWORDS[number];
export type TargetZone = typeof TARGET_ZONES[number];
export type TargetOwner = typeof TARGET_OWNERS[number];
export type TargetSelection = typeof TARGET_SELECTIONS[number];
export type EffectActionSchema = { target: boolean; amount?: boolean; stats?: boolean; keyword?: boolean };

export const ACTION_SCHEMAS: Record<Action, EffectActionSchema> = {
  ADD_GOLD: { target: false, amount: true }, ADD_NEXT_TURN_GOLD: { target: false, amount: true }, DRAW: { target: false, amount: true },
  DAMAGE: { target: true, amount: true }, BUFF: { target: true, stats: true },
  HEAL: { target: true, amount: true }, REDUCE_COST: { target: true, amount: true }, INCREASE_COST: { target: true, amount: true }, STUN: { target: true },
  SILENCE: { target: true }, DESTROY: { target: true },
  ADD_KEYWORD: { target: true, keyword: true }, REMOVE_KEYWORD: { target: true, keyword: true },
};

const ACTION_DESCRIPTIONS: Record<Action, string> = {
  BUFF: "대상의 공격력과 체력을 변경합니다.", DAMAGE: "대상에게 피해를 줍니다.", HEAL: "대상의 체력을 회복합니다.",
  SILENCE: "대상의 효과와 키워드를 침묵시킵니다.", DESTROY: "대상을 파괴합니다.", ADD_GOLD: "현재 골드를 획득합니다.",
  ADD_NEXT_TURN_GOLD: "다음 내 턴의 골드를 증가시킵니다.", DRAW: "카드를 드로우합니다.",
  REDUCE_COST: "대상의 비용을 감소시킵니다.", INCREASE_COST: "대상의 비용을 증가시킵니다.",
  STUN: "대상을 기절시킵니다.", ADD_KEYWORD: "대상에게 키워드를 부여합니다.", REMOVE_KEYWORD: "대상의 키워드를 제거합니다.",
};

export const EFFECT_LIBRARY = {
  actions: ACTIONS.map((name) => ({
    name, description: ACTION_DESCRIPTIONS[name], status: "ACTIVE" as const,
    requiredConfig: {
      target: ACTION_SCHEMAS[name].target,
      ...(ACTION_SCHEMAS[name].amount ? { values: { amount: "number (0..999)" } } : {}),
      ...(ACTION_SCHEMAS[name].stats ? { values: { attack: "number (-999..999)", health: "number (-999..999)" } } : {}),
      ...(ACTION_SCHEMAS[name].keyword ? { values: { keyword: [...KEYWORDS] } } : {}),
    },
  })),
  triggers: TRIGGERS.map((name) => ({
    name,
    description: ({ ENTER_FIELD: "카드가 필드에 등장할 때 발동합니다.", LEAVE_FIELD: "카드가 필드를 떠날 때 발동합니다.", ACTIVE: "액티브 능력을 사용할 때 발동합니다." } as Record<Trigger, string>)[name],
    status: "ACTIVE" as const,
  })),
  targetResolvers: [{ name: "ZONE_OWNER_SELECTION", description: "영역, 소유자, 카드 유형, 선택 방식 및 수로 대상을 해석합니다.", config: { zone: [...TARGET_ZONES], owner: [...TARGET_OWNERS], selection: [...TARGET_SELECTIONS], count: "integer (1..20)" }, status: "ACTIVE" as const }],
  valueResolvers: [
    { name: "AMOUNT", description: "골드, 피해, 회복, 드로우 및 비용 수치를 해석합니다.", status: "ACTIVE" as const },
    { name: "STAT_PAIR", description: "+공격력/+체력 수치를 해석합니다.", status: "ACTIVE" as const },
    { name: "KEYWORD", description: "지원 키워드를 해석합니다.", values: [...KEYWORDS], status: "ACTIVE" as const },
  ],
} as const;