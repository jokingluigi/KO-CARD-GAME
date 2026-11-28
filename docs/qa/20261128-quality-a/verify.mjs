/** Local checks only. No credentials, production DB, deployment or production actions. */
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const files=[
 'game/qa/quality-bundle-a.test.ts','game/qa/pandora-single-target-20261111.test.ts',
 'game/actions/targeting-cancellation.test.ts','game/engine/finisher-delivery.test.ts',
 'game/engine/finisher-choices-and-returns.test.ts','game/engine/finisher-foundation.test.ts',
 'game/engine/program.test.ts','game/engine/champion-system.test.ts',
 'game/engine/hearthstone-rules.test.ts','game/engine/death-order.test.ts',
 'game/engine/pinfall-sources.test.ts','game/effects/area-damage-order.test.ts',
 'lib/card-play-preview.test.ts','lib/match-summary.test.ts','components/action-history.test.ts','components/upgrade-presentation.test.ts',
].map(p=>'artifacts/ko-game/src/'+p);
const checks=[
 ['regression',process.execPath,['--import','./docs/qa/checkpoints/20261006/qa-loader.mjs','--test','--test-isolation=none',...files]],
 ['libs-types',process.execPath,['node_modules/typescript/bin/tsc','--build']],
 ['frontend-types',process.execPath,['node_modules/typescript/bin/tsc','-p','artifacts/ko-game/tsconfig.json','--noEmit']],
 ['api-types',process.execPath,['node_modules/typescript/bin/tsc','-p','artifacts/api-server/tsconfig.json','--noEmit']],
 ['frontend-build',process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.config.ts'],'artifacts/ko-game'],
 ['api-build',process.execPath,['artifacts/api-server/build.mjs']],
 ['diff-whitespace','git',['diff','--check']],
];
const results=[];
for(const [name,command,args,dir] of checks){
 const r=spawnSync(command,args,{cwd:dir?root+dir:root,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 writeFileSync(new URL(name+'.log',import.meta.url),(r.stdout??'')+(r.stderr??'')+(r.error?'\n'+r.error.message:''));
 results.push({name,command:[command,...args].join(' '),cwd:dir??'.',exitCode:r.status,passed:r.status===0});
 console.log(name,r.status===0?'PASS':'FAIL');
}
writeFileSync(new URL('verification.json',import.meta.url),JSON.stringify({testedAtUTC:new Date().toISOString(),baseline:'d5f5d8812988169998fca07d2f600c50cf7e9b96',results},null,2)+'\n');
if(results.some(r=>!r.passed))process.exitCode=1;
