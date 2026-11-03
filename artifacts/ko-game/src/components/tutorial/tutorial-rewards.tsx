import {useEffect,useState} from 'react';
import {Link} from 'wouter';
import {requestJson} from '@/lib/client-request';
import {LESSONS,type LessonId} from './lesson-engine';
import type {GameAction} from '@/game/actions/types';
export type TutorialProof={lessonId:LessonId;gameId:string;actions:GameAction[]};
type Status={ready:boolean;normalPack:{id:string;name:string}|null;championPack:{id:string;name:string}|null;lessons:{id:LessonId;title:string;claimed:boolean}[];allClaimed:boolean;message:string|null};
function checkedStatus(value:Status):Status {
 if(!value||typeof value.ready!=='boolean'||typeof value.allClaimed!=='boolean'||!Array.isArray(value.lessons)||!LESSONS.every(l=>value.lessons.some(x=>x.id===l.id&&typeof x.claimed==='boolean')))throw Error('튜토리얼 보상 기록을 확인하지 못했어요. 잠시 후 다시 확인해 주세요.');
 return value;
}
const root=(import.meta.env.BASE_URL??'/').replace(/\/$/,'')+'/api/tutorial';
const key=(account:string,id:LessonId)=>`ko-tutorial-proof-v1:${account}:${id}`;
const knownClaims=new Set<string>();
function rememberClaims(account:string,status:Status){for(const lesson of status.lessons)if(lesson.claimed)knownClaims.add(account+':'+lesson.id);if(knownClaims.size>128)knownClaims.clear();}
const settlements=new Map<string,Promise<{status:Status}>>();
function settleProof(account:string,proof:TutorialProof,retry=false){
 const identity=account+':'+proof.gameId;
 if(!retry&&settlements.has(identity))return settlements.get(identity)!;
 try{localStorage.setItem(key(account,proof.lessonId),JSON.stringify(proof));}catch{}
 const promise=requestJson<{status:Status}>(root+'/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(proof)},{label:'튜토리얼 보상'}).then(result=>{const status=checkedStatus(result.status);rememberClaims(account,status);return {...result,status};});
 settlements.set(identity,promise);
 if(settlements.size>32)settlements.delete(settlements.keys().next().value!);
 return promise;
}
/** Completion settlement is independent of dialog visibility and its animation. */
export function useTutorialAutoReward(accountId:string|undefined,proof:TutorialProof|undefined){
 useEffect(()=>{
  if(!accountId||accountId.startsWith('guest-')||!proof||knownClaims.has(accountId+':'+proof.lessonId))return;
  void settleProof(accountId,proof).catch(()=>{}); // Pending proof + panel provide explicit recovery.
 },[accountId,proof?.gameId]);
}
function pendingProofs(account:string){
 const pending:TutorialProof[]=[];
 for(const lesson of LESSONS)try{const p=JSON.parse(localStorage.getItem(key(account,lesson.id))??'null');if(p?.lessonId===lesson.id&&typeof p.gameId==='string'&&Array.isArray(p.actions))pending.push(p);}catch{}
 return pending;
}
export function TutorialRewardsPanel({accountId,proof}:{accountId?:string;proof?:TutorialProof}){
 const eligible=Boolean(accountId&&!accountId.startsWith('guest-'));
 const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[recover,setRecover]=useState(false),[pending,setPending]=useState(false);
 useEffect(()=>{
  setStatus(null);setError('');
  if(!eligible||!accountId)return;
  let active=true;
  setBusy(true);
  if(proof)try{localStorage.setItem(key(accountId,proof.lessonId),JSON.stringify(proof));}catch{}
  const run=async()=>{
   try{
    let next=checkedStatus(await requestJson<Status>(root+'/status',{}, {label:'튜토리얼 보상 확인'}));
    rememberClaims(accountId,next);
    const proofs=proof?[proof]:recover?pendingProofs(accountId):[];
    for(const p of proofs){
     if(!next.lessons.some(l=>l.id===p.lessonId&&l.claimed)){
      const result=await settleProof(accountId,p,attempt>0);
      next=checkedStatus(result.status);
     }
     try{localStorage.removeItem(key(accountId,p.lessonId));}catch{}
    }
    // Known server receipts supersede a lost browser response after reopening.
    for(const lesson of next.lessons)if(lesson.claimed)try{localStorage.removeItem(key(accountId,lesson.id));}catch{}
    if(active){setStatus(next);setPending(pendingProofs(accountId).some(p=>!next.lessons.some(l=>l.id===p.lessonId&&l.claimed)));}
   }catch(e){if(active){setError(e instanceof Error?e.message:'보상을 확인하지 못했어요.');setPending(pendingProofs(accountId).length>0);}}
   finally{if(active)setBusy(false);}
  };
  void run();
  return()=>{active=false;};
 },[accountId,eligible,proof?.gameId,attempt]);
 return <section className="ko-tutorial-rewards" aria-label="튜토리얼 보상" aria-busy={busy}>
  <div className="ko-tutorial-rewards__head"><strong>실습 완료 보상</strong><span>항목마다 노멀팩 ×3</span></div>
  <p>6개 전체 완료 시 확정 챔피언팩 ×1 추가</p>
  {!eligible?<p>보상은 로그인한 계정에 한 번씩 지급돼요. 비회원 연습은 보상을 지급하지 않아요.</p>:<>
   {busy&&<p role="status">완료 기록과 팩 지급을 확인하고 있어요…</p>}
   {status&&<>
    <p role="status">노멀팩 보상 {status.lessons.filter(l=>l.claimed).length}/6 수령 · {status.allClaimed?'확정 챔피언팩 지급 완료':'전체 완료 보상 대기'}</p>
    <details><summary>항목별 지급 기록</summary><ul>{status.lessons.map(l=><li key={l.id}>{l.title}<span>{l.claimed?'노멀팩 3개 지급 완료':'미수령'}</span></li>)}</ul></details>
    {!status.ready&&<p role="alert">{status.message}</p>}
    {status.lessons.some(l=>l.claimed)&&<Link href="/packs">받은 팩 확인 →</Link>}
   </>}
   {error&&<p role="alert">{error}</p>}
   {(error||pending||(status&&!status.ready))&&<button type="button" disabled={busy} onClick={()=>{setRecover(true);setAttempt(n=>n+1);}}>보상 다시 확인</button>}
  </>}
 </section>;
}
