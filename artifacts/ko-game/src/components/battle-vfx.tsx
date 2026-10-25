import {useEffect,useRef} from 'react';
import {prefersReducedMotion} from './presentation-config';
import {vfxBudget,vfxParticles,type BattleVfxKind} from './battle-vfx-model';
const assets:Record<BattleVfxKind,string[]>={
 IMPACT:['spark_01.png','smoke_04.png','dirt_01.png'],
 BLOCK:['circle_03.png','spark_01.png'],
 HEAL:['magic_03.png','star_01.png'],
 MAGIC:['magic_01.png','smoke_07.png'],
 GOLD:['star_01.png','light_01.png'],
 DESTROY:['scratch_01.png','dirt_01.png','smoke_04.png'],
 RETIRE:['smoke_01.png','dirt_01.png'],
};
const cache=new Map<string,HTMLImageElement>();
function texture(name:string) {
 const url=import.meta.env.BASE_URL+'vendor/kenney/particle/'+name;
 let image=cache.get(url);
 if(!image){image=new Image();image.src=url;cache.set(url,image);}
 return image;
}
export function preloadExternalVfx() { for(const name of new Set(Object.values(assets).flat()))texture(name); }
/** External Kenney CC0 textures. Canvas only positions/animates the supplied art. */
export function BattleVfx({kind,left,top,strength=3,seed,delay=0,duration=580,direction}:{kind:BattleVfxKind;left:number;top:number;strength?:number;seed:string;delay?:number;duration?:number;direction?:{x:number;y:number}}) {
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current;if(!canvas||prefersReducedMotion())return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const budget=vfxBudget(matchMedia('(pointer: coarse)').matches,false,strength);
  const dpr=Math.min(devicePixelRatio||1,budget.dpr),size=budget.size;
  canvas.width=size*dpr;canvas.height=size*dpr;canvas.style.width=size+'px';canvas.style.height=size+'px';ctx.scale(dpr,dpr);
  const images=assets[kind].map(texture),particles=vfxParticles(seed,budget.particles);
  let frame=0,start:number|undefined;
  const draw=(now:number)=>{
   start??=now;const elapsed=now-start-delay;
   ctx.clearRect(0,0,size,size);
   if(elapsed<0){frame=requestAnimationFrame(draw);return;}
   const t=Math.min(1,elapsed/Math.max(1,duration));if(t>=1||document.hidden)return;
   const axis=Math.atan2(direction?.y??0,direction?.x??1),force=Math.min(1.5,.5+strength/10);
   const stamp=(image:HTMLImageElement,x:number,y:number,w:number,rotation:number,alpha:number)=>{
    if(!image.complete||!image.naturalWidth)return;
    ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.globalAlpha=Math.max(0,alpha);
    ctx.drawImage(image,-w/2,-w/2,w,w);ctx.restore();
   };
   if(kind==='IMPACT') {
    // A short bright contact, then an expanding, settling cloud of authored smoke art.
    stamp(images[0],size/2,size/2,(55+55*t)*force,axis,Math.max(0,1-t/.2));
    const clouds=particles.slice(0,Math.min(7,particles.length));
    for(const [i,p] of clouds.entries()) {
     const a=p.angle,reach=(12+40*t)*force;
     stamp(images[1],size/2+Math.cos(a)*reach,size/2+Math.sin(a)*reach*.6+18*t*t,
       (48+90*t)*force,p.angle+p.spin*t*.1,Math.sin(Math.min(1,t*5)*Math.PI/2)*Math.pow(1-t,1.4)*.42);
    }
    for(const p of particles.slice(clouds.length)){
     const a=axis+(p.angle-Math.PI)*.8,d=p.speed*(1-Math.pow(1-t,3))*force;
     stamp(images[2],size/2+Math.cos(a)*d,size/2+Math.sin(a)*d+45*t*t,(7+p.size*4)*force,p.spin*t,Math.pow(1-t,2));
    }
    frame=requestAnimationFrame(draw);return;
   }
   // Contact burst, shield, spell or reward centre uses the authored texture itself.
   stamp(images[0],size/2,size/2,(38+110*t)*force,axis,Math.pow(1-t,3));
   for(const [i,p] of particles.entries()){
    const angle=p.angle;
    const travel=p.speed*(1-Math.pow(1-t,3))*force;
    const lift=kind==='HEAL'||kind==='GOLD';
    const x=size/2+Math.cos(angle)*travel;
    const y=size/2+Math.sin(angle)*travel+(lift?-65*t:25*t*t);
    const image=images[1+i%Math.max(1,images.length-1)]??images[0];
    const width=(i%3===0?22+35*t:6+p.size*4)*force;
    stamp(image,x,y,width,p.angle+p.spin*t,Math.pow(1-t,2)*(i%3===0?.45:.9));
   }
   frame=requestAnimationFrame(draw);
  };
  frame=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(frame);ctx.clearRect(0,0,size,size);};
 },[kind,left,top,strength,seed,delay,duration,direction?.x,direction?.y]);
 return <canvas ref={ref} aria-hidden="true" className="battle-vfx" data-external-vfx={kind} style={{left,top}}/>;
}
