import type { AttackAnimationState } from "./attack-animation-utils";
import { damageHitStop } from './presentation-policy';

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
  const force=damage>0?Math.max(attack,damage):0;
  const duration=finisher?760:force>=6?560:force>=3?520:480;
  const impact=finisher?300:force>=6?220:force>=3?210:200;
  return {duration,impact,release:impact+(finisher?165:damageHitStop(force))};
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
      offset: (timeline.duration >= 700 ? 200 : 100) / timeline.duration,
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
    particles: Math.min(28,10+Math.max(0,Math.min(12,strength))*2),
    dpr: 2,
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


/** Target compression shares the attack clock: contact and hold precede directional recoil. */
export function targetReactionFrames(dx:number,dy:number,damage:number,timeline:ReturnType<typeof combatTimeline>,reduced=false):Keyframe[] {
 const length=Math.hypot(dx,dy)||1, amount=reduced?0:damage<=0?2:damage>=10?18:damage>=6?12:damage>=3?7:3;
 const x=dx/length*amount,y=dy/length*amount,tilt=reduced?0:Math.sign(dx||1)*Math.min(4,amount/4);
 const pose=(travel:number,scale:number,angle=0)=>({transform:`translate3d(${x*travel}px,${y*travel}px,0) scale(${scale}) rotate(${angle}deg)`});
 const contact=timeline.impact/timeline.duration,release=timeline.release/timeline.duration;
 return [{offset:0,...pose(0,1)},{offset:Math.max(0,contact-.01),...pose(0,1)},
 {offset:contact,...pose(0,reduced?1:.94)},{offset:release,...pose(0,reduced?1:.94)},
 {offset:release+(1-release)*.25,...pose(1,.98,tilt)},{offset:release+(1-release)*.6,...pose(-.15,1.01,-tilt*.2)},{offset:1,...pose(0,1)}];
}
