import type {CardAnimationRect} from './card-play-animation-utils';
/** Presentation geometry only. Both rectangles remain in viewport coordinates. */
export function combatContact(source:CardAnimationRect,target:CardAnimationRect) {
 const sx=source.left+source.width/2,sy=source.top+source.height/2;
 const tx=target.left+target.width/2,ty=target.top+target.height/2;
 const length=Math.hypot(tx-sx,ty-sy);
 if(length<1)return {dx:0,dy:0,x:tx,y:ty};
 const ux=(tx-sx)/length,uy=(ty-sy)/length;
 const radius=(r:CardAnimationRect,scale=1)=>Math.min(Math.abs(ux)>1e-6?r.width*scale/2/Math.abs(ux):Infinity,Math.abs(uy)>1e-6?r.height*scale/2/Math.abs(uy):Infinity);
 const targetRadius=radius(target),sourceRadius=radius(source,1.06);
 const travel=Math.max(0,length-targetRadius-sourceRadius+Math.min(28,sourceRadius*.45));
 return {dx:ux*travel,dy:uy*travel,x:tx-ux*targetRadius,y:ty-uy*targetRadius};
}
