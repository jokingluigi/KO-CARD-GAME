import {useEffect,useRef,useState,type ReactNode} from 'react';
import atlas from './pixelfx-atlas.json';
import library from './pixelfx-library.json';
import {prefersReducedMotion} from './presentation-config';
import {readCombatPreferences} from './combat-preferences';
import {vfxBudget,type BattleVfxKind} from './battle-vfx-model';

export type EffectId=keyof typeof atlas.effects | keyof typeof library.effects;
function sheetFor(id:EffectId) {
 const entry=(library.effects as Record<string,typeof library.effects['holy/heal']>)[id];
 return entry ?? {...atlas.effects[id as keyof typeof atlas.effects],frameSize:[128,128],visibleWidth:64,visibleHeight:64};
}
const loaded=new Map<EffectId,Promise<HTMLImageElement>>();
function load(id:EffectId) {
  let pending=loaded.get(id);
  if(!pending) {
    pending=new Promise<HTMLImageElement>((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);image.onerror=()=>reject(Error('PIXELFX atlas unavailable'));
      image.src=import.meta.env.BASE_URL+'vendor/pixelfx/'+sheetFor(id).file;
    });
    loaded.set(id,pending);
    if(loaded.size>(matchMedia('(pointer: coarse)').matches?12:32))loaded.delete(loaded.keys().next().value!);
    void pending.catch(()=>{loaded.delete(id);});
  }
  return pending;
}
export function preloadPixelFx() {
  for(const id of ['impacts/blunt-hit','impacts/crit-hit','impacts/shield-block','holy/heal'] as EffectId[])void load(id).catch(()=>{});
}
export function pixelFxFor(kind:BattleVfxKind,strength:number):EffectId|null {
  return ({IMPACT:strength>=8?'impacts/crit-hit':'impacts/blunt-hit',BLOCK:'impacts/shield-block',ARMOR:'holy/divine-shield',HEAL:'holy/heal',MAGIC:'arcane/mana-burst',GOLD:'ui/coin-collect',DESTROY:'spawn/shatter-death',RETIRE:'spawn/soul-rise'} as const)[kind];
}
export type PixelFxProps={kind:BattleVfxKind;left:number;top:number;strength?:number;seed:string;delay?:number;duration?:number;direction?:{x:number;y:number};effect?:EffectId;targetWidth?:number;sizeMultiplier?:number;opacity?:number;area?:number};

/** One cached atlas and one draw per authored frame. No game clock or input lock. */
export function PixelFxSprite({id,kind,left,top,strength=3,seed,delay=0,duration=580,direction,targetWidth,sizeMultiplier,opacity:requestedOpacity=1,area,onUnavailable}:PixelFxProps&{id:EffectId;onUnavailable:()=>void}) {
  const ref=useRef<HTMLCanvasElement>(null);
  const failed=useRef(onUnavailable);failed.current=onUnavailable;
  useEffect(()=>{
    const canvas=ref.current;
    if(!canvas||prefersReducedMotion()||document.hidden)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const budget=vfxBudget(matchMedia('(pointer: coarse)').matches,false,strength);
    const sheet=sheetFor(id);
    const visible=(targetWidth??(matchMedia('(pointer: coarse)').matches?110:170))*(sizeMultiplier??(kind==='IMPACT'?(strength>=8?1.9:1.35):1.25));
    const extent=Math.max(sheet.pivot[0],sheet.frameSize[0]-sheet.pivot[0],sheet.pivot[1],sheet.frameSize[1]-sheet.pivot[1]);
    const canvasLimit=matchMedia('(pointer: coarse)').matches?900:1400;
    const scale=Math.min(visible/Math.max(1,sheet.visibleWidth),innerHeight*.88/Math.max(1,sheet.visibleHeight),(canvasLimit-4)/(extent*2));
    const size=Math.min(matchMedia('(pointer: coarse)').matches?900:1400,Math.ceil(Math.max(sheet.pivot[0],sheet.frameSize[0]-sheet.pivot[0],sheet.pivot[1],sheet.frameSize[1]-sheet.pivot[1])*scale*2+4));
    const dpr=Math.min(devicePixelRatio||1,budget.dpr);
    canvas.width=size*dpr;canvas.height=size*dpr;canvas.style.width=size+'px';canvas.style.height=size+'px';
    ctx.scale(dpr,dpr);ctx.imageSmoothingEnabled=false;
    let start:number|undefined; const length=Math.max(1,duration);
    const rotation=kind==='IMPACT'&&!id.includes('/')?Math.atan2(direction?.y??0,direction?.x??1):0;
    const opacity=readCombatPreferences().flash*requestedOpacity;
    let handle=0,disposed=false,last=-1;
    const clear=()=>{ctx.clearRect(0,0,size,size);};
    const hidden=()=>{if(document.hidden){cancelAnimationFrame(handle);clear();}};
    document.addEventListener('visibilitychange',hidden);
    void load(id).then(image=>{
      if(disposed)return;
      const draw=(now:number)=>{
        if(disposed||document.hidden)return;
        start??=now; const elapsed=now-start-delay;
        if(elapsed>=length){clear();return;}
        if(elapsed>=0) {
          // The authored zero frame is empty. Start at contact, not a frame later.
          const frame=Math.min(sheet.frames-1,1+Math.floor(elapsed/length*(sheet.frames-2)));
          if(frame!==last) {
            last=frame;clear();ctx.save();ctx.globalAlpha=opacity;ctx.translate(size/2,size/2);ctx.rotate(rotation);
            const [w,h]=sheet.frameSize;
            ctx.drawImage(image,(frame%sheet.columns)*w,Math.floor(frame/sheet.columns)*h,w,h,-sheet.pivot[0]*scale,-sheet.pivot[1]*scale,w*scale,h*scale);
            ctx.restore();
          }
        }
        handle=requestAnimationFrame(draw);
      };
      handle=requestAnimationFrame(draw);
    }).catch(()=>{if(!disposed)failed.current();});
    return()=>{disposed=true;cancelAnimationFrame(handle);document.removeEventListener('visibilitychange',hidden);clear();};
  },[id,kind,left,top,strength,seed,delay,duration,direction?.x,direction?.y,targetWidth,sizeMultiplier,requestedOpacity]);
  return <canvas ref={ref} aria-hidden="true" className="battle-vfx" data-external-vfx={kind} data-pixelfx={id} data-fx-area={area} style={{left,top,imageRendering:'pixelated'}}/>;
}

export function PixelFxOrFallback({props,fallback}:{props:PixelFxProps;fallback:ReactNode}) {
  const [unavailable,setUnavailable]=useState(false);
  const id=props.effect??pixelFxFor(props.kind,props.strength??3);
  if(unavailable||!id||readCombatPreferences().flash===0)return <>{fallback}</>;
  return <PixelFxSprite {...props} id={id} onUnavailable={()=>setUnavailable(true)}/>;
}
