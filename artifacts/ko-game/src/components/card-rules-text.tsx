import {upgradeDisplayText} from "@workspace/effect-registry";
import {useTagLabels,displayTagReferences} from '@/lib/tag-labels';
import { cardSilenceProtection } from '../lib/card-protection-display';
import { SilenceImmunityNotice } from './silence-immunity-notice';
import {RecoverableArtwork} from "./recoverable-artwork";
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { getCardDefinitions } from '../game/cards/test-cards';
import { fetchPublicCardTagCatalog } from '../game/cards/published-cards';
import { KEYWORD_DESCRIPTIONS, KEYWORD_LABELS } from './alt-inspector-utils';
import type { CardDefinition } from '../game/cards/types';

/** Uses real catalog entries, never invented cards, for references in effect text. */
export function CardRulesText({text,interactive=true}:{text:string;interactive?:boolean}) {
 const tagLabels=useTagLabels();
 text=displayTagReferences(upgradeDisplayText(text),tagLabels);
 const indexRef=useRef<{cards:CardDefinition[];pattern:RegExp|null;byName:Map<string,CardDefinition>}|null>(null);
 const [detail,setDetail]=useState<{title:string;text:string;card?:CardDefinition}|null>(null);
 const [publicCards,setPublicCards]=useState<CardDefinition[]>([]);
 useEffect(()=>{
  if(!interactive)return;
  let disposed=false;
  // Collection/deck details can open before any match has registered a runtime catalog.
  // Reuse the published tag-browser loader and its shared request/cache; never mutate battle data.
  const load=()=>{void fetchPublicCardTagCatalog().then(cards=>{if(!disposed)setPublicCards(cards);}).catch(()=>{ /* Runtime references and keyword help stay available offline. */ });};
  const visible=()=>{if(!document.hidden)load();};
  load();window.addEventListener("online",load);document.addEventListener("visibilitychange",visible);
  return()=>{disposed=true;window.removeEventListener("online",load);document.removeEventListener("visibilitychange",visible);};
 },[interactive]);
 const hold=useRef<ReturnType<typeof setTimeout>|null>(null);
 const holdOrigin=useRef({x:0,y:0});
 const trigger=useRef<HTMLElement|null>(null);
 const clear=()=>{if(hold.current!==null)clearTimeout(hold.current);hold.current=null;};
 useEffect(()=>{window.addEventListener("ko-card-gesture-start",clear);window.addEventListener("blur",clear);return()=>{clear();window.removeEventListener("ko-card-gesture-start",clear);window.removeEventListener("blur",clear);};},[]);
 useEffect(()=>{if(!interactive){clear();setDetail(null);}},[interactive]);
 if(!interactive)return <>{text}</>;
 const cards=[...new Map([...publicCards,...getCardDefinitions()].map(card=>[card.id,card])).values()];
 const labels=Object.entries(KEYWORD_LABELS).filter(([key])=>KEYWORD_DESCRIPTIONS[key]);
 if(!indexRef.current || indexRef.current.cards.length!==cards.length || cards.some((card,i)=>indexRef.current!.cards[i]!==card)){
  const names=[...new Set([...cards.map(c=>c.name).filter(n=>n.length>1),...labels.map(([,label])=>label)])].sort((a,b)=>b.length-a.length);
  const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  indexRef.current={cards,pattern:names.length?new RegExp(`(${names.map(escape).join('|')})`,'g'):null,byName:new Map([...cards].reverse().map(card=>[card.name,card]))};
 }
 const matcher=indexRef.current!;
 const parts=matcher.pattern?text.split(matcher.pattern):[text];
 return <>{parts.map((part,index)=>{
  const card=matcher.byName.get(part),keyword=labels.find(([,label])=>label===part);
  if(!card&&!keyword)return <span key={index}>{part}</span>;
  const open=()=>setDetail(card?{title:card.name,text:card.rulesText,card}:{title:part,text:keyword![0] === 'ARMOR' && /아머\s*\(\d+\)/.test(text) ? `공격과 반격으로 받는 피해를 ${text.match(/아머\s*\((\d+)\)/)?.[1]} 줄입니다. 카드 효과 피해는 줄이지 않습니다. 최소 피해는 0입니다.` : keyword![0] === 'COUNTDOWN' && /카운트다운\s*\(\d+\)/.test(text) ? `남은 카운트다운: ${text.match(/카운트다운\s*\((\d+)\)/)?.[1]}. 다음 자기 턴 시작마다 1씩 감소하며 0이 되면 한 번 발동합니다. 침묵하면 해제되고, 재등장하면 처음부터 시작합니다.` : KEYWORD_DESCRIPTIONS[keyword![0]]!});
  return <span key={index} role="button" tabIndex={0} className="pointer-events-auto cursor-help text-amber-200 underline decoration-dotted" aria-label={`${part} 정보 보기`}
   onPointerDown={e=>{trigger.current=e.currentTarget;clear();holdOrigin.current={x:e.clientX,y:e.clientY};if(e.pointerType==='touch')hold.current=setTimeout(open,500);}}
   onPointerUp={e=>{e.stopPropagation();clear();}} onPointerCancel={clear} onPointerMove={e=>{if(Math.hypot(e.clientX-holdOrigin.current.x,e.clientY-holdOrigin.current.y)>10)clear();}}
   onClick={e=>{e.stopPropagation();trigger.current=e.currentTarget;open();}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();trigger.current=e.currentTarget;clear();open();}}
   onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();trigger.current=e.currentTarget;open();}}}>{part}</span>;
 })}<Dialog open={detail!==null} onOpenChange={next=>{if(!next){clear();setDetail(null);}}}>
  {detail&&<DialogContent data-card-rules-dialog="true" overlayClassName="!z-[350]" className="!z-[351] max-h-[85dvh] w-[calc(100vw-32px)] max-w-sm overflow-auto rounded-xl border-amber-400 bg-neutral-950 p-5 text-white"
   overlayProps={{onClick:e=>{e.stopPropagation();clear();setDetail(null);},onPointerUp:e=>e.stopPropagation()}}
   onCloseAutoFocus={e=>{e.preventDefault();trigger.current?.focus();}}
   onClick={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
   <DialogTitle className="pr-6 text-lg font-bold">{detail.title}</DialogTitle>
   {detail.card&&<SilenceImmunityNotice {...cardSilenceProtection(detail.card)}/>}
   {detail.card&&<>{detail.card.imageUrl&&<RecoverableArtwork src={detail.card.imageUrl} alt={detail.title} className="mx-auto my-3 max-h-[40dvh] object-contain"/>}<p className="my-3">비용 {detail.card.cost}{detail.card.cardType!=='TECHNIQUE'&&` · 공격 ${detail.card.attack} · 체력 ${detail.card.health}`}</p></>}
   <DialogDescription className="ko-readable-content whitespace-pre-wrap break-words text-white">{detail.text||'효과 없음'}</DialogDescription>
   <button type="button" className="mt-4 min-h-12 w-full rounded border border-neutral-500" onClick={()=>setDetail(null)}>닫기</button>
  </DialogContent>}
 </Dialog></>;
}
