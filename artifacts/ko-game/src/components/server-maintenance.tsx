import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {requestServerStatus,invalidateServerStatus,type ServerStatus} from '@/lib/startup-client';
import {isMaintenanceBlocked} from '@/lib/entry-state';
import {AuthPage} from './auth-page';
import {SESSION_CHANGED_EVENT} from '@/lib/auth-client';
const api=`${import.meta.env.BASE_URL.replace(/\/$/,'')}/api`;
export function ServerMaintenanceGate({children}:{children:ReactNode}){
 const [status,setStatus]=useState<ServerStatus|null>(null);
 const [login,setLogin]=useState(false);
 const generation=useRef(0),mounted=useRef(true);
 const refresh=useCallback(async()=>{
  const requestGeneration=++generation.current;
  try{
   const next=await requestServerStatus();
   if(mounted.current&&requestGeneration===generation.current)setStatus(next);
  }catch{
   // Keep a confirmed maintenance denial; an unknown/failed probe never blocks entry.
  }
 },[]);
 useEffect(()=>{
  mounted.current=true;
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
  async function poll(){await refresh();if(!stopped)timer=setTimeout(()=>void poll(),5000);}
  void poll();
  return()=>{stopped=true;mounted.current=false;generation.current++;clearTimeout(timer);};
 },[refresh]);
 useEffect(()=>{
  const changed=()=>{invalidateServerStatus();void refresh();};
  window.addEventListener(SESSION_CHANGED_EVENT,changed);
  return()=>window.removeEventListener(SESSION_CHANGED_EVENT,changed);
 },[refresh]);
 if(!isMaintenanceBlocked(status))return <>{children}</>;
 if(login)return <><button className="fixed right-3 top-3 z-[200] rounded bg-amber-400 p-3 text-black" onClick={()=>setLogin(false)}>점검 안내로</button><AuthPage loginOnly onAuthenticated={()=>{setLogin(false);void refresh();}}/></>;
 return <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-5 text-white"><section className="max-w-md text-center"><p className="text-amber-400">KO CARD GAME</p><h1 className="mt-4 text-2xl font-black">서버 점검 중</h1><p className="mt-4 whitespace-pre-wrap text-neutral-300">{status?.message}</p><button className="mt-6 rounded border border-neutral-600 px-4 py-3" onClick={()=>void refresh()}>다시 확인</button><button className="ml-3 rounded border border-amber-600 px-4 py-3" onClick={()=>setLogin(true)}>관리자 로그인</button></section></main>;
}
