import {useEffect,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import recipes from './pixelfx-recipes.json';
import {PixelFxSprite,type EffectId} from './pixelfx-sprite';
import {prefersReducedMotion} from './presentation-config';
import {readCombatPreferences} from './combat-preferences';

export const pixelFxRecipes=recipes;
type Scene={id:number;area:number;left:number;top:number;width:number;duration:number;effect?:EffectId};
let sequence=0,scenes:Scene[]=[],root:ReturnType<typeof createRoot>|undefined;
const listeners=new Set<()=>void>(),timers=new Map<number,ReturnType<typeof setTimeout>>();
const publish=()=>listeners.forEach(listener=>listener());
const priority=(area:number)=>[10,65,68,69,72,78,79,84,85,103,108].includes(area)?3:[113,114,116].includes(area)?0:1;
function clear(){for(const timer of timers.values())clearTimeout(timer);timers.clear();scenes=[];publish();}
function SceneLayer(){
 const current=useSyncExternalStore(callback=>{listeners.add(callback);return()=>{listeners.delete(callback);};},()=>scenes);
 useEffect(()=>{const hidden=()=>{if(document.hidden)clear();};document.addEventListener('visibilitychange',hidden);window.addEventListener('resize',clear);window.addEventListener('ko-combat-preferences',clear);return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('resize',clear);window.removeEventListener('ko-combat-preferences',clear);};},[]);
 return <div aria-hidden="true" data-pixelfx-layer style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:410}}>{current.map(scene=><PixelFxArea key={scene.id} {...scene}/>)}</div>;
}
/** Cosmetic only: no callbacks into the game engine, bounded to six scenes. */
export function emitPixelFx(area:number,target?:Element|null,options:Partial<Omit<Scene,'id'|'area'>>={}) {
 if(typeof document==='undefined'||document.hidden||prefersReducedMotion()||readCombatPreferences().flash===0)return;
 const rect=target?.getBoundingClientRect();
 if(target&&(!rect||rect.width===0||rect.height===0))return;
 if(!root){const host=document.createElement('div');host.dataset.pixelfxHost='';document.body.append(host);root=createRoot(host);root.render(<SceneLayer/>);}
 const limit=readCombatPreferences().quality==='LOW'?3:6;
 while(scenes.length>=limit){const oldest=[...scenes].sort((a,b)=>priority(a.area)-priority(b.area)||a.id-b.id)[0];if(priority(oldest.area)>priority(area))return;clearTimeout(timers.get(oldest.id));timers.delete(oldest.id);scenes=scenes.filter(scene=>scene.id!==oldest.id);}
 const scene:Scene={id:++sequence,area,left:rect?rect.left+rect.width/2:innerWidth/2,top:rect?rect.top+rect.height/2:innerHeight*.46,width:rect?Math.min(rect.width,innerWidth*.8):Math.min(innerWidth*.65,620),duration:800,...options};
 scenes=[...scenes,scene];publish();timers.set(scene.id,setTimeout(()=>{timers.delete(scene.id);scenes=scenes.filter(item=>item.id!==scene.id);publish();},scene.duration+100));
}
export function PixelFxArea({area,left,top,width=170,duration=800,effect}:{area:number;left:number;top:number;width?:number;duration?:number;effect?:EffectId}) {
 const recipe=recipes[String(area) as keyof typeof recipes];
 if(!recipe)return null;
 const large=[6,10,26,65,68,69,72,78,84,85,89,103,108].includes(area);
 const layers=readCombatPreferences().quality==='LOW'?1:2;
 return <>{(effect?[effect]:recipe.effects.slice(0,layers)).map((id,index)=><PixelFxSprite key={id} id={id as EffectId} kind="MAGIC" seed={`${area}:${index}`} area={area} left={left} top={top} targetWidth={width} sizeMultiplier={large?1.85:1.25} duration={duration} delay={index*65} opacity={index===0?.85:.55} onUnavailable={()=>{}}/>)}</>;
}
/** Explicit success/change key; mounting static reward descriptions never grants a reward effect. */
export function usePixelFx(area:number,key:unknown,enabled=true){
 useEffect(()=>{if(enabled)emitPixelFx(area);},[area,key,enabled]);
}
export function PixelFxPreview(){
 const [area,setArea]=useState(4);
 return <section className="rounded border border-neutral-700 p-4"><h3 className="font-bold">PIXELFX 효과 미리보기</h3><p className="text-sm text-neutral-400">섬광·모션 설정을 따릅니다.</p><select aria-label="미리볼 효과" value={area} onChange={event=>setArea(Number(event.target.value))} className="my-3 max-w-full bg-neutral-900">{Object.entries(recipes).map(([id,recipe])=><option key={id} value={id}>{id}. {recipe.name}</option>)}</select><button type="button" className="ml-3 rounded border px-3 py-2" onClick={event=>emitPixelFx(area,event.currentTarget,{width:210})}>재생</button></section>;
}
