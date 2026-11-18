import { combatImpactProfile } from './combat-impact-profile';

/** Presentation time only; these values never control a combat result. */
export function combatTimeline(
  attack: number,
  damage: number,
  finisher = false,
  reduced = false,
) {
  if (reduced) return { duration: 140, impact: 70, release: 70 };
  const p = combatImpactProfile(attack, damage, finisher);
  return {duration:p.duration,impact:p.contact,release:p.contact+p.hitstop};
}

export function attackFrames(
  dx: number,
  dy: number,
  timeline: ReturnType<typeof combatTimeline>,
  reduced = false,
  attack = 3,
): Keyframe[] {
  if (reduced)
    return [
      { opacity: 0, transform: "scale(.98)" },
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(1)" },
    ];
  const weight=Math.min(1.5,.65+Math.max(0,attack)*.07);
  const tilt = Math.max(-8, Math.min(8, dx / 70 || (dy<0?-2:2))) * Math.min(1.2,weight);
  const distance = Math.hypot(dx, dy) || 1;
  const pullback = Math.min(24, distance * .06 * weight);
  const pose = (x: number, y: number, scale: number, angle = 0) =>
    `translate3d(${x}px,${y}px,0) scale(${scale}) rotate(${angle}deg)`;
  return [
    { offset: 0, opacity: 0, transform: pose(0, 0, 1) },
    { offset: 0.1, opacity: 1, transform: pose(0, 0, 1.03) },
    {
      offset: (timeline.duration >= 700 ? 200 : 100) / timeline.duration,
      transform: pose(-dx / distance * pullback, -dy / distance * pullback, 1.03+.035*weight, -tilt),
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
    {offset:(timeline.release+(timeline.duration-timeline.release)*.18)/timeline.duration,transform:pose(dx*.84,dy*.84,1.035,-tilt*.22),easing:"cubic-bezier(.12,.65,.25,1)"},
    {offset:(timeline.release+(timeline.duration-timeline.release)*.78)/timeline.duration,transform:pose(-dx*.018,-dy*.018,1.005,-tilt*.08),easing:"ease-out"},
    {offset:(timeline.release+(timeline.duration-timeline.release)*.93)/timeline.duration,transform:pose(dx*.003,dy*.003,1)},
    { offset: 1, opacity: 1, transform: pose(0, 0, 1) },
  ];
}

/** Target compression shares the attack clock: contact and hold precede directional recoil. */
export function targetReactionFrames(dx:number,dy:number,damage:number,timeline:ReturnType<typeof combatTimeline>,reduced=false):Keyframe[] {
 const length=Math.hypot(dx,dy)||1, amount=reduced?0:damage<=0?2:damage>=10?40:damage>=6?28:damage>=3?14:4;
 const x=dx/length*amount,y=dy/length*amount,tilt=reduced?0:Math.sign(dx||1)*Math.min(4,amount/4);
 const pose=(travel:number,scale:number,angle=0)=>({transform:`translate3d(${x*travel}px,${y*travel}px,0) scale(${scale}) rotate(${angle}deg)`});
 const contact=timeline.impact/timeline.duration,release=timeline.release/timeline.duration;
 return [{offset:0,...pose(0,1)},{offset:Math.max(0,contact-.01),...pose(0,1)},
 {offset:contact,...pose(0,reduced?1:.94)},{offset:release,...pose(0,reduced?1:.94)},
 {offset:release+(1-release)*.25,...pose(1,.98,tilt)},{offset:release+(1-release)*.6,...pose(-.15,1.01,-tilt*.2)},{offset:1,...pose(0,1)}];
}
