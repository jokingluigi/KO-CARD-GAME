export const SPRITE_EVENTS = [
  "IDLE",
  "SUMMON",
  "ATTACK",
  "HIT",
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
export function parseBattleSprite(value: unknown): BattleSprite | null {
  try {
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
    return { version: 1, frames, reactions };
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
  ABILITY: 5,
  AWAKEN: 8,
  VICTORY: 10,
  DEFEAT: 10,
};
export function reactSprite(
  current: { event: SpriteEvent; until: number },
  event: SpriteEvent,
  now: number,
) {
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
        ? 86400000
        : event === "AWAKEN"
          ? 1800
          : 700),
  };
}
