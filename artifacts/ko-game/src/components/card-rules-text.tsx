import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCardDefinitions } from '../game/cards/test-cards';
import { KEYWORD_DESCRIPTIONS, KEYWORD_LABELS } from './alt-inspector-utils';
import type { CardDefinition } from '../game/cards/types';

/** Uses real catalog entries, never invented cards, for references in effect text. */
export function CardRulesText({text}:{text:string}) {
 const [detail,setDetail]=useState<{title:string;text:string;card?:CardDefinition}|null>(null);
 const hold=useRef<ReturnType<typeof setTimeout>|null>(null);
 const holdOrigin=useRef({x:0,y:0});
 const clear=()=>{if(hold.current!==null)clearTimeout(hold.current);hold.current=null;};
 useEffect(()=>clear,[]);
 const cards=getCardDefinitions();
 const labels=Object.entries(KEYWORD_LABELS).filter(([key])=>KEYWORD_DESCRIPTIONS[key]);
 const names=[...new Set([...cards.map(c=>c.name).filter(n=>n.length>1),...labels.map(([,label])=>label)])].sort((a,b)=>b.length-a.length);
 const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const parts=names.length?text.split(new RegExp(`(${names.map(escape).join('|')})`,'g')):[text];
 return <>{parts.map((part,index)=>{
  const card=cards.find(c=>c.name===part),keyword=labels.find(([,label])=>label===part);
  if(!card&&!keyword)return <span key={index}>{part}</span>;
  const open=()=>setDetail(card?{title:card.name,text:card.rulesText,card}:{title:part,text:keyword![0] === 'ARMOR' && /아머\s*\(\d+\)/.test(text) ? `공격과 반격으로 받는 피해를 ${text.match(/아머\s*\((\d+)\)/)?.[1]} 줄입니다. 카드 효과 피해는 줄이지 않습니다. 최소 피해는 0입니다.` : keyword![0] === 'COUNTDOWN' && /카운트다운\s*\(\d+\)/.test(text) ? `남은 카운트다운: ${text.match(/카운트다운\s*\((\d+)\)/)?.[1]}. 다음 자기 턴 시작마다 1씩 감소하며 0이 되면 한 번 발동합니다. 침묵하면 해제되고, 재등장하면 처음부터 시작합니다.` : KEYWORD_DESCRIPTIONS[keyword![0]]!});
  return <span key={index} role="button" tabIndex={0} className="pointer-events-auto cursor-help text-amber-200 underline decoration-dotted" aria-label={`${part} 정보 보기`}
   onPointerDown={e=>{e.stopPropagation();clear();holdOrigin.current={x:e.clientX,y:e.clientY};hold.current=setTimeout(open,500);}}
   onPointerUp={e=>{e.stopPropagation();clear();}} onPointerCancel={clear} onPointerMove={e=>{if(Math.hypot(e.clientX-holdOrigin.current.x,e.clientY-holdOrigin.current.y)>10)clear();}}
   onClick={e=>{e.stopPropagation();open();}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();clear();open();}}
   onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();open();}}}>{part}</span>;
 })}{detail&&createPortal(<div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/80 p-4" onClick={e=>{e.stopPropagation();setDetail(null);}} onPointerDown={e=>e.stopPropagation()}><section role="dialog" aria-modal="true" aria-label={detail.title} className="max-h-[85dvh] w-full max-w-sm overflow-auto rounded-xl border border-amber-400 bg-neutral-950 p-5 text-white" onClick={e=>e.stopPropagation()}><h3 className="text-lg font-bold">{detail.title}</h3>{detail.card&&<>{detail.card.imageUrl&&<img src={detail.card.imageUrl} alt={detail.title} className="mx-auto my-3 max-h-[40dvh] object-contain"/>}<p className="my-3">비용 {detail.card.cost}{detail.card.cardType!=='TECHNIQUE'&&` · 공격 ${detail.card.attack} · 체력 ${detail.card.health}`}</p></>}<p className="whitespace-pre-wrap break-words">{detail.text||'효과 없음'}</p><button type="button" className="mt-4 min-h-12 w-full rounded border border-neutral-500" onClick={()=>setDetail(null)}>닫기</button></section></div>,document.body)}</>;
}
