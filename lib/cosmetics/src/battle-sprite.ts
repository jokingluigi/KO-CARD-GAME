export const SPRITE_EVENTS = [
  "IDLE",
  "SUMMON",
  "ATTACK",
  "HIT",
  "HEAL",
  "BIG_HIT",
  "ALLY_RETIRED",
  "ABILITY",
  "AWAKEN",
  "VICTORY",
  "DEFEAT",
] as const;
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
  ATTACK: 2,
  ALLY_RETIRED: 3,
  HIT: 4,
  HEAL: 4,
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
  if (event === "HIT" && current.event === "HIT" && current.until > now + 400)
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
      (config?.timing?.[event] ??
        (["VICTORY", "DEFEAT"].includes(event)
          ? 86400000
          : event === "AWAKEN"
            ? 1500
            : event === "ABILITY"
              ? 900
              : event === "HIT"
                ? 600
                : event === "HEAL"
                  ? 700
                  : 800)),
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
    set.reactions[state === "LOW" ? "IDLE" : state] ??
    "default";
  const transient =
    input.reaction !== "IDLE" &&
    !config.disabled?.includes(input.reaction) &&
    !input.outcome;
  const key = transient
    ? ((input.selfDamage && input.reaction === "HIT"
        ? set.selfDamage
        : undefined) ??
      set.reactions[input.reaction] ??
      persistent)
    : persistent;
  return set.frames[key] ?? set.frames.default;
}
export function spriteFrames(config: BattleSprite) {
  return [
    ...Object.values(config.frames),
    ...Object.values(config.awakened?.frames ?? {}),
  ];
}
