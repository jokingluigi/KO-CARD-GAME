import type { SpriteMotionSettings, SpriteEvent } from "@workspace/cosmetics";
export type ChampionMotionKind =
  | "TURN"
  | "SPELL"
  | "WRESTLER_ATTACK"
  | "ABILITY"
  | "SUMMON"
  | "LEGENDARY_SUMMON"
  | "HIT"
  | "HEAVY_HIT"
  | "SURPRISED"
  | "HEAL"
  | "AWAKEN"
  | "VICTORY"
  | "DEFEAT"
  | "EMOTE";
export type ChampionMotionCue = {
  id: string;
  kind: ChampionMotionKind;
  event: SpriteEvent;
  damage?: number;
  selfDamage?: boolean;
  basicAttack?: boolean;
  sourcePlayerId?: string;
  sourceSlot?: number;
  targetSlot?: number;
  emote?: string;
  target?: { playerId: string; slot?: number };
  support?: boolean;
};
/** One presentation clock. Values are never awaited by rules/network/input. */
export const CHAMPION_MOTION = {
  breathMs: 5200,
  lowBreathMs: 7600,
  breathPx: 1.2,
  turnMs: 320,
  spellMs: 360,
  abilityMs: 520,
  summonMs: 260,
  legendaryMs: 480,
  hitMs: 220,
  heavyMs: 320,
  surpriseMs: 360,
  healMs: 500,
  awakeMs: 700,
  resultMs: 620,
  emoteMs: 300,
  awakeSwapMs: 220,
  lowBrightness: 0.9,
  defeatY: 7,
  defeatDim: 0.64,
  victoryX: 4,
  victoryY: -2,
  victoryScale: 1.025,
  linkMs: 420,
} as const;
/** Presets change presentation only; unset fields inherit the champion default. */
export function resolveMotion(...layers: (SpriteMotionSettings | undefined)[]) {
  const m = Object.assign({}, ...layers) as SpriteMotionSettings;
  const profiles = {
    BALANCED: [1, 1, 1, 1, 1],
    HEAVY: [0.7, 0.85, 0.8, 0.78, 0.55],
    AGILE: [0.9, 0.85, 0.85, 1.25, 0.7],
    RESTRAINED: [0.5, 0.5, 0.6, 1, 0.35],
    AGGRESSIVE: [1.25, 1.25, 1.15, 1.08, 0.85],
    MECHANICAL: [0.8, 0.45, 0.65, 1.15, 0],
  } as const;
  const p = profiles[m.preset ?? "BALANCED"];
  return {
    preset: m.preset ?? "BALANCED",
    movement: (m.movement ?? 1) * p[0],
    rotation: (m.rotation ?? 1) * p[1],
    scale: (m.scale ?? 1) * p[2],
    speed: (m.speed ?? 1) * p[3],
    rebound: (m.rebound ?? 1) * p[4],
    pivotX: m.pivotX ?? 50,
    pivotY: m.pivotY ?? 90,
  };
}
export function motionDuration(
  kind: ChampionMotionKind,
  settings?: SpriteMotionSettings,
) {
  const base = {
    TURN: CHAMPION_MOTION.turnMs,
    SPELL: CHAMPION_MOTION.spellMs,
    WRESTLER_ATTACK: CHAMPION_MOTION.summonMs,
    ABILITY: CHAMPION_MOTION.abilityMs,
    SUMMON: CHAMPION_MOTION.summonMs,
    LEGENDARY_SUMMON: CHAMPION_MOTION.legendaryMs,
    HIT: CHAMPION_MOTION.hitMs,
    HEAVY_HIT: CHAMPION_MOTION.heavyMs,
    SURPRISED: CHAMPION_MOTION.surpriseMs,
    HEAL: CHAMPION_MOTION.healMs,
    AWAKEN: CHAMPION_MOTION.awakeMs,
    VICTORY: CHAMPION_MOTION.resultMs,
    DEFEAT: CHAMPION_MOTION.resultMs,
    EMOTE: CHAMPION_MOTION.emoteMs,
  }[kind];
  // Awakening remains on the existing cinematic clock, not the character speed.
  const limit: Partial<Record<ChampionMotionKind, number>> = {
    SPELL: 750,
    WRESTLER_ATTACK: 550,
    ABILITY: 750,
    SUMMON: 550,
    LEGENDARY_SUMMON: 550,
    HIT: 550,
    HEAVY_HIT: 850,
    SURPRISED: 850,
    HEAL: 650,
    EMOTE: 900,
  };
  return kind === "AWAKEN"
    ? base
    : Math.min(
        limit[kind] ?? 1600,
        Math.round(base / resolveMotion(settings).speed),
      );
}
export function expressionLead(
  kind?: ChampionMotionKind,
  settings?: SpriteMotionSettings,
) {
  return kind === "SPELL" ||
    kind === "ABILITY" ||
    kind === "SUMMON" ||
    kind === "LEGENDARY_SUMMON"
    ? Math.round(
        motionDuration(kind, settings) * (kind === "ABILITY" ? 0.2 : 0.14),
      )
    : 0;
}
export function motionFrames(
  cue: ChampionMotionCue,
  self: boolean,
  ratio = 1,
  intensity = 1,
  reduced = false,
  direction?: { x: number; y: number },
  settings?: SpriteMotionSettings,
  centered = false,
): Keyframe[] {
  const sign = self ? 1 : -1,
    m = resolveMotion(settings);
  const amount =
    Math.min(1.2, Math.max(0.35, ratio)) * Math.min(1.5, intensity) * 1.8;
  const clamp = (n: number, limit: number) =>
    Math.max(-limit, Math.min(limit, n));
  const forwardGesture = [
    "SPELL",
    "WRESTLER_ATTACK",
    "ABILITY",
    "SUMMON",
    "LEGENDARY_SUMMON",
    "SURPRISED",
    "VICTORY",
    "EMOTE",
  ].includes(cue.kind);
  const pose = (x = 0, y = 0, r = 0, scale = 1, brightness = 1) => {
    // Centred phone commanders exert toward the field vertically; hits retain
    // their real source direction and never inherit this voluntary gesture axis.
    const dx = centered && forwardGesture ? 0 : x;
    const dy = centered && forwardGesture ? y - x : y;
    return {
      transform: reduced
        ? "translate(0px,0px) rotate(0deg) scale(1)"
        : `translate(${clamp(dx * amount * m.movement, 28)}px,${clamp(dy * amount * m.movement, 26)}px) rotate(${clamp(r * amount * m.rotation, 5)}deg) scale(${1 + clamp((scale - 1) * m.scale * amount, 0.075)})`,
      filter: `brightness(${reduced ? Math.min(1.12, brightness) : brightness})`,
    };
  };
  const end = pose();
  const key = (offset: number, x = 0, y = 0, r = 0, scale = 1, bright = 1) => ({
    ...pose(x, y, r, scale, bright),
    offset,
    easing:
      m.preset === "MECHANICAL" ? "linear" : "cubic-bezier(.22,.68,.35,1)",
  });
  const rebound = m.rebound;
  if (cue.kind === "HIT" || cue.kind === "HEAVY_HIT") {
    const heavy = cue.kind === "HEAVY_HIT",
      force = (heavy ? 14 : 6) * (cue.selfDamage ? 0.4 : 1),
      axis = direction ?? { x: -sign * 0.6, y: sign * 0.8 },
      x = axis.x * force,
      y = axis.y * force,
      r = -sign * (heavy ? 2.7 : 1.1);
    // Translation leads; torso tilt follows. Heavy impact braces before one recovery overshoot.
    return heavy
      ? [
          key(0),
          key(0.12, x, y, r * 0.3, 1, cue.selfDamage ? 1.12 : 1.4),
          key(0.25, x * 0.95, y * 0.95, r, 1, 0.82),
          key(0.43, x * 0.88, y * 0.88, r * 0.95, 1, 0.94),
          key(
            0.76,
            -x * 0.12 * rebound,
            -y * 0.12 * rebound,
            -r * 0.16 * rebound,
          ),
          key(1),
        ]
      : [
          key(0),
          key(0.12, x, y, r * 0.2, 1, cue.selfDamage ? 1.1 : 1.3),
          key(0.29, x * 0.65, y * 0.65, r),
          key(
            0.72,
            -x * 0.14 * rebound,
            -y * 0.14 * rebound,
            -r * 0.18 * rebound,
          ),
          key(1),
        ];
  }
  if (cue.kind === "SPELL")
    return [
      key(0),
      key(0.14, -sign * 1.5, 0.5, -sign * 0.3, 0.997),
      key(0.31, sign * 4, -0.8, sign * 0.3, 1.012, 1.1),
      key(0.44, sign * 3, -0.5, sign * 0.8, 1.009),
      key(0.79, -sign * 0.45 * rebound, 0.15, -sign * 0.1 * rebound),
      key(1),
    ];
  if (cue.kind === "ABILITY")
    return [
      key(0),
      key(0.2, -sign * 1, 1.5, 0, 0.988),
      key(0.36, sign * 6, -1.5, sign * 0.25, 1.035, 1.16),
      key(0.52, sign * 5, -1, sign * 1, 1.025, 1.08),
      key(0.82, -sign * 0.6 * rebound, 0.3, -sign * 0.15 * rebound),
      key(1),
    ];
  if (
    cue.kind === "SUMMON" ||
    cue.kind === "LEGENDARY_SUMMON" ||
    cue.kind === "WRESTLER_ATTACK"
  ) {
    const power = cue.kind === "LEGENDARY_SUMMON" ? 1.6 : 1;
    return [
      key(0),
      key(0.14, -sign * 0.4, 0.3),
      key(0.36, sign * 2 * power, -0.3, sign * 0.25, 1.004, 1.08),
      key(0.53, sign * 1.5 * power, 0, sign * 0.85 * power),
      key(0.82, -sign * 0.2 * rebound, 0.1),
      key(1),
    ];
  }
  if (cue.kind === "SURPRISED")
    return [
      key(0),
      key(0.16, -sign * 5, 1.5, -sign * 0.3, 0.978),
      key(0.38, -sign * 5, 1.5, -sign * 0.7, 0.978),
      key(0.8, -sign * 1, 0.3, -sign * 0.2, 0.995),
      key(1),
    ];
  if (cue.kind === "HEAL")
    return [
      key(0),
      key(0.24, 0, 2.5, 0, 0.998, 1.12),
      key(0.55, 0, 2, 0, 1, 1.08),
      key(1),
    ];
  if (cue.kind === "VICTORY")
    return [
      key(0),
      key(0.32, sign * 2, -1, 0, 1.012, 1.05),
      key(0.7, sign * 4, -2, sign * 0.25, 1.025, 1.08),
      key(1, sign * 4, -2, sign * 0.25, 1.025, 1.08),
    ];
  if (cue.kind === "DEFEAT")
    return [
      key(0),
      key(0.38, 0, 3, -sign * 0.3, 1, 0.84),
      key(1, 0, 7, -sign * 1.5, 1, 0.64),
    ];
  if (cue.kind === "AWAKEN")
    return [
      key(0),
      key(0.26, 0, 0, 0, 1, 1.55),
      key(0.36, 0, -2, 0, 1.035, 0.8),
      key(1),
    ];
  if (cue.kind === "TURN") return [key(0), key(0.32, 0, 0, 0, 1, 1.17), key(1)];
  return [key(0), key(0.38, sign, 0, sign * 0.2, 1.005, 1.05), key(1)];
}

/** Conservative presentation hint, never a targeting rule. Unknown/script/area
 * effects retain their existing VFX rather than inventing a single projectile. */
export function explicitSingleDamageTarget(value: unknown, depth = 0): boolean {
  if (depth > 8 || !value || typeof value !== "object") return false;
  if (Array.isArray(value))
    return value.some((x) => explicitSingleDamageTarget(x, depth + 1));
  const v = value as Record<string, any>;
  if (v.type === "DAMAGE_OPPONENT_CHAMPION") return true;
  if (
    v.action === "DAMAGE" &&
    v.target &&
    v.target.selection !== "ALL" &&
    v.target.count === 1
  )
    return true;
  return ["effects", "abilities"].some((key) =>
    explicitSingleDamageTarget(v[key], depth + 1),
  );
}
