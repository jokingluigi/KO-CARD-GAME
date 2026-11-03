import { useEffect, useState } from "react";
import {
  fetchCurrentUser,
  SESSION_CHANGED_EVENT,
  type AuthResponse,
} from "../../lib/auth-client";
export type Wish = {
  id: string;
  kind: "card" | "skin";
  name: string;
  image?: string | null;
  acquired?: boolean;
  updatedAt?: number;
};
export type MatchEntry = {
  mode?: "AI" | "QUICK" | "FRIENDLY" | "OTHER";
  id: string;
  deckId?: string;
  deckName?: string;
  opponent: string;
  result: "승리" | "패배" | "무승부";
  at: number;
};
export type Launch = { id: string; name: string; mode: "QUICK" | "FRIENDLY" };
export type Shelf = {
  launches?: Record<string, Launch>;
  removedWishes?: {id:string;at:number}[];
  wishes: Wish[];
  matches: MatchEntry[];
};
export const emptyShelf = (): Shelf => ({ wishes: [], matches: [] });
export function readShelf(id: string): Shelf {
  try {
    const v = JSON.parse(
      localStorage.getItem("ko-player-shelf:" + id) ?? "null",
    );
    return {
      removedWishes: Array.isArray(v?.removedWishes) ? v.removedWishes.filter((x:{id:string;at:number})=>x && typeof x.id==='string' && Number.isFinite(x.at)).slice(-1000) : [],
      launches: v?.launches && typeof v.launches === "object" ? v.launches : {},
      wishes: Array.isArray(v?.wishes)
        ? v.wishes
            .filter((x: Wish) => x && typeof x.id === "string")
            .slice(0, 500)
        : [],
      matches: Array.isArray(v?.matches)
        ? v.matches
            .filter((x: MatchEntry) => x && typeof x.id === "string")
            .slice(0, 200)
        : [],
    };
  } catch {
    return emptyShelf();
  }
}
export function changeShelf(id: string, update: (s: Shelf) => Shelf) {
  try {
    const previous=readShelf(id),next=update(previous),now=Date.now();
    const removed=new Map((previous.removedWishes??[]).map(x=>[x.id,x]));
    const ids=new Set(next.wishes.map(x=>x.id));
    for(const wish of previous.wishes)if(!ids.has(wish.id))removed.set(wish.id,{id:wish.id,at:now});
    const old=new Map(previous.wishes.map(x=>[x.id,x]));
    next.wishes=next.wishes.map(x=>JSON.stringify(x)!==JSON.stringify(old.get(x.id))?{...x,updatedAt:Math.max(now,(removed.get(x.id)?.at??0)+1,(old.get(x.id)?.updatedAt??0)+1)}:x);
    next.removedWishes=[...removed.values()].sort((a,b)=>a.at-b.at).slice(-1000);
    localStorage.setItem('ko-player-shelf:'+id,JSON.stringify(next));
    window.dispatchEvent(new Event('ko-player-shelf'));
    queueShelfSync(id);
    return true;
  } catch { return false; }
}
export function mergeShelves(local:Shelf,remote:Shelf):Shelf{
 const removed=new Map((local.removedWishes??[]).map(x=>[x.id,x]));
 for(const x of remote.removedWishes??[])if(x.at>=(removed.get(x.id)?.at??0))removed.set(x.id,x);
 const wishes=new Map(local.wishes.map(x=>[x.id,x]));
 for(const x of remote.wishes)if((x.updatedAt??0)>=(wishes.get(x.id)?.updatedAt??0))wishes.set(x.id,x);
 for(const [id,x]of wishes)if((removed.get(id)?.at??-1)>=(x.updatedAt??0))wishes.delete(id);
 const matches=new Map(local.matches.map(x=>[x.id,x]));for(const x of remote.matches){const old=matches.get(x.id);if(!old)matches.set(x.id,x);else if(!old.deckId&&x.deckId)matches.set(x.id,{...old,deckId:x.deckId,deckName:x.deckName,mode:x.mode??old.mode});}
 return {...local,wishes:[...wishes.values()].slice(-500),matches:[...matches.values()].sort((a,b)=>b.at-a.at).slice(0,200),removedWishes:[...removed.values()].sort((a,b)=>a.at-b.at).slice(-1000)};
}
const syncing=new Set<string>(),queued=new Set<string>();
const syncState=new Map<string,string>();
const setupPendingUntil=new Map<string,number>();
function syncMessage(id:string,message:string){syncState.set(id,message);window.dispatchEvent(new Event('ko-player-journal-sync'));}
export async function queueShelfSync(id:string,force=false){
 if(!force&&(setupPendingUntil.get(id)??0)>Date.now()){syncMessage(id,'이 기기에 보관 중 · 계정 동기화는 준비 중이에요.');return;}
 if(force)setupPendingUntil.delete(id);
 if(syncing.has(id)){queued.add(id);return;}
 syncing.add(id);syncMessage(id,'계정에 동기화 중…');
 try{
  const account=await fetchCurrentUser();if(account.user?.id!==id){syncMessage(id,'로그인 계정을 다시 확인해 주세요.');return;}
  const local=readShelf(id);
  const r=await fetch((import.meta.env.BASE_URL??'/').replace(/\/$/,'')+'/api/player-journal/sync',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),body:JSON.stringify({accountId:id,wishes:local.wishes,matches:local.matches,removedWishes:local.removedWishes??[]})});
  if(!r.ok){const failure=await r.json().catch(()=>null);if(failure?.code==='FEATURE_SETUP_PENDING'){setupPendingUntil.set(id,Date.now()+60000);syncMessage(id,'이 기기에 보관 중 · 계정 동기화는 준비 중이에요.');return;}throw Error('sync');}const body=await r.json();
  if(!body.document||!Array.isArray(body.document.wishes)||!Array.isArray(body.document.matches))throw Error('format');
  if((await fetchCurrentUser()).user?.id!==id)return;
  localStorage.setItem('ko-player-shelf:'+id,JSON.stringify(mergeShelves(readShelf(id),body.document)));
  window.dispatchEvent(new Event('ko-player-shelf'));syncMessage(id,'계정 동기화 완료 · 이 기기에도 보관됨');
 }catch{syncMessage(id,'이 기기에 보관됨 · 계정 동기화에 실패했어요. 연결 후 다시 시도하세요.');}
 finally{syncing.delete(id);if(queued.delete(id))void queueShelfSync(id);}
}
export function useShelf() {
  const [id, setId] = useState<string | null>(null),
    [data, setData] = useState(emptyShelf),
    [error, setError] = useState(""),
    [syncStatus,setSyncStatus]=useState("");
  useEffect(() => {
    let live = true;
    const changed = (e: Event) => {
      const next = (e as CustomEvent<AuthResponse>).detail?.user?.id ?? null;
      setId(next);
      setData(next ? readShelf(next) : emptyShelf());
    };
    window.addEventListener(SESSION_CHANGED_EVENT, changed);
    void fetchCurrentUser()
      .then((r) => {
        if (live) setId(r.user?.id ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
      window.removeEventListener(SESSION_CHANGED_EVENT, changed);
    };
  }, []);
  useEffect(() => {
    const refresh = () => setData(id ? readShelf(id) : emptyShelf());
    refresh();
    window.addEventListener("ko-player-shelf", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("ko-player-shelf", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [id]);
  useEffect(()=>{
    if(!id)return;
    const status=()=>setSyncStatus(syncState.get(id)??'이 기기에 보관됨');
    const reconnect=()=>{if(document.visibilityState==='visible')void queueShelfSync(id);};
    window.addEventListener('ko-player-journal-sync',status);window.addEventListener('online',reconnect);document.addEventListener('visibilitychange',reconnect);
    void queueShelfSync(id);status();
    return()=>{window.removeEventListener('ko-player-journal-sync',status);window.removeEventListener('online',reconnect);document.removeEventListener('visibilitychange',reconnect);};
  },[id]);
  return {
    syncStatus,
    retrySync:()=>id&&queueShelfSync(id,true),
    id,
    data,
    error,
    update: (fn: (s: Shelf) => Shelf) => {
      if (id && !changeShelf(id, fn))
        setError(
          "이 브라우저에 저장하지 못했어요. 저장 공간과 개인정보 보호 설정을 확인하세요.",
        );
    },
  };
}

export async function rememberMatchDeck(matchId: string, deck: Launch) {
  try {
    const r = await fetchCurrentUser();
    if (r.user)
      changeShelf(r.user.id, (s) => ({
        ...s,
        launches: Object.fromEntries(
          [...Object.entries(s.launches ?? {}), [matchId, deck]].slice(-100),
        ),
      }));
  } catch {
    /* optional local history cannot block matching */
  }
}
