import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {makeKoEffects} from './ko-pixelfx-effects.mjs';

const revision='5294518ce7c72e48b6100a744596e0acf57f2826';
const source=resolve(process.argv[2]??'/tmp/ko-pixelfx-source');
if(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==revision)throw Error('Use the pinned PIXELFX revision '+revision);
const core=await import(pathToFileURL(join(source,'src/core/index.js')));
const {renderFrames,contactSheet,spriteSheet}=await import(pathToFileURL(join(source,'tools/lib/fxlib.mjs')));
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const output=join(root,'artifacts/ko-game/public/vendor/pixelfx');
const previews=resolve(process.argv[3]??'/tmp/ko-pixelfx-previews');
mkdirSync(output,{recursive:true});mkdirSync(previews,{recursive:true});
const manifest={source:'https://github.com/patch-gg/pixelfx',revision,effects:{}};
for(const [id,mod] of Object.entries(makeKoEffects(core))) {
  const fx={id:'ko/'+id,meta:mod.meta,mod},r=renderFrames(fx,{actor:false,bg:'dark'});
  const end=r.frames.at(-1).clear;if(end.some((v,i)=>i%4===3&&v!==0))throw Error(id+' does not end transparent');
  writeFileSync(join(previews,id+'-contact.png'),contactSheet(fx,r,{max:12,zoom:2}));
  if(id.startsWith('draft-'))continue;
  const sheet=spriteSheet(fx,r,id);
  const sha256=createHash('sha256').update(sheet.png).digest('hex');
  const file=id+'-'+sha256.slice(0,12)+'.png';
  sheet.json.meta.image=file;
  writeFileSync(join(output,file),sheet.png);
  writeFileSync(join(output,id+'.json'),JSON.stringify(sheet.json,null,2)+'\n');
  manifest.effects[id]={file,sha256,...sheet.json.meta.pixelfx,duration:mod.meta.duration};
  console.log(id,r.n+' frames',sheet.png.length+' bytes');
}
copyFileSync(join(source,'LICENSE'),join(output,'LICENSE.txt'));
copyFileSync(join(source,'NOTICE.md'),join(output,'UPSTREAM-NOTICE.md'));
writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(join(root,'artifacts/ko-game/src/components/pixelfx-atlas.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(join(output,'README.md'),'# KO CARD GAME / PIXELFX\n\nOriginal KO effects rendered using PIXELFX at '+revision+'. No gallery fonts or stock characters are shipped.\nRegenerate: `node scripts/vfx/render-pixelfx.mjs /path/to/pinned-pixelfx`\nSee LICENSE.txt and UPSTREAM-NOTICE.md for attribution.\n');
