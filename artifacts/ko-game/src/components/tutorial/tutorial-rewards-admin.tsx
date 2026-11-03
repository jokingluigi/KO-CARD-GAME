import {useEffect,useState} from 'react';
import {requestJson} from '@/lib/client-request';
type Config={normalPackId:string;championPackId:string;packs:{id:string;name:string;normalEligible:boolean;championEligible:boolean}[]};
export function TutorialRewardsAdmin(){
 const [config,setConfig]=useState<Config|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[attempt,setAttempt]=useState(0);
 const url=import.meta.env.BASE_URL.replace(/\/$/,'')+'/api/tutorial/admin-config';
 useEffect(()=>{let active=true;requestJson<Config>(url).then(c=>{if(active){setConfig(c);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[url,attempt]);
 return <section className="rounded-lg border border-amber-900 bg-neutral-950 p-5" aria-label="튜토리얼 보상 설정">
  <h3 className="text-lg font-bold text-amber-100">튜토리얼 보상</h3><p className="my-3 text-sm leading-6 text-neutral-400">6개 항목마다 노멀팩 3개, 전체 완료 시 확정 챔피언팩 1개. 계정별 최초 완료 한 번만 지급하며, 팩 변경으로 다시 지급하지 않습니다.</p>
  {config?<><div className="grid gap-4 sm:grid-cols-2">{[['normalPackId','노멀팩','normalEligible'],['championPackId','확정 챔피언팩','championEligible']].map(([field,label,eligibility])=><label key={field} className="text-sm">{label}<select aria-label={label+' 보상 연결'} disabled={busy} className="mt-2 min-h-11 w-full rounded border border-neutral-700 bg-black px-3 text-base" value={config[field as 'normalPackId'|'championPackId']} onChange={e=>{setConfig({...config,[field]:e.target.value});setSaved(false);}}><option value="">지급할 팩 선택</option>{config.packs.filter(p=>p[eligibility as 'normalEligible'|'championEligible']).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>)}</div><button className="mt-4 min-h-11 rounded border border-amber-700 px-4 text-amber-200 disabled:opacity-50" disabled={busy||!config.normalPackId||!config.championPackId} onClick={async()=>{setBusy(true);setError('');try{await requestJson(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({normalPackId:config.normalPackId,championPackId:config.championPackId})});setSaved(true);}catch(e){setError(e instanceof Error?e.message:'저장하지 못했어요.');}finally{setBusy(false);}}}>{busy?'저장 중…':'튜토리얼 보상 저장'}</button></>:!error&&<p role="status">팩 설정을 확인하고 있어요…</p>}
  {error&&<div role="alert"><p>{error}</p>{!config&&<button className="min-h-11 underline" onClick={()=>setAttempt(n=>n+1)}>설정 다시 확인</button>}</div>}{saved&&<p role="status" className="mt-3 text-amber-200">튜토리얼 보상 팩을 저장했어요.</p>}
 </section>;
}
