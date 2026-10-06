/** Presentation policy only. Never imports or modifies battle state. */
export type PresentationSpeed = 'NORMAL' | 'FAST';
export const MOTION_EASING = { action:'cubic-bezier(.7,0,.95,.65)', recovery:'cubic-bezier(.16,1,.3,1)', ui:'cubic-bezier(.2,.8,.2,1)' } as const;
export function presentationDuration(ms:number,speed:PresentationSpeed='NORMAL',depth=0) {
 return Math.max(70,Math.round(ms*(speed==='FAST'?.7:1)*(depth>16?.4:depth>8?.65:1)));
}
export function damageHitStop(damage:number) {return damage<=0?0:damage<=2?30:damage<=5?52:damage<=9?76:115;}
export function damageNumberTier(damage:number) {return damage>=10?'finisher':damage>=6?'heavy':damage>=3?'medium':'light';}
export function damageNumberDuration(damage:number) {return damage>=10?400:damage>=6?360:damage>=3?320:260;}
export const SHAKE_LEVELS=['NONE','VERY_LIGHT','LIGHT','MEDIUM','HEAVY','VERY_HEAVY'] as const;
export type ShakeLevel=typeof SHAKE_LEVELS[number];
export function strongerShake(a:ShakeLevel,b:ShakeLevel):ShakeLevel {return SHAKE_LEVELS[Math.max(SHAKE_LEVELS.indexOf(a),SHAKE_LEVELS.indexOf(b))];}
export function shakePixels(level:ShakeLevel) {return [0,3,5.5,9.5,14,20][SHAKE_LEVELS.indexOf(level)];}
export type QueueEntry={id:string;kind:string;duration:number};
export function enqueuePresentation<T extends QueueEntry>(pending:T[],incoming:T[]):T[] {
 const ids=new Set(pending.map(c=>c.id));
 const fresh=incoming.filter(c=>{if(ids.has(c.id))return false;ids.add(c.id);return true;});
 // Preserve causal order and every outcome. Accelerate long chains instead of dropping events.
 return [...pending,...fresh].map((c,index)=>['QUEST_COMPLETE','TRANSFORM'].includes(c.kind)?c:{...c,duration:presentationDuration(Math.min(c.duration,400),'NORMAL',index)});
}
export function acceptsSound(activePriority:number,expires:number,priority:number,now:number) {return now>=expires||priority>=activePriority;}
