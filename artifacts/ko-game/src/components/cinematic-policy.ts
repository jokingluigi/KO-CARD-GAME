export type CinematicKind = 'ATTACK' | 'SUMMON' | 'ABILITY' | 'BIG_SPELL' | 'LEGENDARY' | 'CHAMPION' | 'AWAKENING' | 'BOSS' | 'HIDDEN_BOSS' | 'FINISHER' | 'RESULT';
export type CinematicRequest = {id:string;kind:CinematicKind;title:string;subtitle?:string;art?:string|null;strength?:number;focus?:{x:number;y:number};duration?:number};
export type CinematicEvent = CinematicRequest & {createdAt:number;duration:number};
export const CINEMATIC_PRIORITY:Record<CinematicKind,number>={SUMMON:1,ATTACK:2,ABILITY:3,BIG_SPELL:4,LEGENDARY:5,CHAMPION:6,AWAKENING:7,BOSS:8,HIDDEN_BOSS:8,FINISHER:9,RESULT:10};
export const CINEMATIC_TIMING={quick:320,action:560,panel:650,reveal:760,awakening:1100,boss:1500,result:650};
export type CinematicState={active:CinematicEvent|null;pending:CinematicEvent[];seen:string[]};
export const emptyCinematicState=():CinematicState=>({active:null,pending:[],seen:[]});
export function cameraLevel(e:CinematicRequest):0|1|2|3|4{
 if(['FINISHER','BOSS','HIDDEN_BOSS'].includes(e.kind))return 4;
 if(['AWAKENING','LEGENDARY','CHAMPION','BIG_SPELL'].includes(e.kind))return 3;
 if(e.kind==='ABILITY'||(e.strength??0)>=6)return 2;
 return 1;
}
export function cinematicDuration(e:CinematicRequest,reduced=false,speed:'NORMAL'|'FAST'='NORMAL',pressure=0){
 const base=e.duration??(e.kind==='AWAKENING'?CINEMATIC_TIMING.awakening:e.kind==='BOSS'||e.kind==='HIDDEN_BOSS'?CINEMATIC_TIMING.boss:e.kind==='ATTACK'?CINEMATIC_TIMING.action:e.kind==='SUMMON'?CINEMATIC_TIMING.quick:e.kind==='LEGENDARY'||e.kind==='CHAMPION'?CINEMATIC_TIMING.reveal:CINEMATIC_TIMING.panel);
 return reduced?160:Math.round(Math.max(140,Math.min(1500,base)*(speed==='FAST'?.7:1)*(pressure>3?.65:1)));
}
/** This queue only controls pixels. It never changes engine state or locks input. */
export function offerCinematic(s:CinematicState,e:CinematicEvent):CinematicState{
 if(s.seen.includes(e.id))return s;
 const seen=[...s.seen,e.id].slice(-96);
 if(!s.active)return {active:e,pending:[],seen};
 const priority=CINEMATIC_PRIORITY[e.kind],current=CINEMATIC_PRIORITY[s.active.kind];
 if(priority>=9&&priority>current)return {active:e,pending:s.pending.filter(p=>CINEMATIC_PRIORITY[p.kind]>=5),seen};
 // A stale attack must not replay after an awakening or boss cut-in.
 if(priority<3&&current>=3)return {...s,seen};
 const pending=[...s.pending.filter(p=>e.createdAt-p.createdAt<1800),e]
  .sort((a,b)=>CINEMATIC_PRIORITY[b.kind]-CINEMATIC_PRIORITY[a.kind]||a.createdAt-b.createdAt).slice(0,6);
 return {...s,pending,seen};
}
export function finishCinematic(s:CinematicState,id:string,now:number):CinematicState{
 if(s.active?.id!==id)return s;
 const pending=s.pending.filter(p=>now-p.createdAt<1800);
 return {...s,active:pending[0]??null,pending:pending.slice(1)};
}
