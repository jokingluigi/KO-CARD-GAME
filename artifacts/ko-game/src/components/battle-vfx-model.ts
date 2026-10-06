import type { AttackAnimationState } from "./attack-animation-utils";
import { attackAnimationDuration } from "./attack-animation-utils";
import { PRESENTATION_CONFIG } from "./presentation-config";

export type BattleVfxKind =
  "IMPACT" | "BLOCK" | "HEAL" | "MAGIC" | "GOLD" | "DESTROY" | "RETIRE";

/** Presentation time only; these values never control a combat result. */
export function combatTimeline(
  attack: number,
  damage: number,
  finisher = false,
  reduced = false,
) {
  if (reduced) return { duration: 140, impact: 70, release: 70 };
  const duration = attackAnimationDuration(attack) + (finisher ? 180 : 0);
  const impact = Math.round(duration * 0.46);
  const tier =
    damage <= 0
      ? "NONE"
      : damage === 1
        ? "VERY_LIGHT"
        : damage <= 3
          ? "LIGHT"
          : damage <= 5
            ? "MEDIUM"
            : damage <= 7
              ? "HEAVY"
              : "VERY_HEAVY";
  return {
    duration,
    impact,
    release:
      impact + (finisher ? 90 : PRESENTATION_CONFIG.attackHitStopMs[tier]),
  };
}

export function attackFrames(
  dx: number,
  dy: number,
  timeline: ReturnType<typeof combatTimeline>,
  reduced = false,
): Keyframe[] {
  if (reduced)
    return [
      { opacity: 0, transform: "scale(.98)" },
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(1)" },
    ];
  const tilt = Math.max(-8, Math.min(8, dx / 70));
  const pose = (x: number, y: number, scale: number, angle = 0) =>
    `translate3d(${x}px,${y}px,0) scale(${scale}) rotate(${angle}deg)`;
  return [
    { offset: 0, opacity: 0, transform: pose(0, 0, 1) },
    { offset: 0.1, opacity: 1, transform: pose(0, 0, 1.03) },
    {
      offset: 0.27,
      transform: pose(-dx * 0.06, -dy * 0.06, 1.08, -tilt),
      easing: "cubic-bezier(.7,0,.95,.65)",
    },
    {
      offset: timeline.impact / timeline.duration,
      transform: pose(dx, dy, 1.06, tilt * 0.3),
      easing: "linear",
    },
    {
      offset: timeline.release / timeline.duration,
      transform: pose(dx, dy, 1.06, tilt * 0.3),
      easing: "cubic-bezier(.16,1,.3,1)",
    },
    { offset: 0.82, transform: pose(dx * 0.1, dy * 0.1, 1.02) },
    { offset: 1, opacity: 1, transform: pose(0, 0, 1) },
  ];
}

export function attackBurstKind(
  animation: Pick<AttackAnimationState, "damage">,
): BattleVfxKind {
  return animation.damage > 0 ? "IMPACT" : "BLOCK";
}

export function vfxBudget(
  compact: boolean,
  reduced: boolean,
  strength: number,
) {
  if (reduced) return { particles: 0, dpr: 1, size: 160 };
  return {
    particles: Math.min(
      compact ? 20 : 36,
      10 + Math.max(0, Math.min(12, strength)) * 2,
    ),
    dpr: compact ? 1.5 : 2,
    size: compact ? 240 : 360,
  };
}

export function vfxParticles(seed: string, count: number) {
  let value =
    Array.from(seed).reduce(
      (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619),
      2166136261,
    ) >>> 0;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    angle: random() * Math.PI * 2,
    speed: 24 + random() * 92,
    size: 1 + random() * 3,
    life: 0.5 + random() * 0.5,
    spin: random() * 6 - 3,
  }));
}
