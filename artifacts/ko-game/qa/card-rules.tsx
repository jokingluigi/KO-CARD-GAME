// Development-only fixture using the same card, inspector and modal as the game.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { CardRulesText } from '../src/components/card-rules-text';
import { CardRenderer } from '../src/components/card-renderer';
import { CardDetailDialog } from '../src/components/card-detail-dialog';
import { AltInspectProvider, Inspectable } from '../src/components/alt-inspector';
import { setRuntimeCardDefinitions } from '../src/game';
const reference = {id:'qa-reference',name:'정보 확인 선수',cost:2,attack:3,health:4,rulesText:'도발',keywords:[] as [],abilities:[],isToken:false,isChampionToken:false};
setRuntimeCardDefinitions([reference]);
const text = '아머(2). 정보 확인 선수를 소환합니다. 카운트다운(3).';
function Scene() {
 const [actions,setActions]=useState(0);
 const [open,setOpen]=useState(false);
 return <AltInspectProvider><main className="min-h-screen bg-neutral-950 p-6 text-white">
  <output data-testid="actions">{actions}</output>
  <div data-testid="direct" className="my-6" onClick={()=>setActions(n=>n+1)}><CardRulesText text={text}/></div>
  <div data-testid="card" className="w-56"><CardRenderer name="상호작용 검사" cost={1} attack={2} health={3} rulesText={text} size="detail" onClick={()=>setActions(n=>n+1)}/></div>
  <Inspectable showOnHover content={<div data-testid="inspector-rules"><CardRulesText text={text}/></div>}><button className="my-8" data-testid="inspect">카드 정보 보기</button></Inspectable>
  <button data-testid="details" onClick={()=>setOpen(true)}>상세 카드 열기</button>
  <CardDetailDialog open={open} onOpenChange={setOpen} card={{id:'qa-source',name:'상세 검사',cardType:'WRESTLER',cost:1,attack:2,health:3,text,rarity:'NORMAL',imageUrl:null,imageDisplayMode:'COVER',imageScale:1,imagePositionX:50,imagePositionY:50}}/>
 </main></AltInspectProvider>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Scene/></React.StrictMode>);
