import {chromium} from './black-gold-playwright.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=process.env.KO_REFERENCE_OUTPUT??'qa-results/reference-board';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 for(const [w,h] of (process.env.KO_REFERENCE_HD==='1'?[[1440,1080]]:[[390,844],[360,740],[375,812],[412,915],[1440,900]])){
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
  await page.addInitScript(()=>{const animate=Element.prototype.animate;Element.prototype.animate=function(...args){try{return animate.apply(this,args);}catch(e){console.error('ANIMATION',e.message,JSON.stringify(args[0]));throw e;}};});
  page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');
  await page.locator('.ko-game-shell').waitFor();
  await page.evaluate(()=>document.querySelector('[data-preview-tools]')?.setAttribute('style','display:none'));
  await page.evaluate(async()=>{
   const ctx=new AudioContext();await ctx.resume();const dest=ctx.createMediaStreamDestination();
   const sources=new WeakMap();const play=HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play=function(){if(!sources.has(this)){const source=ctx.createMediaElementSource(this);source.connect(dest);source.connect(ctx.destination);sources.set(this,source);}return play.call(this);};
   const chunks=[];const recorder=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus'});
   recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
   const marker=document.createElement('div');marker.style.cssText='position:fixed;left:0;top:0;width:12px;height:12px;background:rgb(0,255,0);z-index:2147483647;pointer-events:none';document.body.append(marker);setTimeout(()=>marker.remove(),200);
   window.audioCapture={recorder,chunks};
  });
  for(const damage of (process.env.KO_REFERENCE_LONG==='1'?[1,3,6,12,2,6,12,3,6,12,1,6,12,3,6,12]:[2,6,12])){
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
   await page.evaluate(()=>{
    const stage=document.querySelector('.ko-game-stage'),anchor=document.querySelector('.ko-game-controls');
    window.cameraMeasurement={baseWidth:stage.getBoundingClientRect().width,samples:[]};
    let running=true;window.stopCameraMeasurement=()=>{running=false;};
    const tick=()=>{const r=stage.getBoundingClientRect(),a=anchor.getBoundingClientRect();window.cameraMeasurement.samples.push({time:performance.now(),width:r.width,x:a.x,y:a.y,scale:getComputedStyle(stage).scale,translation:getComputedStyle(stage).translate,phase:document.querySelector('.attack-animation')?.dataset.attackPhase});if(running)requestAnimationFrame(tick);};requestAnimationFrame(tick);
   });
   await page.evaluate(()=>window.scrollTo(0,0));
   for(const side of ['player','opponent']){
    const rect=await page.locator('.ko-'+side+'-board-row .ko-board-slot').first().boundingBox();
    await page.mouse.click(rect.x+20,rect.y+65);
   }
   await page.locator('.attack-animation').waitFor();
   if(damage>=6){
    await page.waitForFunction(()=>document.querySelector('.attack-animation')?.dataset.attackPhase==='HITSTOP',null,{polling:'raf'});
    const camera=await page.evaluate(()=>{
     const frames=selector=>document.querySelector(selector)?.getAnimations().flatMap(a=>a.effect?.getKeyframes()??[]).map(f=>Number(f.scale??1))??[];
     return {stage:frames('.ko-game-stage'),actor:frames('.attack-animation'),vfx:frames('.ko-contact-camera'),data:{...document.querySelector('.ko-game-stage').dataset},preferences:localStorage.getItem('ko-match-screen-shake')};
    });
    console.log('camera',w,damage,JSON.stringify(camera));
    assert.ok(camera.stage.some(s=>s>1.05),'missing board punch-in');
    assert.ok(camera.actor.some(s=>s>1.05),'attack clone must share camera zoom');
    assert.ok(camera.vfx.some(s=>s>1.05),'contact art must share camera zoom');
   }
   if(process.env.KO_REFERENCE_SCREENSHOTS==='1')await page.screenshot({path:`${out}/contact-${w}-${damage}.png`});
   await page.locator('.attack-animation').waitFor({state:'detached'});
   const measurement=await page.evaluate(()=>{window.stopCameraMeasurement();return window.cameraMeasurement;});
   await (await import('node:fs/promises')).writeFile(`${out}/measured-camera-${w}-${damage}.json`,JSON.stringify(measurement,null,2));
   if(damage>=6){
    const magnified=measurement.samples.filter(s=>s.width/measurement.baseWidth>1.03);
    assert.ok(Math.max(...measurement.samples.map(s=>s.width))/measurement.baseWidth>(damage>=10?1.17:1.11),'rendered zoom is too small');
    assert.ok(magnified.at(-1).time-magnified[0].time>=100,'zoom is visible for less than100ms');
    assert.ok(Math.max(...measurement.samples.map(s=>Math.hypot(...s.translation.split(' ').map(v=>parseFloat(v)||0))))>=8,'rendered camera kick is too small');
   }
   if(process.env.KO_REFERENCE_SCREENSHOTS==='1')await page.screenshot({path:`${out}/recovery-${w}-${damage}.png`});
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
