export type StructuredEffect = {
  trigger: "ENTER_FIELD" | "LEAVE_FIELD" | "ACTIVE";
  action: "BUFF" | "DAMAGE" | "SILENCE" | "DESTROY" | "ADD_GOLD";
  target: {
    zone: "BOARD" | "HAND" | "PLAYER";
    owner: "SELF" | "ENEMY";
    cardType?: "WRESTLER";
    selection: "SELF" | "PLAYER_CHOICE" | "RANDOM";
    count: number;
  };
  values?: { attack?: number; health?: number; amount?: number };
};

export type Analysis = {
  status: "success" | "partial" | "failure";
  effects: StructuredEffect[];
  unsupportedSegments: string[];
  summaries: string[];
};

const triggerFor = (text: string): StructuredEffect["trigger"] | null =>
  /등장\s*:|등장할 때|필드에 나올 때/.test(text) ? "ENTER_FIELD"
    : /퇴장\s*:|퇴장할 때/.test(text) ? "LEAVE_FIELD"
    : /액티브\s*:|활성화/.test(text) ? "ACTIVE" : null;

function unsupportedRemainder(body: string): string {
  return body
    .replace(/상대\s*(?:챔피언|플레이어)(?:에게|를|을)?/g, "")
    .replace(/(?:적|상대)\s*선수\s*(?:하나|한\s*장)?(?:에게|를|을)?/g, "")
    .replace(/손패의\s*(?:무작위\s*)?선수\s*카드\s*(?:\d+\s*장|한\s*장)?(?:에게|를|을)?/g, "")
    .replace(/(?:자신|이\s*카드)(?:에게|를|을)?/g, "")
    .replace(/[+-]?\d+\s*\/\s*[+-]?\d+\s*(?:을|를)?\s*(?:부여합니다|부여한다|증가시킵니다|올립니다)/g, "")
    .replace(/피해\s*\d+\s*(?:을|를)?\s*(?:줍니다|준다|주고|줌)/g, "")
    .replace(/\d+\s*(?:피해|데미지)\s*(?:을|를)?\s*(?:줍니다|준다|주고|줌)/g, "")
    .replace(/침묵시킵니다|침묵시킨다|침묵시키고/g, "")
    .replace(/파괴합니다|파괴한다|파괴하고/g, "")
    .replace(/골드\s*(?:을|를)?\s*\d+\s*얻습니다/g, "")
    .replace(/\d+\s*골드\s*(?:를|을)?\s*얻습니다/g, "")
    .replace(/(?:그리고|및|그\s*후|후에)/g, "")
    .replace(/[.,!?·\s]/g, "");
}

export function analyzeEffectText(input: string): Analysis {
  const text = input.trim();
  const trigger = triggerFor(text);
  if (!text || !trigger) return { status: "failure", effects: [], unsupportedSegments: [text || "효과 문장"], summaries: ["지원하는 발동 조건(등장, 퇴장, 액티브)을 찾지 못했습니다."] };
  const body = text.replace(/^.*?(?:등장\s*:|등장할 때|필드에 나올 때|퇴장\s*:|퇴장할 때|액티브\s*:|활성화)\s*/, "");
  const effects: StructuredEffect[] = [];
  const unsupportedSegments: string[] = [];
  const target = (): StructuredEffect["target"] => {
    if (/상대\s*(?:챔피언|플레이어)/.test(body)) return { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 };
    if (/자신|이 카드/.test(body)) return { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 };
    const enemy = /적\s*선수|상대\s*선수/.test(body);
    const hand = /손패/.test(body);
    const random = /무작위/.test(body);
    return { zone: hand ? "HAND" : "BOARD", owner: enemy ? "ENEMY" : "SELF", cardType: "WRESTLER", selection: random ? "RANDOM" : "PLAYER_CHOICE", count: Number(body.match(/(\d+)\s*장/)?.[1] ?? (/(한 장|하나)/.test(body) ? 1 : 1)) };
  };
  const stat = body.match(/([+-]?\d+)\s*\/\s*([+-]?\d+)/);
  if (stat && /부여|증가|올립/.test(body)) effects.push({ trigger, action: "BUFF", target: target(), values: { attack: Number(stat[1]), health: Number(stat[2]) } });
  const damage = body.match(/피해\s*(\d+)|(\d+)\s*(?:피해|데미지)/);
  if (damage && /주|줍/.test(body)) effects.push({ trigger, action: "DAMAGE", target: target(), values: { amount: Number(damage[1] ?? damage[2]) } });
  if (/침묵/.test(body)) effects.push({ trigger, action: "SILENCE", target: target() });
  if (/파괴/.test(body)) effects.push({ trigger, action: "DESTROY", target: target() });
  const gold = body.match(/골드(?:를|을)?\s*(\d+)|(\d+)\s*골드/);
  if (gold && /얻/.test(body)) effects.push({ trigger, action: "ADD_GOLD", target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 }, values: { amount: Number(gold[1] ?? gold[2]) } });
  const remainder = unsupportedRemainder(body);
  if (!effects.length || remainder) unsupportedSegments.push(remainder || body);
  if (
    trigger === "ACTIVE" &&
    effects.some((effect) => effect.target.selection === "PLAYER_CHOICE")
  ) {
    unsupportedSegments.push("액티브 효과의 직접 대상 선택은 아직 지원하지 않습니다.");
  }
  const status = unsupportedSegments.length ? (effects.length ? "partial" : "failure") : "success";
  return {
    status, effects, unsupportedSegments,
    summaries: effects.map((effect) => `${effect.trigger === "ENTER_FIELD" ? "등장" : effect.trigger} · ${effect.action} · ${effect.target.owner === "ENEMY" ? "적" : "내"} ${effect.target.zone === "HAND" ? "손패" : "필드"} ${effect.target.selection}${effect.target.count > 1 ? ` ${effect.target.count}장` : ""}`),
  };
}

export function isStructuredEffects(value: unknown): value is { effects: StructuredEffect[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const effects = (value as Record<string, unknown>).effects;
  if (!Array.isArray(effects) || effects.length === 0 || effects.length > 10) {
    return false;
  }

  return effects.every((rawEffect) => {
    if (!rawEffect || typeof rawEffect !== "object" || Array.isArray(rawEffect)) {
      return false;
    }
    const effect = rawEffect as Record<string, unknown>;
    const target = effect.target;
    const values = effect.values;
    if (
      !["ENTER_FIELD", "LEAVE_FIELD", "ACTIVE"].includes(effect.trigger as string) ||
      !["BUFF", "DAMAGE", "SILENCE", "DESTROY", "ADD_GOLD"].includes(effect.action as string) ||
      !target ||
      typeof target !== "object" ||
      Array.isArray(target)
    ) {
      return false;
    }

    const typedTarget = target as Record<string, unknown>;
    if (
      !["BOARD", "HAND", "PLAYER"].includes(typedTarget.zone as string) ||
      !["SELF", "ENEMY"].includes(typedTarget.owner as string) ||
      !["SELF", "PLAYER_CHOICE", "RANDOM"].includes(typedTarget.selection as string) ||
      !Number.isInteger(typedTarget.count) ||
      (typedTarget.count as number) < 1 ||
      (typedTarget.count as number) > 20 ||
      (typedTarget.selection === "PLAYER_CHOICE" && typedTarget.count !== 1) ||
      (typedTarget.cardType !== undefined && typedTarget.cardType !== "WRESTLER")
    ) {
      return false;
    }

    if (values !== undefined) {
      if (!values || typeof values !== "object" || Array.isArray(values)) return false;
      const typedValues = values as Record<string, unknown>;
      if (
        !["attack", "health", "amount"].every((key) => {
          const number = typedValues[key];
          return number === undefined ||
            (typeof number === "number" && Number.isFinite(number) && Math.abs(number) <= 999);
        })
      ) {
        return false;
      }
    }

    const action = effect.action as StructuredEffect["action"];
    const zone = typedTarget.zone as StructuredEffect["target"]["zone"];
    if (
      effect.trigger === "ACTIVE" &&
      typedTarget.selection === "PLAYER_CHOICE"
    ) {
      return false;
    }
    if (zone === "PLAYER") {
      return (
        action === "DAMAGE" &&
        typedTarget.owner === "ENEMY" &&
        typedTarget.selection === "SELF" &&
        typedTarget.count === 1
      );
    }
    if (action === "ADD_GOLD") {
      return (
        typedTarget.owner === "SELF" &&
        typedTarget.selection === "SELF" &&
        typeof (values as Record<string, unknown> | undefined)?.amount === "number"
      );
    }
    if (action === "DAMAGE") return zone === "BOARD";
    if (action === "SILENCE" || action === "DESTROY") return zone === "BOARD";
    if (action === "BUFF") return zone === "BOARD" || zone === "HAND";
    return false;
  });
}