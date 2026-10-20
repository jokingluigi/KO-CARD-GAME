/** Two actual mobile browsers against the isolated authenticated Draft HTTP fixture. */
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {existsSync} from 'node:fs';
const fixture=JSON.parse(await readFile('qa-results/draft-egress/fixture.json','utf8'));
const origin=process.env.KO_DRAFT_EGRESS_FRONTEND??'http://127.0.0.1:5174';
for(const address of [origin,fixture.origin])if(!['127.0.0.1','localhost'].includes(new URL(address).hostname))throw new Error('Only isolated loopback QA allowed');
const {chromium}=await import(pathToFileURL(process.env.KO_QA_PLAYWRIGHT??'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true,executablePath:process.env.KO_QA_CHROMIUM_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const errors=[],events=[],sessions=[];
try{
 for(const role of ['egress-browser-a','egress-browser-b']){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await ctx.addInitScript(()=>localStorage.setItem('ko-match-coach-v1','done'));
  await ctx.route('**/api/**',async route=>{const u=new URL(route.request().url()),r=await route.fetch({url:fixture.origin+u.pathname+u.search,headers:{...route.request().headers(),cookie:fixture.cookies[role]}});await route.fulfill({response:r});});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',async response=>{if(new URL(response.url()).pathname.endsWith('/battle')){const data=await response.json().catch(()=>({}));events.push({role,type:data.type,version:data.version,bytes:Buffer.byteLength(JSON.stringify(data))});}});
  await page.goto(origin+'/draft/match/'+fixture.matchId);sessions.push({role,page,ctx});
 }
 for(const {page} of sessions){await page.locator('.ko-player-champion').waitFor({timeout:30000});const skip=page.getByRole('button',{name:/건너뛰기/});if(await skip.count())await skip.first().click();}
 await sessions[0].page.waitForTimeout(5500);
 for(const {role} of sessions)assert.ok(events.some(e=>e.role===role&&e.type==='DRAFT_HEARTBEAT'));
 async function api(role,path,body){const res=await fetch(fixture.origin+'/api/draft'+path,{method:body?'POST':'GET',headers:{cookie:fixture.cookies[role],'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;}
 for(const {role} of sessions){const state=await api(role,`/sessions/${fixture.matchId}/battle`);await api(role,`/sessions/${fixture.matchId}/actions`,{requestId:crypto.randomUUID(),expectedVersion:state.version,action:{type:'MULLIGAN',cardInstanceIds:[]}});}
 await sessions[0].page.waitForTimeout(1500);
 const changed=events.filter(e=>e.type==='MATCH_SNAPSHOT').length;assert.ok(changed>=4,'both clients recover full changed versions');
 const state=await api(sessions[0].role,`/sessions/${fixture.matchId}/battle`);await api(sessions[0].role,`/sessions/${fixture.matchId}/actions`,{requestId:crypto.randomUUID(),expectedVersion:state.version,action:{type:'SURRENDER'}});
 await sessions[0].page.waitForTimeout(2200);const count=events.length;await sessions[0].page.waitForTimeout(2600);assert.equal(events.length,count,'finished clients stop HTTP polling');assert.deepEqual(errors,[]);
 await writeFile('qa-results/draft-egress/browser-results.json',JSON.stringify({viewports:[[390,844]],users:2,heartbeatCounts:sessions.map(s=>({role:s.role,count:events.filter(e=>e.role===s.role&&e.type==='DRAFT_HEARTBEAT').length})),changedSnapshots:changed,finishedPollingStopped:true,pageErrors:errors,events},null,2));console.log('PASS two actual mobile clients: full snapshot, lightweight heartbeat, mulligan changes, terminal polling stop');
}finally{await browser.close();}
