import type { SpriteEvent } from "@workspace/cosmetics";
export type ChampionMotionKind =
  | "TURN"
  | "SPELL"
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
export function motionDuration(kind: ChampionMotionKind) {
  return {
    TURN: CHAMPION_MOTION.turnMs,
    SPELL: CHAMPION_MOTION.spellMs,
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
}
export function motionFrames(
  cue: ChampionMotionCue,
  self: boolean,
  ratio = 1,
  intensity = 1,
  reduced = false,
  direction?: { x: number; y: number },
): Keyframe[] {
  const sign = self ? 1 : -1,
    amount = Math.min(1, Math.max(0.7, ratio)) * intensity;
  const end = {
    transform: "translate(0px,0px) rotate(0deg) scale(1)",
    filter: "brightness(1)",
  };
  const pose = (x = 0, y = 0, r = 0, scale = 1, brightness = 1) => ({
    transform: reduced
      ? end.transform
      : `translate(${x * amount}px,${y * amount}px) rotate(${r * amount}deg) scale(${scale})`,
    filter: `brightness(${reduced ? Math.min(1.12, brightness) : brightness})`,
  });
  if (cue.kind === "HIT" || cue.kind === "HEAVY_HIT") {
    const heavy = cue.kind === "HEAVY_HIT",
      force = (heavy ? 14 : 6) * (cue.selfDamage ? 0.4 : 1),
      axis = direction ?? { x: -sign * 0.6, y: sign * 0.8 };
    const x = axis.x * force,
      y = axis.y * force,
      angle = (heavy ? 2.5 : 1) * -sign;
    return [
      { ...end, offset: 0 },
      {
        ...pose(x, y, angle, 1, cue.selfDamage ? 1.16 : heavy ? 1.4 : 1.3),
        offset: 0.16,
      },
      {
        ...pose(
          x * 0.82,
          y * 0.82,
          angle * 0.6,
          1,
          cue.selfDamage ? 0.93 : heavy ? 0.78 : 1,
        ),
        offset: 0.3,
      },
      { ...pose(-x * 0.2, -y * 0.2, -angle * 0.25), offset: 0.62 },
      ...(heavy
        ? [{ ...pose(x * 0.1, y * 0.1, angle * 0.1), offset: 0.78 }]
        : []),
      { ...end, offset: 1 },
    ];
  }
  if (cue.kind === "SURPRISED")
    return [
      end,
      { ...pose(-sign * 5, 2, -sign * 0.7), offset: 0.2 },
      { ...pose(-sign * 5, 2, -sign * 0.7), offset: 0.43 },
      end,
    ];
  if (cue.kind === "HEAL")
    return [end, { ...pose(0, -3, 0, 1, 1.15), offset: 0.4 }, end];
  if (cue.kind === "DEFEAT")
    return [
      end,
      {
        transform: reduced
          ? end.transform
          : `translate(0px,${CHAMPION_MOTION.defeatY}px) rotate(0deg) scale(1)`,
        filter: `brightness(${CHAMPION_MOTION.defeatDim})`,
      },
    ];
  if (cue.kind === "VICTORY")
    return [
      end,
      {
        transform: reduced
          ? end.transform
          : `translate(${sign * CHAMPION_MOTION.victoryX}px,${CHAMPION_MOTION.victoryY}px) scale(${CHAMPION_MOTION.victoryScale})`,
        filter: "brightness(1.08)",
      },
    ];
  if (cue.kind === "AWAKEN")
    return [
      end,
      { ...pose(0, 0, 0, 1, 1.55), offset: 0.26 },
      { ...pose(0, -2, 0, reduced ? 1 : 1.035, 0.8), offset: 0.36 },
      end,
    ];
  if (cue.kind === "TURN")
    return [end, { ...pose(0, 0, 0, 1, 1.17), offset: 0.32 }, end];
  const power =
    cue.kind === "ABILITY"
      ? 6
      : cue.kind === "LEGENDARY_SUMMON"
        ? 4
        : cue.kind === "SPELL"
          ? 4
          : cue.kind === "EMOTE"
            ? 1
            : 2;
  return [
    end,
    {
      ...pose(
        sign * power,
        -1,
        0,
        reduced ? 1 : cue.kind === "ABILITY" ? 1.035 : 1.012,
        1.1,
      ),
      offset: 0.38,
    },
    end,
  ];
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
