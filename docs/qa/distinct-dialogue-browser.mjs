/** Shared battle component, actual engine actions/animation contact and existing public art. */
import {chromium} from './black-gold-playwright.mjs';import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const out='qa-results/distinct-dialogue';await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});const results=[];
try{
for(const [width,height,reduced] of JSON.parse(process.env.KO_DIALOGUE_SIZES??'[[360,740,false],[375,812,false],[390,844,false],[412,915,false],[1440,900,false],[390,844,true]]')){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname;try{return await r.fulfill({body:await readFile('/tmp/ko-board-image-cache/'+createHash('sha256').update(path).digest('hex')),contentType:'image/png'});}catch{return r.fulfill({json:{cards:[],champions:[],frames:[]}})}});
 await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await page.locator('.ko-game-shell').waitFor();await page.getByRole('button',{name:'기존 / 블랙·골드',exact:true}).evaluate(button=>button.parentElement.style.display='none');
 await page.evaluate(async()=>{
  const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');const {generateCardInstance}=await import('/src/game/index.ts');const s=boardFixture();s.gameId='speech-'+crypto.randomUUID();s.events=[];s.cardPool=definitions;
  const d=definitions.find(d=>d.name==='RM우디르');
  for(const p of s.players){p.board=[null,null,null,null];p.hand=[];p.currentGold=10;p.champion.quest=null;p.champion.questCompleted=false;p.champion.presentationLines={BEFORE_QUEST:{HELLO:p.id===s.players[0].id?'내 챔피언이 말한다.':'상대 챔피언이 말한다.'},QUEST_COMPLETE:'퀘스트 완료 대사'};}
  s.players[0].hand=[generateCardInstance(d,{instanceId:'speech-legend'}),generateCardInstance(definitions.find(d=>d.name==='리버덩크'),{instanceId:'speech-followup'})];window.__speech={state:s,definitions};
  window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:window.__speech}));
 });await page.waitForTimeout(150);
 // The champion speaks from its own HUD, with no card impersonation.
 await page.evaluate(async()=>{const {executeAction}=await import('/src/game/actions/engine-actions.ts');const x=window.__speech;const r=executeAction(x.state,{type:'EMOTE',playerId:x.state.players[0].id,emote:'HELLO'});if(!r.success)throw Error(r.message);x.state=r.state;window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:x}));});
 const bubble=page.getByRole('status',{name:'챔피언 대사',exact:true});await bubble.getByText('내 챔피언이 말한다.',{exact:true}).waitFor();await page.waitForTimeout(200);
 const overlaps=await bubble.evaluate(node=>{const a=node.getBoundingClientRect();return [...document.querySelectorAll('.ko-turn-end,.ko-champion-ability,.cosmetic-emote-tools >button,.ko-player-stats,.ko-opponent-stats,.ko-board-cards,.ko-player-hand')].filter(n=>{const b=n.getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}).map(n=>n.className);});assert.deepEqual(overlaps,[],'champion speech must not cover health, cards or controls');
 await page.screenshot({path:`${out}/champion-${width}-${reduced}.png`});
 if(width===390&&!reduced){
  await page.locator('.ko-player-hand [data-touch-inspect-trigger]').first().dispatchEvent('click');
  const info=page.getByRole('complementary',{name:'상세정보',exact:true});await info.waitFor();
  await info.getByRole('button',{name:/풀 일러스트 보기/}).click();
  const modal=page.getByRole('dialog');await modal.waitFor();
  const stacking=await page.locator(".ko-champion-speech").evaluate(node=>{const r=node.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {speechOnTop:!!hit?.closest('.ko-champion-speech'),speechZ:Number(getComputedStyle(node).zIndex),modalZ:Number(getComputedStyle(document.querySelector('[role=dialog]')).zIndex)};});
  assert.equal(stacking.speechOnTop,false,JSON.stringify(stacking));assert.ok(stacking.modalZ>stacking.speechZ,JSON.stringify(stacking));results.push({actualArtworkModalAboveSpeech:true});
  await page.keyboard.press('Escape');const closeInfo=info.getByRole('button',{name:'상세정보 닫기',exact:true});if(await closeInfo.isVisible())await closeInfo.click();
 }
 // Observe the actual landing commit and cut-in appearance, rather than sleeping to a guessed time.
 await page.evaluate(()=>{window.__speechTimes={};new MutationObserver(()=>{const a=document.querySelector('.card-play-animation[data-play-landed=true]');if(a&&!window.__speechTimes.landed)window.__speechTimes.landed=performance.now();if(document.querySelector('[data-wrestler-speaker]')&&!window.__speechTimes.cutin)window.__speechTimes.cutin=performance.now();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-play-landed']});});
 await page.locator('.ko-player-hand .ko-hand-card').first().click();await page.locator('.ko-player-board-row .ko-board-slot').first().click();
 const cutin=page.getByRole('status',{name:'선수 대사',exact:true});await cutin.getByText('넌 지금 자연을 적으로 돌렸다!',{exact:true}).waitFor();
 assert.equal(await cutin.locator('strong').textContent(),'RM우디르');assert.ok((await cutin.textContent()).includes('LEGENDARY'));
 if(await bubble.count())assert.ok(!(await bubble.textContent()).includes('넌 지금 자연을 적으로 돌렸다!'));
 const times=await page.evaluate(()=>window.__speechTimes);assert.ok(times.landed&&times.cutin&&times.cutin>=times.landed-20,JSON.stringify(times));
 await page.waitForFunction(()=>(()=>{const n=document.querySelector("[data-wrestler-speaker]");return n&&Number(getComputedStyle(n).opacity)>.99})());
 const dimensions=await cutin.evaluate(node=>{const r=node.getBoundingClientRect(),art=node.querySelector('.ko-legendary-spotlight__art').getBoundingClientRect(),line=node.querySelector('.ko-legendary-spotlight__line');const overlaps=[...document.querySelectorAll('.ko-game-controls,.ko-champion-ability,.ko-player-stats,.ko-player-hand')].filter(el=>{const b=el.getBoundingClientRect();return r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top;}).map(el=>el.className);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,artWidth:art.width,nameSize:parseFloat(getComputedStyle(node.querySelector('strong')).fontSize),quoteSize:parseFloat(getComputedStyle(line).fontSize),quoteFits:line.scrollHeight<=line.clientHeight+1,overlaps};});
 assert.ok(dimensions.width>=Math.min(680,width*.5)&&dimensions.height>=90&&dimensions.artWidth>=100,JSON.stringify(dimensions));assert.ok(dimensions.quoteFits,JSON.stringify(dimensions));assert.deepEqual(dimensions.overlaps,[],JSON.stringify(dimensions));
 assert.ok(dimensions.x>=0&&dimensions.y>=0&&dimensions.y<height*.35&&dimensions.right<=width+1&&dimensions.bottom<=height+1,JSON.stringify(dimensions));
 await cutin.locator("img").evaluate(image=>image.decode());await page.waitForTimeout(450);await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(40);await page.screenshot({path:`${out}/legendary-${width}-${reduced}.png`});
 if(width===390&&!reduced){
  await page.waitForFunction(()=>document.querySelector('[data-testid=preview-busy]')?.textContent==='false');
  const before=await page.getByTestId('state-json').textContent();
  await page.locator('.ko-player-hand .ko-hand-card').first().click();
  assert.equal(await cutin.count(),0);assert.equal(await bubble.count(),0);
  await page.getByTestId('battle-command-strip').getByRole('button',{name:'선택 취소',exact:true}).click();
  assert.equal(await cutin.count(),0);assert.equal(await page.getByTestId('state-json').textContent(),before);
  results.push({selectionInstructionsWin:true,cancelAccessible:true,noGameStateMutation:true});
 }
 await page.waitForFunction(()=>!document.querySelector('[data-wrestler-speaker]'));await page.waitForFunction(()=>document.querySelector('[data-testid=preview-busy]')?.textContent==='false');
 // A reconnect/same state update cannot replay a consumed line.
 await page.evaluate(()=>{const s=JSON.parse(document.querySelector('[data-testid=state-json]').textContent);window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s}}));});await page.waitForTimeout(120);assert.equal(await cutin.count(),0);
 if(width===390&&!reduced){
  // Two actual opponent plays in one server snapshot must keep both speakers.
  await page.evaluate(async()=>{
   const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');const {generateCardInstance,executeAction}=await import('/src/game/index.ts');
   let s=boardFixture();s.gameId='queued-'+crypto.randomUUID();s.events=[];s.cardPool=definitions;s.activePlayerId=s.players[1].id;
   const names=['RM우디르','마도카와'];s.players.forEach(p=>{p.board=[null,null,null,null];p.hand=[];p.champion.quest=null;p.currentGold=20;});
   s.players[1].hand=names.map((name,i)=>generateCardInstance(definitions.find(d=>d.name===name),{instanceId:'queued-'+i}));
   window.__queueState=s;window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));
  });await page.waitForTimeout(120);
  await page.evaluate(async()=>{const {executeAction}=await import('/src/game/index.ts');let s=window.__queueState;for(let i=0;i<2;i++){const r=executeAction(s,{type:'PLAY_WRESTLER',playerId:s.players[1].id,cardInstanceId:'queued-'+i,boardSlot:i});if(!r.success)throw Error(r.message);s=r.state;}window.__queueState=s;window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s}}));});
  await page.locator('[data-wrestler-speaker="queued-0"]').waitFor();assert.equal(await page.locator('[data-wrestler-speaker="queued-1"]').count(),0);
  await page.locator('[data-wrestler-speaker="queued-1"]').waitFor({timeout:7000});assert.equal(await page.locator('[data-wrestler-speaker="queued-0"]').count(),0);
  await page.waitForFunction(()=>!document.querySelector('[data-wrestler-speaker]'));
  results.push({sameBatchTwoSpeakers:true});
 }
 assert.deepEqual(errors,[]);results.push({width,height,reduced,championIdentity:true,legendaryIdentity:true,landedBeforeSpeech:true,largeSpotlight:true,noCriticalOverlap:true,noReplay:true});await page.close();
}
await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
