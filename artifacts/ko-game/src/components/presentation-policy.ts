/** Presentation policy only. Never imports or modifies battle state. */
export type PresentationSpeed = 'NORMAL' | 'FAST';
export const MOTION_EASING = { action:'cubic-bezier(.7,0,.95,.65)', recovery:'cubic-bezier(.16,1,.3,1)', ui:'cubic-bezier(.2,.8,.2,1)' } as const;
export function presentationDuration(ms:number,speed:PresentationSpeed='NORMAL',depth=0) {
 return Math.max(70,Math.round(ms*(speed==='FAST'?.7:1)*(depth>16?.4:depth>8?.65:1)));
}
export function damageHitStop(damage:number) {return damage<=0?0:damage<=2?30:damage<=5?65:damage<=9?105:120;}
export function damageNumberTier(damage:number) {return damage>=10?'finisher':damage>=6?'heavy':damage>=3?'medium':'light';}
export function damageNumberDuration(damage:number) {return damage>=10?400:damage>=6?360:damage>=3?320:260;}
export const SHAKE_LEVELS=['NONE','VERY_LIGHT','LIGHT','MEDIUM','HEAVY','VERY_HEAVY'] as const;
export type ShakeLevel=typeof SHAKE_LEVELS[number];
export function strongerShake(a:ShakeLevel,b:ShakeLevel):ShakeLevel {return SHAKE_LEVELS[Math.max(SHAKE_LEVELS.indexOf(a),SHAKE_LEVELS.indexOf(b))];}
export function shakePixels(level:ShakeLevel) {return [0,3,5.5,9.5,14,20][SHAKE_LEVELS.indexOf(level)];}
export type QueueEntry={id:string;kind:string;duration:number};
/** Independent targets can show feedback together; never overlap repeated
 * numbers on one target or start an awakening/transform underneath other cues. */
export function presentationBatch<T extends QueueEntry & {cardInstanceId?:string;playerId?:string;group?:string}>(queue:T[]):T[] {
 // 2026-11-26 대표 결정 E-2: 같은 순간(같은 묶음)에 일어난 일만 함께 재생한다.
 // 묶음이 다르면 원인→결과 순서이므로 앞 묶음이 끝날 때까지 기다린다.
 const result:T[]=[],targets=new Set<string>();
 const head=queue[0];
 if(!head)return result;
 for(const cue of queue){
  const exclusive=cue.kind==='QUEST_COMPLETE'||cue.kind==='TRANSFORM';
  if(exclusive)return result.length ? result : [cue];
  if(result.length&&(cue.group??cue.id)!==(head.group??head.id))break;
  const target=cue.cardInstanceId??cue.playerId??'hud';
  if(targets.has(target)||result.length===6)break;
  targets.add(target);result.push(cue);
 }
 return result;
}
/** 묶음과 묶음 사이 숨 고르기 (대표 결정 E-1: 0.25초). 밀려 있으면 같이 빨라진다. */
export function presentationGap(pending:number){return pending>=3?Math.round(250/1.5):250;}
export function enqueuePresentation<T extends QueueEntry>(pending:T[],incoming:T[]):T[] {
 const ids=new Set(pending.map(c=>c.id));
 const ids0=new Set(ids);
 const fresh=incoming.filter(c=>{if(ids.has(c.id))return false;ids.add(c.id);return true;});
 // Preserve causal order and every outcome. Accelerate long chains instead of dropping events.
 const all=[...pending,...fresh];
 // 대표 결정 E-3: 기다리는 연출이 3개 이상이면 1.5배속 (새로 들어온 것만 한 번 줄인다)
 const rush=all.length>=3;
 return all.map((c,index)=>['QUEST_COMPLETE','TRANSFORM'].includes(c.kind)?c:{...c,
  quiet:all.length>8&&index<all.length-5,
  duration:presentationDuration(Math.min(rush&&!ids0.has(c.id)?Math.round(c.duration/1.5):c.duration,all.length>8&&index<all.length-5?180:400),'NORMAL',index)});
}
export function acceptsSound(activePriority:number,expires:number,priority:number,now:number) {return now>=expires||priority>=activePriority;}
