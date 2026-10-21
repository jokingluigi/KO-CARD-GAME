import {useEffect,useState} from 'react';
import {fetchCurrentUser,refreshCurrentUser,SESSION_CHANGED_EVENT,type AuthResponse} from '@/lib/auth-client';
import {getOnlineLobbyClient} from '@/lib/online-lobby-client';

/** Mounted once for the whole site, not only for the queue or online screen. */
export function SitePresenceBridge() {
  useEffect(()=>{
    const client=getOnlineLobbyClient();let active=false,disposed=false,suspended=false,userId:string|null=null,retry:ReturnType<typeof setTimeout>|undefined;
    const session=(response:AuthResponse)=>{
      if(disposed)return;
      const nextId=response.authenticated&&response.user?response.user.id:null;
      if(userId!==null&&userId!==nextId)client.close();
      userId=nextId;active=nextId!==null;clearTimeout(retry);
      if(active&&!suspended)client.connect();else client.close();
    };
    const changed=(event:Event)=>session((event as CustomEvent<AuthResponse>).detail);
    const storage=(event:StorageEvent)=>{
      if(event.key!=='ko-session-change')return;
      try { if(!JSON.parse(event.newValue??'{}').loggedIn){session({authenticated:false,user:null});return;} }catch{return;}
      void refreshCurrentUser().then(session).catch(()=>{});
    };
    const pageHide=()=>{suspended=true;client.close();};
    const pageShow=()=>{suspended=false;if(active)client.connect();};
    const unsubscribe=client.onConnectionState(state=>{
      clearTimeout(retry);
      // Also restore presence after an intentional lobby-cleanup socket close.
      if(active&&!suspended&&state==='closed')retry=setTimeout(()=>{if(active&&!disposed&&!suspended)client.connect();},500);
    });
    window.addEventListener(SESSION_CHANGED_EVENT,changed);window.addEventListener('storage',storage);
    window.addEventListener('pagehide',pageHide);window.addEventListener('pageshow',pageShow);
    void fetchCurrentUser().then(session).catch(()=>{});
    return()=>{disposed=true;active=false;clearTimeout(retry);unsubscribe();window.removeEventListener(SESSION_CHANGED_EVENT,changed);window.removeEventListener('storage',storage);window.removeEventListener('pagehide',pageHide);window.removeEventListener('pageshow',pageShow);client.close();};
  },[]);
  return null;
}
export function SitePresenceLight() {
  const [others,setOthers]=useState<boolean|null>(null);
  useEffect(()=>getOnlineLobbyClient().onSitePresence(setOthers),[]);
  const label=others===null?'접속 상태 확인 불가':others?'다른 로그인 유저 접속 중':'다른 접속 유저 없음';
  return <span role="status" aria-label={label} title={label} data-testid="site-presence-light" data-presence={others===null?'unknown':others?'online':'alone'} className={`inline-block h-3 w-3 shrink-0 rounded-full border border-black/50 ${others===null?'bg-neutral-500':others?'bg-emerald-400 shadow-[0_0_5px_#34d39966]':'bg-red-500'}`} />;
}
