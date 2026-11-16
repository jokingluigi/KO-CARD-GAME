/** KO board vocabulary: brass, charcoal, jade and restrained burgundy.
 * Shapes are authored for a card surface; no stock characters or fantasy scenery.
 */
import {makeKoEffects} from './ko-pixelfx-effects.mjs';
export function makeKoArtDirection(core){
 const {Rng,TAU,ease}=core,original=makeKoEffects(core);
 const brass=['#201a18','#514338','#86704c','#b49861','#d3b67b','#e1ce9d','#eee0bd'];
 const jade=['#182320','#294539','#3c6751','#648e6a','#9ab58b','#c9d6af','#e0dfc0'];
 const red=['#251a1a','#4b2928','#70403a','#9b5b4a','#c48a69','#ddbc91','#e7d2ab'];
 const violet=['#201b26','#403047','#67506d','#907395','#b598b5','#d1b8cf','#e1cfdd'];
 const ash=['#211e1b','#423a32','#665949','#8b785c','#af9871','#ccb68b','#dfcda4'];
 const result={};
 for(const id of ['impact','critical','guard','heal']){
  const effect=original[id];result['ko/'+id]={...effect,meta:{...effect.meta,options:{...effect.meta.options,palette:id==='heal'?jade:brass}}};
 }
 function authored(id,palette,draw,duration=.66){result['ko/'+id]={meta:{name:'KO '+id,size:[128,128],origin:[64,64],duration,fps:30,loop:false,bg:'dark',options:{palette,seed:19}},draw(p,t,o){if(t<=0||t>=duration-1e-6)return;const u=t/duration,a=Math.min(1,u*12)*Math.pow(1-u,1.1);draw(p,u,a,core.fit(o.palette,7),new Rng(o.seed));}};}
 const ellipse=(p,rx,ry,y,c,a)=>p.polyline(Array.from({length:33},(_,i)=>[Math.cos(i/32*TAU)*rx,y+Math.sin(i/32*TAU)*ry]),c,a);
 function sparks(p,u,a,C,R,count=9,radius=32){for(let i=0;i<count;i++){const angle=R.range(0,TAU),d=(5+radius*ease.outQuart(u))*R.range(.5,1),x=Math.cos(angle)*d,y=Math.sin(angle)*d+9*u*u;p.line(x,y,x-Math.cos(angle)*(2+3*(1-u)),y-Math.sin(angle)*(2+3*(1-u)),C[i%2?3:5],a*.8);}}
 function corners(p,u,a,C,inward=false){const r=inward?30-8*u:23+7*u;for(const sx of [-1,1])for(const sy of [-1,1]){p.polyline([[sx*r,sy*(r-8)],[sx*r,sy*r],[sx*(r-8),sy*r]],C[4],a);}}
 authored('slash',brass,(p,u,a,C,R)=>{for(let i=0;i<2;i++){const d=i*10-6,k=ease.outQuart(Math.min(1,u*3));p.line(-27+d,25,-27+d+54*k,25-50*k,C[i?3:5],a);p.line(-25+d,25,-25+d+54*k,25-50*k,C[4],a*.6);}sparks(p,u,a,C,R,7,22);},.42);
 authored('summon',brass,(p,u,a,C,R)=>{const r=17+19*ease.outQuart(u);ellipse(p,r,r*.19,17,C[4],a);ellipse(p,r*.8,r*.14,20,C[2],a*.65);for(let i=0;i<8;i++){const x=R.range(-28,28),y=18-u*R.range(18,37);p.line(x,y,x,y+3,C[i%2?4:2],a*.8);}p.glow(0,18,27,C[3],a*.08);},.7);
 authored('retire',ash,(p,u,a,C,R)=>{for(let i=0;i<18;i++){const x=R.range(-22,22)+Math.sin(i+u*3)*u*8,y=R.range(-14,23)-u*R.range(14,36);p.rect(x,y,i%4===0?3:1,2,C[i%3+1],a*(i%2?.7:.9));}},.72);
 authored('shatter',brass,(p,u,a,C,R)=>{for(let i=0;i<13;i++){const angle=R.range(0,TAU),r=8+u*R.range(24,48),x=Math.cos(angle)*r,y=Math.sin(angle)*r+18*u*u,s=(1-u)*R.range(2,5);p.tri(x,y-s,x+s,y+s,x-s,y,C[i%3+2],a);}p.glow(0,0,20,C[3],Math.max(0,1-u*5)*.12);},.56);
 authored('vanish',violet,(p,u,a,C,R)=>{for(let i=0;i<12;i++){const angle=R.range(0,TAU)+u*.8,r=(1-u)*R.range(13,35);p.line(Math.cos(angle)*r,Math.sin(angle)*r,Math.cos(angle+.14)*r,Math.sin(angle+.14)*r,C[i%3+2],a);}p.glow(0,0,15,C[2],a*.08);},.52);
 authored('buff',brass,(p,u,a,C)=>{corners(p,u,a,C);for(let i=0;i<3;i++){const x=(i-1)*16,y=16-u*35;p.polyline([[x-3,y+3],[x,y],[x+3,y+3]],C[4],a*.8);}},.62);
 authored('debuff',red,(p,u,a,C)=>{corners(p,u,a,C,true);for(let i=0;i<3;i++){const x=(i-1)*16,y=-15+u*33;p.polyline([[x-3,y-3],[x,y],[x+3,y-3]],C[3],a*.8);}},.62);
 authored('draw',brass,(p,u,a,C)=>{for(let i=0;i<5;i++){const y=(i-2)*7,x=-32+u*60;p.line(x,y,x+RANGE[i],y,C[i%2?3:4],a*.8);} },.48);
 const RANGE=[10,16,22,16,10];
 authored('gold',brass,(p,u,a,C,R)=>{for(let i=0;i<6;i++){const x=R.range(-24,24),y=R.range(2,23)-u*30,r=2.5; p.polyline([[x,y-r],[x+r,y],[x,y+r],[x-r,y],[x,y-r]],C[4],a);}},.7);
 authored('seal',brass,(p,u,a,C,R)=>{const r=22+5*ease.outQuart(u);p.polyline(Array.from({length:9},(_,i)=>[Math.cos(i/8*TAU+Math.PI/8)*r,Math.sin(i/8*TAU+Math.PI/8)*r]),C[3],a);p.polyline([[-10,1],[-3,8],[12,-8]],C[5],a);sparks(p,u,a,C,R,9,34);},.86);
 authored('spell',brass,(p,u,a,C,R)=>{for(let i=0;i<3;i++){const x=-29+u*50,y=(i-1)*8;p.line(x,y,x+12,y-5,C[i%2?3:5],a);p.dot(x+13,y-5,C[5],a);}sparks(p,u,a*.5,C,R,6,20);},.46);
 authored('transform',brass,(p,u,a,C,R)=>{corners(p,u,a,C,true);p.line(-19,-23+u*46,19,-23+u*46,C[5],a*.7);sparks(p,u,a*.5,C,R,5,25);},.68);
 authored('reward',brass,(p,u,a,C,R)=>{for(let i=0;i<10;i++){const angle=i/10*TAU,r=14+u*29,x=Math.cos(angle)*r,y=Math.sin(angle)*r,s=2*(1-u);p.polyline([[x,y-s],[x+s,y],[x,y+s],[x-s,y]],C[i%2?3:4],a);}p.polyline([[-9,0],[0,-12],[9,0],[0,12],[-9,0]],C[5],a);},.82);
 authored('warning',red,(p,u,a,C)=>{for(const s of [-1,1])p.polyline([[s*23,-10],[s*16,0],[s*23,10]],C[4],a);p.line(0,-9,0,3,C[4],a);p.dot(0,9,C[5],a);},.48);
 authored('rush',brass,(p,u,a,C)=>{for(let i=0;i<5;i++){const y=(i-2)*8,x=-37+u*59;p.line(x,y,x+18-i*2,y,C[i%2?2:4],a);}},.4);
 authored('shadow',violet,(p,u,a,C,R)=>{for(let i=0;i<5;i++){const angle=i*TAU/5+u*.5,r=10+19*u;p.arc(0,0,r,1,angle,angle+.65,C[i%2?2:4],a);}sparks(p,u,a*.6,C,R,7,25);},.72);
 authored('ember',red,(p,u,a,C,R)=>{for(let i=0;i<13;i++){const x=R.range(-25,25),y=R.range(8,24)-u*R.range(25,48);p.line(x,y,x+Math.sin(i+u*4)*2,y+4*(1-u),C[i%3+2],a);}ellipse(p,24+7*u,5,21,C[2],a*.5);},.68);
 return result;
}
