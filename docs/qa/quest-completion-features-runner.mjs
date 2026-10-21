/** Fully local compiled UI, actual Express and temporary PGlite database. */
import {spawn} from 'node:child_process';import {createWriteStream} from 'node:fs';import {mkdir,readFile} from 'node:fs/promises';
const out='qa-results/quest-completion';await mkdir(out,{recursive:true});const children=[];
function start(command,args,env,name){const child=spawn(command,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});children.push(child);const log=createWriteStream(out+'/'+name+'.log');child.stdout.pipe(log);child.stderr.pipe(log);return child;}
function ready(child,needle){return new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('Readiness timeout: '+needle)),60000);let output='';const data=b=>{output=(output+String(b)).slice(-16000);if(output.includes(needle)){clearTimeout(timer);yes();}};child.stdout.on('data',data);child.stderr.on('data',data);child.once('error',no);child.once('exit',code=>{clearTimeout(timer);no(Error('Early exit '+code));});});}
try{
 const fixture=start(process.execPath,['--import','./docs/qa/checkpoints/20261006/qa-loader.mjs','--test','--test-isolation=none','lib/db/qa/quest-completion-features.test.ts'],{KO_QUEST_FEATURES_BROWSER:'1'},'http');await ready(fixture,'QUEST_FEATURES_BROWSER_READY');
 const frontend=start('pnpm',['--filter','@workspace/ko-game','exec','vite','preview','--port','5284','--host','127.0.0.1','--strictPort'],{PORT:'5284',BASE_PATH:'/'},'preview');await ready(frontend,'Local:');
 const browser=start(process.execPath,['docs/qa/quest-completion-features-browser.mjs'],{KO_QUEST_FEATURES_ORIGIN:'http://127.0.0.1:5284'},'browser');const code=await new Promise((yes,no)=>{browser.once('error',no);browser.once('exit',yes);});if(code!==0)throw Error('Quest/pack/deck browser failed: '+code);
 console.log('PASS compiled quest deletion, completion bonus, pack reveals and owned deck filter');
}catch(error){
 for(const name of ['browser','http','preview']){
  const detail=(await readFile(out+'/'+name+'.log','utf8').catch(()=>'' )).slice(-6500);
  console.error(name+'\n'+detail);
  const escaped=detail.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
  console.log(`::error title=Inventory browser ${name}::${escaped}`);
 }
 throw error;
}finally{for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');}
