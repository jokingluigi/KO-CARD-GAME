export const SPRITE_EVENTS = [
  "IDLE",
  "SUMMON",
  "ATTACK",
  "HIT",
  "HEAL",
  "HEAVY_HIT",
  "BIG_HIT",
  "ALLY_RETIRED",
  "ABILITY",
  "AWAKEN",
  "VICTORY",
  "DEFEAT",
] as const;
/** The ten artwork slots; AWAKEN is a transition, never an eleventh expression. */
export const SPRITE_EXPRESSIONS = {
  default: "기본",
  attack: "공격",
  hurt: "피격",
  heavy_hurt: "강한 피격",
  low: "저체력",
  summon: "소환",
  surprised: "놀람",
  victory: "승리",
  defeat: "패배",
  relief: "안도",
} as const;
export const FINAL_SPRITE_EVENTS = [
  "IDLE",
  "ATTACK",
  "HIT",
  "HEAVY_HIT",
  "SUMMON",
  "ALLY_RETIRED",
  "HEAL",
  "AWAKEN",
  "VICTORY",
  "DEFEAT",
] as const;
export const spriteEventLabels: Record<string, string> = {
  IDLE: "기본",
  ATTACK: "공격",
  HIT: "피격",
  HEAVY_HIT: "강한 피격",
  SUMMON: "소환",
  ALLY_RETIRED: "놀람",
  HEAL: "안도",
  AWAKEN: "각성 전환",
  VICTORY: "승리",
  DEFEAT: "패배",
};
export const spriteDefaultTiming: Record<string, number> = {
  ATTACK: 800,
  HIT: 600,
  HEAVY_HIT: 900,
  SUMMON: 600,
  ALLY_RETIRED: 900,
  HEAL: 700,
  AWAKEN: 1500,
};
const eventExpression: Partial<Record<SpriteEvent, string>> = {
  IDLE: "default",
  ATTACK: "attack",
  HIT: "hurt",
  HEAVY_HIT: "heavy_hurt",
  SUMMON: "summon",
  ALLY_RETIRED: "surprised",
  HEAL: "relief",
  VICTORY: "victory",
  DEFEAT: "defeat",
};
export type SpriteEvent = (typeof SPRITE_EVENTS)[number];
export type SpritePlacement = {
  scale: number;
  x: number;
  y: number;
  flip: boolean;
  crop: boolean;
};
export type SpriteFrame = {
  url: string;
  self: SpritePlacement;
  opponent: SpritePlacement;
};
export type BattleSprite = {
  version: 1;
  awakening?: "KEEP" | "REPLACE";
  awakened?: BattleSprite;
  states?: Partial<Record<"IDLE" | "LOW" | "VICTORY" | "DEFEAT", string>>;
  selfDamage?: string;
  disabled?: SpriteEvent[];
  timing?: Partial<Record<SpriteEvent, number>>;
  lowHealth?: number;
  bigDamage?: number;
  majorCost?: number;
  frames: Record<string, SpriteFrame>;
  reactions: Partial<Record<SpriteEvent, string>>;
};
export const defaultSpritePlacement: SpritePlacement = {
  scale: 1,
  x: 50,
  y: 35,
  flip: false,
  crop: false,
};
export function parseBattleSprite(
  value: unknown,
  depth = 0,
): BattleSprite | null {
  try {
    if (depth > 1) return null;
    if (typeof value === "string") {
      if (value.length > 24000) return null;
      value = JSON.parse(value);
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const v = value as BattleSprite;
    if (
      v.version !== 1 ||
      !v.frames ||
      typeof v.frames !== "object" ||
      Array.isArray(v.frames) ||
      Object.keys(v.frames).length > 12 ||
      !v.reactions ||
      typeof v.reactions !== "object" ||
      Array.isArray(v.reactions)
    )
      return null;
    const frames: Record<string, SpriteFrame> = {};
    for (const [key, frame] of Object.entries(v.frames)) {
      if (
        ["__proto__", "constructor", "prototype"].includes(key) ||
        !/^[a-zA-Z0-9_-]{1,32}$/.test(key) ||
        !frame ||
        typeof frame.url !== "string" ||
        frame.url.length > 2048 ||
        !(
          (/\/api\/storage\/objects\/uploads\/cosmetics\/[\w.-]+\.(png|webp)$/i.test(
            frame.url,
          ) &&
            frame.url.startsWith("/api/")) ||
          (/^https:\/\//.test(frame.url) &&
            /\.(png|webp)(\?.*)?$/i.test(frame.url))
        )
      )
        return null;
      const url = new URL(frame.url, "https://local.invalid");
      if (url.username || url.password) return null;
      for (const side of ["self", "opponent"] as const) {
        const p = frame[side];
        if (
          !p ||
          !Number.isFinite(p.scale) ||
          p.scale < 0.5 ||
          p.scale > 3 ||
          !Number.isFinite(p.x) ||
          p.x < 0 ||
          p.x > 100 ||
          !Number.isFinite(p.y) ||
          p.y < 0 ||
          p.y > 100 ||
          typeof p.flip !== "boolean" ||
          typeof p.crop !== "boolean"
        )
          return null;
      }
      frames[key] = {
        url: frame.url,
        self: { ...frame.self },
        opponent: { ...frame.opponent },
      };
    }
    if (Object.keys(frames).length && !frames.default) return null;
    const reactions: BattleSprite["reactions"] = {};
    for (const [event, key] of Object.entries(v.reactions)) {
      if (
        !SPRITE_EVENTS.includes(event as SpriteEvent) ||
        typeof key !== "string" ||
        !frames[key]
      )
        return null;
      reactions[event as SpriteEvent] = key;
    }
    const extra: Partial<BattleSprite> = {};
    if (v.awakening !== undefined) {
      if (!["KEEP", "REPLACE"].includes(v.awakening)) return null;
      extra.awakening = v.awakening;
    }
    if (v.awakened) {
      const awake = parseBattleSprite(v.awakened, depth + 1);
      if (!awake) return null;
      extra.awakened = awake;
    }
    if (v.awakening === "REPLACE" && !extra.awakened?.frames.default)
      return null;
    for (const key of ["lowHealth", "bigDamage", "majorCost"] as const) {
      if (v[key] !== undefined) {
        if (!Number.isFinite(v[key]) || v[key]! < 0 || v[key]! > 999)
          return null;
        extra[key] = v[key];
      }
    }
    if (v.states) {
      for (const [state, key] of Object.entries(v.states))
        if (
          !["IDLE", "LOW", "VICTORY", "DEFEAT"].includes(state) ||
          !frames[key!]
        )
          return null;
      extra.states = { ...v.states };
    }
    if (v.selfDamage !== undefined) {
      if (!frames[v.selfDamage]) return null;
      extra.selfDamage = v.selfDamage;
    }
    if (v.disabled) {
      if (
        !Array.isArray(v.disabled) ||
        v.disabled.some((e) => !SPRITE_EVENTS.includes(e))
      )
        return null;
      extra.disabled = [...v.disabled];
    }
    if (v.timing) {
      for (const [e, ms] of Object.entries(v.timing))
        if (
          !SPRITE_EVENTS.includes(e as SpriteEvent) ||
          !Number.isFinite(ms) ||
          ms! < 100 ||
          ms! > 3000
        )
          return null;
      extra.timing = { ...v.timing };
    }
    return { version: 1, frames, reactions, ...extra };
  } catch {
    return null;
  }
}
export const spritePriority: Record<SpriteEvent, number> = {
  IDLE: 0,
  SUMMON: 1,
  ATTACK: 4,
  ALLY_RETIRED: 6,
  HIT: 5,
  HEAVY_HIT: 7,
  HEAL: 2,
  BIG_HIT: 2,
  ABILITY: 5,
  AWAKEN: 8,
  VICTORY: 10,
  DEFEAT: 10,
};
export function reactSprite(
  current: { event: SpriteEvent; until: number },
  event: SpriteEvent,
  now: number,
  config?: BattleSprite,
) {
  if (config?.disabled?.includes(event)) return current;
  // Coalesce repeated identical reactions without extending their deadline.
  if (
    ["HIT", "HEAVY_HIT"].includes(event) &&
    current.event === event &&
    current.until > now
  )
    return current;
  if (
    current.until > now &&
    spritePriority[current.event] > spritePriority[event]
  )
    return current;
  return {
    event,
    until:
      now +
      (["VICTORY", "DEFEAT"].includes(event)
        ? Number.MAX_SAFE_INTEGER - now
        : (config?.timing?.[event] ?? spriteDefaultTiming[event] ?? 800)),
  };
}

/** Shared by battle and editor. A replacement set never resolves into pre-awakening frames. */
export function selectSpriteFrame(
  config: BattleSprite,
  input: {
    awakened: boolean;
    low: boolean;
    outcome?: "VICTORY" | "DEFEAT";
    reaction: SpriteEvent;
    selfDamage?: boolean;
  },
) {
  const set =
    input.awakened && config.awakening === "REPLACE"
      ? config.awakened!
      : config;
  const state = input.outcome ?? (input.low ? "LOW" : "IDLE");
  const persistent =
    set.states?.[state] ??
    (state === "LOW"
      ? set.frames.low
        ? "low"
        : "default"
      : (set.reactions[state] ??
        (set.frames[eventExpression[state]!]
          ? eventExpression[state]!
          : "default")));
  const transient =
    input.reaction !== "IDLE" &&
    input.reaction !== "AWAKEN" &&
    !config.disabled?.includes(input.reaction) &&
    !input.outcome;
  // Missing transient artwork returns to this set's default, not another state/skin.
  const key = transient
    ? (set.reactions[input.reaction] ??
      eventExpression[input.reaction] ??
      "default")
    : persistent;
  return set.frames[key] ?? set.frames.default;
}
export function spriteFrames(config: BattleSprite) {
  return [
    ...Object.values(config.frames),
    ...Object.values(config.awakened?.frames ?? {}),
  ];
}

/** Converts the earlier optional mappings into the final ten editable artwork slots.
 * It is a read-time projection; saved legacy manifests are never overwritten implicitly. */
function cloneFrame(frame: SpriteFrame): SpriteFrame {
  return {
    ...frame,
    self: { ...frame.self },
    opponent: { ...frame.opponent },
  };
}

export function finalSpriteSet(input: BattleSprite): BattleSprite {
  const aliases: Record<string, string[]> = {
    default: ["default"],
    attack: [
      input.reactions.ATTACK!,
      input.reactions.ABILITY!,
      "attack",
      "ability",
    ],
    hurt: [input.reactions.HIT!, "hurt"],
    heavy_hurt: [input.reactions.HEAVY_HIT!, "heavy_hurt"],
    low: [input.states?.LOW!, "low"],
    summon: [input.reactions.SUMMON!, "summon"],
    surprised: [input.reactions.ALLY_RETIRED!, "surprised", "retire"],
    victory: [input.states?.VICTORY!, input.reactions.VICTORY!, "victory"],
    defeat: [input.states?.DEFEAT!, input.reactions.DEFEAT!, "defeat"],
    relief: [input.reactions.HEAL!, "relief"],
  };
  const frames: Record<string, SpriteFrame> = {};
  for (const [key, choices] of Object.entries(aliases)) {
    const frame =
      input.frames[key] ??
      choices
        .filter((x) => x && (key === "default" || x !== "default"))
        .map((x) => input.frames[x])
        .find(Boolean);
    if (frame) frames[key] = cloneFrame(frame);
  }
  const reactions: BattleSprite["reactions"] = {};
  for (const [event, key] of Object.entries(eventExpression)) {
    const explicit = input.reactions[event as SpriteEvent];
    if (explicit && frames[explicit])
      reactions[event as SpriteEvent] = explicit;
    else if (frames[key!]) reactions[event as SpriteEvent] = key;
  }
  const states: BattleSprite["states"] = {};
  for (const [state, key] of Object.entries({
    IDLE: "default",
    LOW: "low",
    VICTORY: "victory",
    DEFEAT: "defeat",
  })) {
    const explicit =
      input.states?.[state as keyof NonNullable<BattleSprite["states"]>];
    if (explicit && frames[explicit])
      states[state as keyof typeof states] = explicit;
    else if (frames[key]) states[state as keyof typeof states] = key;
  }
  return {
    ...input,
    frames,
    reactions,
    states,
    selfDamage: undefined,
    lowHealth: undefined,
    bigDamage: undefined,
    majorCost: undefined,
    disabled: input.disabled?.filter((e) =>
      FINAL_SPRITE_EVENTS.includes(e as (typeof FINAL_SPRITE_EVENTS)[number]),
    ),
    ...(input.awakened ? { awakened: finalSpriteSet(input.awakened) } : {}),
  };
}

/** Uploading a slot binds its own state/event without deleting other artwork. */
export function withSpriteFrame(
  config: BattleSprite,
  key: string,
  frame: SpriteFrame,
): BattleSprite {
  const reactions = { ...config.reactions };
  for (const [event, expression] of Object.entries(eventExpression))
    if (expression === key) reactions[event as SpriteEvent] = key;
  const states = { ...config.states };
  const state = (
    {
      default: "IDLE",
      low: "LOW",
      victory: "VICTORY",
      defeat: "DEFEAT",
    } as const
  )[key as "default" | "low" | "victory" | "defeat"];
  if (state) states[state] = key;
  return {
    ...config,
    frames: { ...config.frames, [key]: cloneFrame(frame) },
    reactions,
    states,
  };
}
