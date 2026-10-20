import {useEffect,useState} from 'react';
import {useLocation} from 'wouter';
import {COSMETIC_TYPES,skinKey,type CosmeticType,type CosmeticItem} from '@workspace/cosmetics';
import {fetchCosmetics,equipCosmetic,type CosmeticInventory} from '@/lib/cosmetics-client';
import {CosmeticPreview} from '@/components/cosmetic-preview';
import '@/components/cosmetics.css';
export const cosmeticLabels:Record<CosmeticType,string>={CHAMPION_SKIN:'챔피언 스킨',CARD_SKIN:'선수 카드 스킨',CARD_BACK:'카드 뒷면',IMAGE_EMOTE:'이모티콘'};
export default function Cosmetics(){
 const [,navigate]=useLocation();const [data,setData]=useState<CosmeticInventory|null>(null),[type,setType]=useState<CosmeticType>('CHAMPION_SKIN'),[slot,setSlot]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState('');
 async function load(){setError('');try{setData(await fetchCosmetics());}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load();},[]);
 async function equip(item:CosmeticItem|null,targetSlot:string){setBusy(true);setError('');try{const loadout=await equipCosmetic(targetSlot,item?.id??null);setData(old=>old?{...old,loadout}:old);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="cosmetics"><button onClick={()=>navigate('/')}>← 메인 메뉴</button><h1 className="text-2xl">꾸미기</h1><p>장착 변경은 다음 대전부터 적용돼. 스킨은 능력치와 효과를 바꾸지 않아.</p><nav aria-label="꾸미기 종류">{COSMETIC_TYPES.map(t=><button key={t} aria-pressed={t===type} onClick={()=>setType(t)}>{cosmeticLabels[t]}</button>)}</nav>
 {error&&<div role="alert">{error} <button onClick={()=>void load()}>다시 불러오기</button></div>}{!data&&!error&&<p role="status">보유 아이템을 불러오는 중…</p>}
 <input aria-label="보유 아이템 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder="보유 아이템 검색"/>
 {type==='IMAGE_EMOTE'&&<section><h2>빠른 사용 슬롯 · 중복 장착 불가</h2><nav>{[1,2,3,4].map(n=><div key={n}><button aria-pressed={slot===n} onClick={()=>setSlot(n)}>슬롯 {n}: {data?.loadout.emotes[n-1]?.name??'비어 있음'}</button><button disabled={busy||!data?.loadout.emotes[n-1]} aria-label={`슬롯 ${n} 해제`} onClick={()=>void equip(null,`emote:${n}`)}>해제</button></div>)}</nav></section>}
 <div className="cosmetics-grid">{data?.owned.filter(({item})=>item.type===type&&item.name.includes(query)).map(({item})=>{
 const equipped=Object.values(data.loadout.skins).some(i=>i.id===item.id)||data.loadout.cardBack?.id===item.id||data.loadout.emotes.some(i=>i?.id===item.id);
 return <article className="cosmetics-item" key={item.id}><div className="cosmetics-preview"><CosmeticPreview item={item} cards={data.cards} champions={data.champions}/></div><h2>{item.name}</h2><p>{item.description}</p><span>{!item.isActive?'비활성 · 소유 기록 보존':equipped?'장착 중':'미장착'}</span><button disabled={busy||!item.isActive} onClick={()=>void equip(item,item.type==='IMAGE_EMOTE'?`emote:${slot}`:skinKey(item.type,item.targetId))}>장착{type==='IMAGE_EMOTE'?` · 슬롯 ${slot}`:''}</button>{equipped&&item.type!=='IMAGE_EMOTE'&&<button disabled={busy} onClick={()=>void equip(null,skinKey(item.type,item.targetId))}>기본 외형으로</button>}</article>;
 })}</div>{data&&!data.owned.some(({item})=>item.type===type)&&<p className="py-10">보유한 {cosmeticLabels[type]}이 없어.</p>}</main>;
}
