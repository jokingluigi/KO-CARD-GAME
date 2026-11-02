import type { Deck } from './decks-client';
export type DeckReadOptions = {signal?:AbortSignal;timeoutMs?:number;onRetry?:()=>void};
class DeckReadError extends Error {constructor(message:string,readonly retryable:boolean){super(message);}}
/** Retry only this idempotent GET, never deck selection, match creation or other writes. */
export async function readDeckList(url:string, options:DeckReadOptions={}, fetcher:typeof fetch=fetch):Promise<Deck[]> {
 for(let attempt=0;attempt<2;attempt++){
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort',abort,{once:true});
  if(options.signal?.aborted)abort();
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},options.timeoutMs??12000);
  try{
   if(controller.signal.aborted)throw controller.signal.reason;
   const response=await fetcher(url,{credentials:'include',cache:'no-store',signal:controller.signal});
   if(!response.ok){const body=await response.json().catch(()=>({})) as {message?:unknown};throw new DeckReadError(typeof body.message==='string'?body.message:'덱 정보를 불러오지 못했어요. 다시 시도해 주세요.',response.status>=500);}
   const body=await response.json() as {decks?:unknown};
   if(!Array.isArray(body.decks))throw new DeckReadError('덱 정보를 확인하지 못했어요. 다시 시도해 주세요.',false);
   return body.decks as Deck[];
  }catch(error){
   if(options.signal?.aborted)throw options.signal.reason??error;
   const retryable=timedOut||error instanceof TypeError||error instanceof DeckReadError&&error.retryable;
   if(attempt===0&&retryable){options.onRetry?.();continue;}
   if(timedOut)throw new Error('출전 덱 확인 응답이 늦어지고 있어요. 연결을 확인한 뒤 다시 시도해 주세요.');
   throw error;
  }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
 }
 throw new Error('덱 정보를 불러오지 못했어요. 다시 시도해 주세요.');
}
