import {useEffect,useState,type ReactNode} from 'react';
import {AuthPage} from './auth-page';
const api=`${import.meta.env.BASE_URL.replace(/\/$/,'')}/api`;
export function ServerMaintenanceGate({children}:{children:ReactNode}){
 const [status,setStatus]=useState<{enabled:boolean;allowed:boolean;message:string}|null>(null);
 const [error,setError]=useState(false);const [login,setLogin]=useState(false);
 async function refresh(){try{const r=await fetch(`${api}/server-status`,{credentials:'include',cache:'no-store'});if(!r.ok)throw Error();setStatus(await r.json());setError(false);}catch{setError(true);}}
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer);},[]);
 if(status?.allowed)return <>{children}</>;
 if(login)return <><button className="fixed right-3 top-3 z-[200] rounded bg-amber-400 p-3 text-black" onClick={()=>setLogin(false)}>점검 안내로</button><AuthPage loginOnly onAuthenticated={()=>{setLogin(false);void refresh();}}/></>;
 return <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-5 text-white"><section className="max-w-md text-center"><p className="text-amber-400">KO CARD GAME</p><h1 className="mt-4 text-2xl font-black">{status?.enabled?'서버 점검 중':error?'서버 연결을 확인해 주세요':'서버 연결 중'}</h1><p className="mt-4 whitespace-pre-wrap text-neutral-300">{status?.enabled?status.message:error?'잠시 후 다시 시도해 주세요.':''}</p><button className="mt-6 rounded border border-neutral-600 px-4 py-3" onClick={()=>void refresh()}>다시 확인</button>{status?.enabled&&<button className="ml-3 rounded border border-amber-600 px-4 py-3" onClick={()=>setLogin(true)}>관리자 로그인</button>}</section></main>;
}
export function AdminServerMaintenance(){
 const [enabled,setEnabled]=useState(false);const [message,setMessage]=useState('서버 점검 중입니다. 점검이 끝나면 다시 접속해 주세요.');const [loading,setLoading]=useState(true);const [feedback,setFeedback]=useState('');
 useEffect(()=>{fetch(`${api}/admin/server-maintenance`,{credentials:'include'}).then(async r=>{if(!r.ok)throw Error();const s=await r.json();setEnabled(s.enabled);setMessage(s.message);setLoading(false);}).catch(()=>setFeedback('점검 설정을 불러오지 못했습니다.'));},[]);
 async function toggle(){setLoading(true);setFeedback('');try{const r=await fetch(`${api}/admin/server-maintenance`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!enabled,message})});if(!r.ok)throw Error();const s=await r.json();setEnabled(s.enabled);setMessage(s.message);setFeedback(s.enabled?'서버 점검 ON · 일반 이용자의 접속이 차단됩니다.':'서버 점검 OFF · 일반 이용자가 접속할 수 있습니다.');}catch{setFeedback('저장하지 못했습니다. 다시 시도해 주세요.');}finally{setLoading(false);}}
 return <section className="mb-5 rounded-xl border border-amber-800 bg-amber-950/20 p-4"><h2 className="font-black text-amber-300">서버 점검</h2><p className="my-2 text-sm text-neutral-300">ON이면 일반 이용자의 접속과 게임 요청을 차단합니다. 관리자는 계속 이용할 수 있습니다.</p><label className="block text-sm">이용자에게 표시할 점검 안내<textarea aria-label="서버 점검 안내" maxLength={300} value={message} onChange={e=>setMessage(e.target.value)} className="mt-2 w-full rounded border border-neutral-700 bg-black p-2"/></label><button role="switch" aria-checked={enabled} aria-label="서버 점검" disabled={loading||!message.trim()} onClick={()=>void toggle()} className={`mt-3 min-h-11 rounded px-5 font-black ${enabled?'bg-red-600 text-white':'bg-amber-400 text-black'}`}>서버 점검 {enabled?'ON':'OFF'}</button><p role="status" className="mt-2 text-sm">{feedback}</p></section>;
}
