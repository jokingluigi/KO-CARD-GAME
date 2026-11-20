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

const escapeRe=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Other spellings card texts use for a keyword. */
const KEYWORD_ALIASES:Record<string,string>={'연격':'MULTI_STRIKE','공격 불가':'CANNOT_ATTACK'};
/** Game terms that are not card keywords but appear in effect text. */
const GLOSSARY:Record<string,string>={'무적':'피해를 전혀 받지 않으며, 파괴되거나 리타이어되지 않습니다.'};

/** Uses real catalog entries, never invented cards, for references in effect text. */
export function CardRulesText({text,interactive=true}:{text:string;interactive?:boolean}) {
 const tagLabels=useTagLabels();
 text=displayTagReferences(upgradeDisplayText(text),tagLabels);
 const indexRef=useRef<{cards:CardDefinition[];pattern:RegExp|null;names:string[];byName:Map<string,CardDefinition>}|null>(null);
 const [detail,setDetail]=useState<{title:string;text:string;card?:CardDefinition;tag?:string;tagCards?:CardDefinition[]}|null>(null);
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
  const byName=new Map<string,CardDefinition>([...cards].reverse().map(card=>[card.name,card]));
  // Spellings the card texts actually use for the same card: spaces dropped ("밀크메이드"), "각성 리온" for "리온(각성)".
  for(const card of [...cards].reverse()){
   const tight=card.name.replace(/\s+/g,'');
   if(tight!==card.name&&tight.length>1&&!byName.has(tight))byName.set(tight,card);
   const awake=card.name.match(/^(.+)\(각성\)$/);
   if(awake&&!byName.has(`각성 ${awake[1]}`))byName.set(`각성 ${awake[1]}`,card);
  }
  const names=[...new Set([...[...byName.keys()].filter(n=>n.length>1),...labels.map(([,label])=>label),...Object.keys(KEYWORD_ALIASES),...Object.keys(GLOSSARY)])].sort((a,b)=>b.length-a.length);
  indexRef.current={cards,pattern:null,names,byName};
 }
 const matcher=indexRef.current!;
 // Terms this text defines itself ("어둠의 사자:...") and tag references ('마피아' 태그).
 const localDefs=new Map<string,string>();
 for(const line of text.split('\n')){const m=line.match(/^\s*([^:：\n]{2,14})\s*[:：]\s*(.+)$/);if(m&&!/^(등장|퇴장|턴 종료|턴 시작|콤보|업그레이드|조건|공격 시|반격|유언|각성)$/.test(m[1]!.trim())&&new RegExp(`['‘“"]${escapeRe(m[1]!.trim())}['’”"]`).test(text))localDefs.set(m[1]!.trim(),m[2]!.trim());}
 const tagNames=[...new Set([...Object.values(tagLabels),...Object.keys(tagLabels)])].filter(t=>t.length>1);
 const sources=[...new Set([...localDefs.keys(),...matcher.names,...tagNames])].sort((a,b)=>b.length-a.length).map(escapeRe);
 const pattern=sources.length?new RegExp(`(${sources.join('|')})`,'g'):null;
 const pieces:Array<{text:string;at:number}>=[];
 if(pattern){let last=0;for(const m of text.matchAll(pattern)){const at=m.index!;if(at>last)pieces.push({text:text.slice(last,at),at:-1});pieces.push({text:m[0],at});last=at+m[0].length;}if(last<text.length)pieces.push({text:text.slice(last),at:-1});}else pieces.push({text,at:-1});
 const tagCards=(tag:string)=>{const keys=new Set([tag,...Object.entries(tagLabels).filter(([,l])=>l===tag).map(([k])=>k)]);return cards.filter(c=>!c.isToken&&(c.tags??[]).some(t=>keys.has(t)));};
 return <>{pieces.map((piece,index)=>{
  const part=piece.text;
  if(piece.at<0)return <span key={index}>{part}</span>;
  const before=text.slice(Math.max(0,piece.at-1),piece.at),after=text.slice(piece.at+part.length,piece.at+part.length+6);
  const isTagRef=tagNames.includes(part)&&(/^['’"”]?\s*태그/.test(after)||(!matcher.byName.has(part)&&/['‘“"]/.test(before)&&/^['’"”]/.test(after)));
  const isDefLine=localDefs.has(part)&&!/['‘“"]/.test(before);
  if(isDefLine)return <span key={index}>{part}</span>;
  const card=isTagRef?undefined:matcher.byName.get(part);
  const keyword=labels.find(([,label])=>label===part)??(KEYWORD_ALIASES[part]?labels.find(([key])=>key===KEYWORD_ALIASES[part]):undefined);
  const def=localDefs.get(part)??GLOSSARY[part];
  if(!isTagRef&&!card&&!keyword&&!def)return <span key={index}>{part}</span>;
  const open=()=>setDetail(isTagRef?{title:`'${part}' 태그`,text:'',tag:part,tagCards:tagCards(part)}:def&&!card?{title:part,text:def}:card?{title:card.name,text:card.rulesText,card}:{title:keyword![1],text:keyword![0] === 'ARMOR' && /아머\s*\(\d+\)/.test(text) ? `공격과 반격으로 받는 피해를 ${text.match(/아머\s*\((\d+)\)/)?.[1]} 줄입니다. 카드 효과 피해는 줄이지 않습니다. 최소 피해는 0입니다.` : keyword![0] === 'COUNTDOWN' && /카운트다운\s*\(\d+\)/.test(text) ? `남은 카운트다운: ${text.match(/카운트다운\s*\((\d+)\)/)?.[1]}. 다음 자기 턴 시작마다 1씩 감소하며 0이 되면 한 번 발동합니다. 침묵하면 해제되고, 재등장하면 처음부터 시작합니다.` : KEYWORD_DESCRIPTIONS[keyword![0]]!});
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
   {detail.tag?<><DialogDescription className="text-sm text-neutral-400">이 태그를 가진 카드 {detail.tagCards?.length??0}장</DialogDescription>
    <div className="mt-3 grid grid-cols-2 gap-1.5">{(detail.tagCards??[]).map(c=><button key={c.id} type="button" className="min-h-10 rounded border border-neutral-700 bg-neutral-900 px-2 text-left text-sm text-neutral-100" onClick={()=>setDetail({title:c.name,text:c.rulesText,card:c})}>{c.name}</button>)}</div></>
   :<DialogDescription className="ko-readable-content whitespace-pre-wrap break-words text-white">{detail.text||'효과 없음'}</DialogDescription>}
   <button type="button" className="mt-4 min-h-12 w-full rounded border border-neutral-500" onClick={()=>setDetail(null)}>닫기</button>
  </DialogContent>}
 </Dialog></>;
}
