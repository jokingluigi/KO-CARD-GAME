import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
import{pathToFileURL}from'node:url';
import{createHash}from'node:crypto';
import{execFileSync}from'node:child_process';
import{makeKoArtDirection}from'./ko-art-direction.mjs';
const source=process.argv[2]??'/workspace/shared/pixelfx-source',revision='5294518ce7c72e48b6100a744596e0acf57f2826';
if(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==revision)throw Error('Wrong PIXELFX pin');
const core=await import(pathToFileURL(source+'/src/core/index.js')),{renderFrames}=await import(pathToFileURL(source+'/tools/lib/fxlib.mjs')),{encodePNG}=await import(pathToFileURL(source+'/tools/lib/png.mjs'));
const dir='artifacts/ko-game/public/vendor/pixelfx/ko';mkdirSync(dir,{recursive:true});const manifest={source:'Original KO art rendered with PIXELFX',revision,effects:{}};
for(const[id,mod]of Object.entries(makeKoArtDirection(core))){
 const r=renderFrames({id,mod,meta:mod.meta},{fps:30,actor:false,bg:'none'}),cols=5,rows=Math.ceil(r.n/cols),data=new Uint8ClampedArray(r.w*cols*r.h*rows*4);let peak=0,energy=-1;
 r.frames.at(-1).clear.fill(0);
 for(const[i,f]of r.frames.entries()){
  const e=f.clear.reduce((sum,v,j)=>sum+(j%4===3?v:0),0);if(e>energy){energy=e;peak=i;}
  for(let y=0;y<r.h;y++)data.set(f.clear.subarray(y*r.w*4,(y+1)*r.w*4),((Math.floor(i/cols)*r.h+y)*r.w*cols+i%cols*r.w)*4);
 }
 let x0=r.w,y0=r.h,x1=0,y1=0;const f=r.frames[peak].clear;for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)if(f[(y*r.w+x)*4+3]>=64){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 if(energy<=0||r.frames.at(-1).clear.some((v,i)=>i%4===3&&v))throw Error('Invalid export '+id);
 const png=encodePNG(r.w*cols,r.h*rows,data),sha256=createHash('sha256').update(png).digest('hex'),file=id+'-'+sha256.slice(0,12)+'.png';writeFileSync('artifacts/ko-game/public/vendor/pixelfx/'+file,png);
 manifest.effects[id]={file,sha256,frames:r.n,columns:cols,frameSize:[r.w,r.h],pivot:[r.w/2,r.h/2],visibleWidth:Math.max(1,x1-x0+1),visibleHeight:Math.max(1,y1-y0+1),duration:mod.meta.duration,peakFrame:peak};console.log(id,r.n,png.length);
}
writeFileSync('artifacts/ko-game/src/components/pixelfx-ko-atlas.json',JSON.stringify(manifest,null,2)+'\n');writeFileSync('artifacts/ko-game/public/vendor/pixelfx/ko-manifest.json',JSON.stringify(manifest,null,2)+'\n');
