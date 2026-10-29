import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "./ui/dialog";
import {useState} from 'react';
import {CardArtwork} from './card-artwork';
import {cosmeticAssetDisplay,type CosmeticItem} from '@workspace/cosmetics';
import './physical-card.css';
export function SkinComparison({item,base}:{item:CosmeticItem;base?:string|null}) {
 const [split,setSplit]=useState(50),[open,setOpen]=useState(false);
 const key=item.imageAssets.art?'art':item.imageAssets.portrait?'portrait':'intro';
 const skin=item.imageAssets[key];if(!base||!skin)return null;
 return <><button type="button" onClick={()=>setOpen(true)}>{item.name} 기본 외형과 비교</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="border-neutral-700 bg-neutral-950 text-white"><DialogHeader><DialogTitle>{item.name} 외형 비교</DialogTitle><DialogDescription>슬라이더를 움직여 같은 영역에서 기본 외형과 스킨을 비교하세요.</DialogDescription></DialogHeader><div className="ko-skin-comparison" aria-label={`${item.name} 기본 외형 비교`}>
  <div><CardArtwork src={base} alt="기본 외형" imageDisplayMode="CONTAIN" className="h-full w-full"/></div>
  <div style={{clipPath:`inset(0 0 0 ${split}%)`}}><CardArtwork src={skin} displayOverride={cosmeticAssetDisplay(item.imageAssets,key)} alt={item.name} imageDisplayMode="CONTAIN" className="h-full w-full"/></div>
  <span className="ko-compare-label" style={{left:4}}>기본</span><span className="ko-compare-label" style={{right:4}}>스킨</span>
  <input type="range" min={0} max={100} value={split} aria-label={`${item.name} 비교 위치`} onChange={e=>setSplit(Number(e.target.value))}/>
 </div></DialogContent></Dialog></>;
}
