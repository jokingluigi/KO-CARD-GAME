import {useEffect,useRef,useState,type ReactNode} from 'react';
import atlas from './pixelfx-atlas.json';
import {prefersReducedMotion} from './presentation-config';
import {readCombatPreferences} from './combat-preferences';
import {vfxBudget,type BattleVfxKind} from './battle-vfx-model';

type EffectId=keyof typeof atlas.effects;
const loaded=new Map<EffectId,Promise<HTMLImageElement>>();
function load(id:EffectId) {
  let pending=loaded.get(id);
  if(!pending) {
    pending=new Promise<HTMLImageElement>((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);image.onerror=()=>reject(Error('PIXELFX atlas unavailable'));
      image.src=import.meta.env.BASE_URL+'vendor/pixelfx/'+atlas.effects[id].file;
    });
    loaded.set(id,pending);
    void pending.catch(()=>{loaded.delete(id);});
  }
  return pending;
}
export function preloadPixelFx() {
  for(const id of Object.keys(atlas.effects) as EffectId[])void load(id).catch(()=>{});
}
export function pixelFxFor(kind:BattleVfxKind,strength:number):EffectId|null {
  return kind==='IMPACT'?(strength>=8?'critical':'impact'):kind==='BLOCK'||kind==='ARMOR'?'guard':kind==='HEAL'?'heal':null;
}
export type PixelFxProps={kind:BattleVfxKind;left:number;top:number;strength?:number;seed:string;delay?:number;duration?:number;direction?:{x:number;y:number}};

/** One cached atlas and one draw per authored frame. No game clock or input lock. */
export function PixelFxSprite({id,kind,left,top,strength=3,seed,delay=0,duration=580,direction,onUnavailable}:PixelFxProps&{id:EffectId;onUnavailable:()=>void}) {
  const ref=useRef<HTMLCanvasElement>(null);
  const failed=useRef(onUnavailable);failed.current=onUnavailable;
  useEffect(()=>{
    const canvas=ref.current;
    if(!canvas||prefersReducedMotion()||document.hidden)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const budget=vfxBudget(matchMedia('(pointer: coarse)').matches,false,strength);
    const dpr=Math.min(devicePixelRatio||1,budget.dpr),size=budget.size;
    canvas.width=size*dpr;canvas.height=size*dpr;canvas.style.width=size+'px';canvas.style.height=size+'px';
    ctx.scale(dpr,dpr);ctx.imageSmoothingEnabled=false;
    const sheet=atlas.effects[id],start=performance.now(),length=Math.max(1,duration);
    const scale=(size/128)*(.62+Math.min(12,Math.max(0,strength))*.022);
    const rotation=kind==='IMPACT'?Math.atan2(direction?.y??0,direction?.x??1):0;
    const opacity=readCombatPreferences().flash;
    let handle=0,disposed=false,last=-1;
    const clear=()=>{ctx.clearRect(0,0,size,size);};
    const hidden=()=>{if(document.hidden){cancelAnimationFrame(handle);clear();}};
    document.addEventListener('visibilitychange',hidden);
    void load(id).then(image=>{
      if(disposed)return;
      const draw=(now:number)=>{
        if(disposed||document.hidden)return;
        const elapsed=now-start-delay;
        if(elapsed>=length){clear();return;}
        if(elapsed>=0) {
          // The authored zero frame is empty. Start at contact, not a frame later.
          const frame=Math.min(sheet.frames-1,1+Math.floor(elapsed/length*(sheet.frames-2)));
          if(frame!==last) {
            last=frame;clear();ctx.save();ctx.globalAlpha=opacity;ctx.translate(size/2,size/2);ctx.rotate(rotation);
            ctx.drawImage(image,(frame%sheet.columns)*128,Math.floor(frame/sheet.columns)*128,128,128,-sheet.pivot[0]*scale,-sheet.pivot[1]*scale,128*scale,128*scale);
            ctx.restore();
          }
        }
        handle=requestAnimationFrame(draw);
      };
      handle=requestAnimationFrame(draw);
    }).catch(()=>{if(!disposed)failed.current();});
    return()=>{disposed=true;cancelAnimationFrame(handle);document.removeEventListener('visibilitychange',hidden);clear();};
  },[id,kind,left,top,strength,seed,delay,duration,direction?.x,direction?.y]);
  return <canvas ref={ref} aria-hidden="true" className="battle-vfx" data-external-vfx={kind} data-pixelfx={id} style={{left,top,imageRendering:'pixelated'}}/>;
}

export function PixelFxOrFallback({props,fallback}:{props:PixelFxProps;fallback:ReactNode}) {
  const [unavailable,setUnavailable]=useState(false);
  const id=pixelFxFor(props.kind,props.strength??3);
  if(unavailable||!id||readCombatPreferences().flash===0)return <>{fallback}</>;
  return <PixelFxSprite {...props} id={id} onUnavailable={()=>setUnavailable(true)}/>;
}
