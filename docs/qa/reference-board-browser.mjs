import {chromium} from './black-gold-playwright.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=process.env.KO_REFERENCE_OUTPUT??'qa-results/reference-board';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 for(const [w,h] of [[390,844],[360,740],[375,812],[412,915],[1440,900]]){
  const context=await browser.newContext({viewport:{width:w,height:h},recordVideo:{dir:out,size:{width:w,height:h}}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.startsWith('/api/storage/')){
    const f='/tmp/ko-board-image-cache/'+createHash('sha256').update(path).digest('hex');
    try{return await route.fulfill({body:await readFile(f),contentType:(await readFile(f+'.type','utf8'))});}catch{return route.fulfill({status:404,body:''});}
   }
   return route.fulfill({json:{frames:[],items:[],cards:[]}});
  });
  await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');
  await page.locator('.ko-game-shell').waitFor();
  await page.evaluate(()=>document.querySelector('[data-preview-tools]')?.setAttribute('style','display:none'));
  await page.evaluate(async()=>{
   const ctx=new AudioContext();await ctx.resume();const dest=ctx.createMediaStreamDestination();
   const sources=new WeakMap();const play=HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play=function(){if(!sources.has(this)){const source=ctx.createMediaElementSource(this);source.connect(dest);source.connect(ctx.destination);sources.set(this,source);}return play.call(this);};
   const chunks=[];const recorder=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus'});
   recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();window.audioCapture={recorder,chunks};
  });
  for(const damage of [2,6,12]){
   await page.evaluate(async damage=>{
    const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');
    const {generateCardInstance}=await import('/src/game/index.ts');const s=boardFixture();
    const plain=definitions.find(c=>c.name==='리버덩크'),other=definitions.find(c=>c.name==='보드바');
    for(const [i,p] of s.players.entries()){
     p.board=[{...generateCardInstance(i?other:plain,{instanceId:'reference-'+i}),boardSlot:0,enteredThisTurn:false,attacksUsedThisTurn:0,currentAttack:i?1:damage,currentHealth:25,maxHealth:25},null,null,null];
     p.hand=[generateCardInstance(plain,{instanceId:"reference-hand-0"}),generateCardInstance(other,{instanceId:"reference-hand-1"})];
    }
    window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));
   },damage);
   await page.waitForTimeout(700);
   const images=await page.locator('.ko-player-board-row .ko-board-slot img').evaluateAll(es=>es.filter(e=>e.naturalWidth>0).length);assert.ok(images>0,'real card artwork unavailable');
   const before=JSON.parse(await page.getByTestId('state-json').textContent());
   await page.evaluate(()=>window.scrollTo(0,0));
   for(const side of ['player','opponent']){
    const rect=await page.locator('.ko-'+side+'-board-row .ko-board-slot').first().boundingBox();
    await page.mouse.click(rect.x+20,rect.y+65);
   }
   await page.locator('.attack-animation').waitFor();
   if(damage>=6)await page.waitForFunction(()=>document.querySelector('.attack-animation')?.dataset.attackPhase==='HITSTOP',null,{polling:'raf'});
   await page.screenshot({path:`${out}/contact-${w}-${damage}.png`});
   await page.locator('.attack-animation').waitFor({state:'detached'});
   await page.screenshot({path:`${out}/recovery-${w}-${damage}.png`});
   const after=JSON.parse(await page.getByTestId('state-json').textContent());
   assert.equal(after.players[1].board[0].currentHealth,before.players[1].board[0].currentHealth-damage);
   assert.equal(await page.locator('[data-cinematic-kind="ATTACK"]').count(),0);
   await page.waitForTimeout(400);
  }
  const audio=await page.evaluate(()=>new Promise(resolve=>{const c=window.audioCapture;c.recorder.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(c.chunks).arrayBuffer())));c.recorder.stop();}));
  await (await import('node:fs/promises')).writeFile(`${out}/audio-${w}.webm`,Buffer.from(audio));
  assert.deepEqual(errors,[]);const video=page.video();await context.close();await video.saveAs(`${out}/battle-${w}x${h}.webm`);console.log(`${w}x${h}: shared board/engine attacks 2,6,12 verified`);
 }
}finally{await browser.close();}
