/** Offline atlas export. No procedural PIXELFX runtime is shipped to players. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),source=resolve(process.argv[2]??'/workspace/shared/pixelfx-source');
const revision='5294518ce7c72e48b6100a744596e0acf57f2826';
if(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==revision)throw Error('Wrong upstream revision');
const core=await import(pathToFileURL(join(source,'src/core/index.js')));
const {loadEffect,renderFrames,canvas}=await import(pathToFileURL(join(source,'tools/lib/fxlib.mjs')));
const {encodePNG}=await import(pathToFileURL(join(source,'tools/lib/png.mjs')));
const doc=readFileSync('docs/design/pixelfx-expansion-20261116.md','utf8');
const catalog=readFileSync(join(source,'docs/CATALOG.md'),'utf8');
const valid=new Set([...catalog.matchAll(/`([^`]+\/[^`]+)`/g)].map(m=>m[1]));
const ids=[...new Set([...doc.matchAll(/`([a-z-]+\/[a-z-]+)`/g)].map(m=>m[1]).filter(x=>valid.has(x)))].sort();
const out='artifacts/ko-game/public/vendor/pixelfx/library';mkdirSync(out,{recursive:true});
const preview='/workspace/outputs/pixelfx-expansion/library';mkdirSync(preview,{recursive:true});
const manifest={source:'https://github.com/patch-gg/pixelfx',revision,effects:{}};let total=0;let montage=canvas(1200,1000),batch=0,inBatch=0;
function bounds(data,w,h,threshold=8){let x0=w,y0=h,x1=-1,y1=-1,count=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>=threshold){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++;}return count?{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,count}:null;}
for(const [index,id] of ids.entries()){
 const fx=await loadEffect(id);const actor=core.stockActor(2);
 // Status overlays wrap a neutral card-shaped carrier; never bake the stock person.
 actor.mask={w:24,h:38,data:new Uint8Array(24*38).fill(1)};actor.pixels=new Uint32Array(24*38);actor.x=-12;actor.y=-38;actor.w=24;actor.h=38;delete actor.eyes;
 const rendered=renderFrames(fx,{fps:15,actor:false,bg:'none',options:{actor,seed:19}});
 let peak=0,energy=-1;
 for(const [i,f] of rendered.frames.entries()){let sum=0;for(let j=3;j<f.clear.length;j+=4)sum+=f.clear[j];if(sum>energy){energy=sum;peak=i;}}
 if(energy<=0)throw Error('Empty effect '+id);
 const start=fx.meta.loop?0:Math.max(0,peak-4),end=fx.meta.loop?rendered.n-1:Math.min(rendered.n-1,Math.max(peak+15,start+20));
 const selected=Array.from({length:28},(_,i)=>Math.round(start+(end-start)*i/27));
 let union=null;for(const i of selected){const b=bounds(rendered.frames[i].clear,rendered.w,rendered.h);if(!b)continue;if(!union)union={...b};else{const x=Math.min(union.x,b.x),y=Math.min(union.y,b.y);union={x,y,w:Math.max(union.x+union.w,b.x+b.w)-x,h:Math.max(union.y+union.h,b.y+b.h)-y};}}
 const pad=4,crop={x:Math.max(0,union.x-pad),y:Math.max(0,union.y-pad),w:Math.min(rendered.w-union.x+pad,union.w+pad*2),h:Math.min(rendered.h-union.y+pad,union.h+pad*2)};
 const factor=Math.min(1,160/Math.max(crop.w,crop.h)),w=Math.ceil(crop.w*factor),h=Math.ceil(crop.h*factor),cols=Math.ceil(Math.sqrt(28*h/w)),rows=Math.ceil(28/cols);
 const sheet=new Uint8ClampedArray(w*cols*h*rows*4);const frames=[];
 for(const [i,sourceIndex] of selected.entries()){
  const pixels=new Uint8ClampedArray(w*h*4),rgba=rendered.frames[sourceIndex].clear;
  const fade=i===27?0:Math.min(1,(27-i)/3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const sx=Math.min(rendered.w-1,crop.x+Math.floor(x/factor)),sy=Math.min(rendered.h-1,crop.y+Math.floor(y/factor)),s=(sy*rendered.w+sx)*4,d=(y*w+x)*4;
   pixels[d]=rgba[s];pixels[d+1]=rgba[s+1];pixels[d+2]=rgba[s+2];pixels[d+3]=Math.round(rgba[s+3]*fade);
  }
  for(let y=0;y<h;y++)sheet.set(pixels.subarray(y*w*4,(y+1)*w*4),((Math.floor(i/cols)*h+y)*w*cols+(i%cols)*w)*4);
  frames.push(pixels);
 }
 const peakFrame=frames.reduce((best,frame,i)=>{const energy=frame.reduce((sum,value,j)=>sum+(j%4===3?value:0),0);return energy>best.energy?{i,energy}:best;},{i:0,energy:-1}).i,b=bounds(frames[peakFrame],w,h,64)??bounds(frames[peakFrame],w,h,8)??{x:0,y:0,w,h};
 const png=encodePNG(w*cols,h*rows,sheet),sha256=createHash('sha256').update(png).digest('hex'),name=id.replace('/','-')+'-'+sha256.slice(0,12)+'.png';
 writeFileSync(join(out,name),png);total+=png.length;
 manifest.effects[id]={file:'library/'+name,sha256,frames:28,columns:cols,frameSize:[w,h],pivot:[b.x+b.w/2,b.y+b.h/2],visibleWidth:b.w,visibleHeight:b.h,fps:30,duration:Math.min(1.6,Math.max(.48,(end-start)/15)),nativeDuration:fx.meta.duration,loop:fx.meta.loop,peakFrame,sourceId:id};
 const col=inBatch%6,row=Math.floor(inBatch/6);montage.text(id,col*200+8,row*200+7,1);montage.paste(frames[peakFrame],w,h,col*200+Math.floor((200-w)/2),row*200+28+Math.floor((160-h)/2));inBatch++;
 if(inBatch===30||index===ids.length-1){writeFileSync(join(preview,'contact-'+(++batch)+'.png'),montage.png());montage=canvas(1200,1000);inBatch=0;}
 console.log(`${index+1}/${ids.length} ${id} ${w}x${h} ${png.length}`);
 rendered.frames.length=0;global.gc?.();
}
writeFileSync('artifacts/ko-game/src/components/pixelfx-library.json',JSON.stringify(manifest,null,2)+'\n');
writeFileSync('artifacts/ko-game/public/vendor/pixelfx/library-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({effects:ids.length,totalBytes:total}));
