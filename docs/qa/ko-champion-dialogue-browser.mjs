import {chromium} from './black-gold-playwright.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=process.env.KO_INTRO_KO_OUTPUT??'qa-results/ko-champion-dialogue';await mkdir(out,{recursive:true});
const records=JSON.parse(await readFile('docs/qa/snapshots/20261024-admin/champions.json','utf8'));
const artRecord=records.find(c=>c.questCompletedPortraitEnabled&&c.name.includes('벨모르트'));
const cached=async path=>readFile('/tmp/ko-board-image-cache/'+createHash('sha256').update(path).digest('hex'));
const art=await cached(artRecord.imageUrl);
const reduced=process.env.KO_INTRO_KO_REDUCED==='1';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});const results=[];
try{
 for(const [width,height] of JSON.parse(process.env.KO_INTRO_KO_SIZES??'[[390,844],[360,740],[375,812],[412,915],[1440,900]]')){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let attempts=0;
  await page.route('**/broken.png*',r=>r.fulfill({status:503,body:''}));
  await page.route('**/retry.png*',r=>++attempts===1?r.fulfill({status:503,body:''}):r.fulfill({contentType:'image/png',body:art}));
  await page.route('**/original.svg*',r=>r.fulfill({contentType:'image/png',body:art}));
  await page.route('**/slow-skin.png*',async r=>{await new Promise(resolve=>setTimeout(resolve,1800));await r.fulfill({contentType:'image/png',body:art}).catch(()=>{});});
  await page.route('**/api/**',async r=>{
   const path=new URL(r.request().url()).pathname;
   if(path.startsWith('/api/storage/')){try{return await r.fulfill({body:await cached(path),contentType:'image/png'});}catch{return r.fulfill({status:404,body:''});}}
   return r.fulfill({json:{frames:[],items:[],cards:[]}});
  });
  await page.goto('http://127.0.0.1:5186/qa/intro-regression.html');
  await page.evaluate(()=>window.updatePortrait({portraitUrl:'/retry.png',originalPortraitUrl:null}));
  await page.waitForFunction(()=>document.querySelector('[data-testid=img-champion-portrait-self]')?.naturalWidth>0);
  assert.equal(attempts,2);assert.match(await page.getByTestId('img-champion-portrait-self').getAttribute('src'),/ko_portrait_retry=1/);
  await page.evaluate(()=>window.updatePortrait({portraitUrl:'/slow-skin.png',originalPortraitUrl:'/original.svg'}));
  await page.waitForFunction(()=>document.querySelector('[data-testid=img-champion-portrait-self]')?.getAttribute('src')==='/original.svg');
  await page.screenshot({path:`${out}/intro-original-while-skin-loads-${width}.png`});
  await page.waitForFunction(()=>document.querySelector('[data-testid=img-champion-portrait-self]')?.getAttribute('src')==='/slow-skin.png');
  await page.getByTestId('button-skip-match-intro').click();await page.getByText('mulligan boundary').waitFor();
  results.push({width,height,introRetry:true,originalBeforeSkin:true,lateSkin:true,skip:true});

  await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await page.locator('.ko-game-shell').waitFor();
  for(const selfDefeat of (width===390?[false,true]:[false])){
   await page.evaluate(async({selfDefeat,record})=>{
    const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');
    const {generateCardInstance}=await import('/src/game/index.ts');
    const {championRecordToDefinition}=await import('/src/game/champions/published-champions.ts');
    const s=boardFixture();s.events=[];
    const plain=definitions.find(c=>c.name==='리버덩크');
    for(const [i,p] of s.players.entries()){
     p.board=[{...generateCardInstance(plain,{instanceId:'hud-ko-'+i}),boardSlot:0,enteredThisTurn:false,attacksUsedThisTurn:0,currentAttack:12,currentHealth:20,maxHealth:20},null,null,null];
     p.health=(selfDefeat?i===0:i===1)?6:20;p.hand=[];
    }
    if(!selfDefeat)s.players[1].board=[null,null,null,null];
    const victim=s.players[selfDefeat?0:1];victim.champion={...victim.champion,...championRecordToDefinition(record),questCompleted:true};
    for(const [i,p] of s.players.entries())p.champion.presentationLines={BEFORE_QUEST:{VICTORY:'KO-WIN-'+i,DEFEAT:'KO-LOSE-'+i}};
    window.__koInitial=s;
    window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));
   },{selfDefeat,record:artRecord});
   const target=page.locator(selfDefeat?'.ko-player-champion':'.ko-opponent-champion');
   await target.locator('img').first().waitFor();await page.waitForFunction(selector=>[...document.querySelectorAll(selector+' img')].some(i=>i.naturalWidth>0),selfDefeat?'.ko-player-champion':'.ko-opponent-champion');
   await page.waitForTimeout(500);await page.screenshot({path:`${out}/before-ko-${width}-${selfDefeat}.png`});
   if(!selfDefeat){await page.locator('.ko-player-board-row .ko-board-slot').first().click();await target.click();}
   else await page.evaluate(async()=>{
    const {executeAction}=await import('/src/game/actions/engine-actions.ts');
    const s=structuredClone(window.__koInitial);s.activePlayerId=s.players[1].id;
    const r=executeAction(s,{type:'ATTACK',playerId:s.players[1].id,attackerInstanceId:'hud-ko-1',target:{type:'PLAYER',playerId:s.players[0].id}});
    if(!r.success)throw Error(r.message);window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:r.state}}));
   });
   const burst=page.getByTestId('champion-hud-shatter');await burst.waitFor({state:reduced?'attached':'visible',timeout:10000});
   await page.waitForFunction(reduced=>{const phase=document.querySelector('[data-testid=champion-hud-shatter]')?.dataset.phase;return phase==='burst'||(reduced&&phase==='done');},reduced);
   const dialogue=page.getByRole('status',{name:'챔피언 승패 대사'});await dialogue.waitFor();
   assert.equal(await dialogue.locator('[data-ko-speaker]').count(),2);
   const expected=[selfDefeat?'KO-LOSE-0':'KO-WIN-0',selfDefeat?'KO-WIN-1':'KO-LOSE-1'];
   for(const text of expected)await dialogue.getByText(text,{exact:true}).waitFor();
   assert.equal(await page.getByTestId('preview-busy').textContent(),'true');
   const bounds=await dialogue.locator('[data-ko-speaker]').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
   assert.ok(bounds.every(r=>r.x>=0&&r.y>=0&&r.right<=width&&r.bottom<=height));
   assert.ok(bounds[0].bottom<=bounds[1].y||bounds[1].bottom<=bounds[0].y||bounds[0].right<=bounds[1].x||bounds[1].right<=bounds[0].x,'dialogue bubbles must not overlap');
   const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
   const a=await target.evaluate(box),b=await burst.evaluate(box);
   assert.ok(Math.abs(a.x-b.x)<2&&Math.abs(a.y-b.y)<2&&Math.abs(a.width-b.width)<2&&Math.abs(a.height-b.height)<2,'burst must start at actual HUD bounds');
   assert.equal(await page.locator('.champion-defeat-cinematic').count(),0);
   await page.waitForTimeout(230);assert.equal(await target.evaluate(e=>getComputedStyle(e).visibility),'hidden');
   const fragments=await burst.locator('.ko-hud-shard').evaluateAll(es=>es.map(e=>{const m=new DOMMatrix(getComputedStyle(e).transform);return{x:m.m41,y:m.m42,image:getComputedStyle(e).backgroundImage};}));
   assert.equal(fragments.length,40);
   if(reduced) assert.ok(fragments.every(f=>Math.abs(f.x)<.01&&Math.abs(f.y)<.01));
   else assert.ok(fragments.some(f=>f.x<-10)&&fragments.some(f=>f.x>10)&&fragments.some(f=>f.y<-10)&&fragments.some(f=>f.y>10));
   assert.ok(fragments.every(f=>f.image.includes(artRecord.questCompletedPortraitUrl)),'must fragment the actual awakened image');
   await page.screenshot({path:`${out}/shatter-${width}-${selfDefeat}.png`});
   await page.waitForFunction(()=>document.querySelector('[data-testid=champion-hud-shatter]')?.dataset.phase==='done');
   await page.waitForFunction(()=>document.querySelector('[data-testid=preview-busy]')?.textContent==='false');
   assert.equal(await dialogue.count(),0);
   assert.equal(await target.evaluate(e=>getComputedStyle(e).visibility),'hidden');
   // The real result component must never repeat champion victory/defeat quotes.
   await page.evaluate(async()=>{
    const reactModule=await import('/node_modules/.vite/deps/react.js'),React=reactModule.default??reactModule;const client=await import('/node_modules/.vite/deps/react-dom_client.js'),createRoot=client.createRoot??client.default.createRoot;
    const {MatchResultOverlay}=await import('/src/components/match-result-overlay.tsx');
    const {executeAction}=await import('/src/game/actions/engine-actions.ts');
    const s=structuredClone(window.__koInitial);s.activePlayerId=s.players[0].id;s.players[1].health=1;s.players[1].board=[null,null,null,null];
    const r=executeAction(s,{type:'ATTACK',playerId:s.players[0].id,attackerInstanceId:'hud-ko-0',target:{type:'PLAYER',playerId:s.players[1].id}});
    if(!r.success)throw Error(r.message);
    const root=document.createElement('div');root.id='result-test';document.body.appendChild(root);window.__resultRoot=createRoot(root);
    window.__resultRoot.render(React.createElement(MatchResultOverlay,{state:r.state,onReturnToMainMenu:()=>{}}));
   });
   await page.locator('#result-test').getByText('VICTORY',{exact:true}).waitFor();
   assert.ok(!(await page.locator('#result-test').innerText()).includes('KO-WIN-'));
   assert.ok(!(await page.locator('#result-test').innerText()).includes('KO-LOSE-'));
   await page.evaluate(()=>{window.__resultRoot.unmount();document.querySelector('#result-test').remove()});
   results.push({width,height,selfDefeat,shards:40,atHud:true,allDirections:!reduced,reducedMotion:reduced,busyReleased:true,bothDialogueAtBurst:true,resultQuotesAbsent:true,dialogueBounds:true});
  }
  if(width===390){
   // Joining an already finished match must not replay shatter or speech.
   await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await page.locator('.ko-game-shell').waitFor();
   await page.evaluate(async()=>{
    const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');const s=boardFixture();
    s.gameId='already-finished-reconnect';s.events=[];s.status='FINISHED';s.winnerId=s.players[0].id;s.loserId=s.players[1].id;s.players[1].health=0;
    s.players.forEach(p=>{p.hand=[];p.board=[null,null,null,null];p.champion.presentationLines={BEFORE_QUEST:{VICTORY:'NO-REPLAY-WIN',DEFEAT:'NO-REPLAY-LOSE'}}});
    window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));
   });
   await page.waitForTimeout(800);
   assert.equal(await page.getByRole('status',{name:'챔피언 승패 대사'}).count(),0);
   assert.equal(await page.getByTestId('champion-hud-shatter').count(),0);
   await page.waitForFunction(()=>document.querySelector('[data-testid=preview-busy]')?.textContent==='false');
   results.push({width,height,finishedReconnectNoReplay:true});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
