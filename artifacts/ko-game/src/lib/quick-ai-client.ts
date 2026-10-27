import type {GameState} from '@/game';
export type QuickAiHandoff={opponentCosmetics?:import("@workspace/cosmetics").CosmeticLoadout;intro?:import("./ai-match-opening").MatchIntroDialogue;matchId:string;deckId:string;aiDeckId:string;difficulty:'NORMAL'|'HARD'|'BOSS';state:GameState;opponentName:string;selfChampion:{name:string;imageUrl:string|null;introLineOne:string|null};opponentChampion:{name:string;imageUrl:string|null;introLineOne:string|null}};
const base=`${import.meta.env.BASE_URL.replace(/\/$/,'')}/api/online-matches/quick-ai`;
export async function fetchQuickAI(id:string,signal:AbortSignal):Promise<QuickAiHandoff>{
 const response=await fetch(`${base}/${encodeURIComponent(id)}`,{credentials:'include',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(15_000)])});
 const body=await response.json();if(!response.ok)throw new Error(body.message??'대전을 준비하지 못했습니다.');return body;
}
const released=new Set<string>();
export async function releaseQuickAI(id:string){
 if(released.has(id))return;released.add(id);
 if(released.size>64)released.delete(released.values().next().value!);
 try {const response=await fetch(`${base}/${encodeURIComponent(id)}/release`,{method:'POST',credentials:'include',keepalive:true});if(!response.ok)released.delete(id);}
 catch {released.delete(id);}
}
