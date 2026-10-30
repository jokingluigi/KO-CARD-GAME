import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const out='qa-results/battle-viewport';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
try {
 for(const [width,height] of [[360,640],[360,740],[375,812],[390,844],[412,915],[768,1024],[844,390],[740,360],[1024,768],[1280,720],[1440,900],[1920,1080]]) {
  const page=await browser.newPage({viewport:{width,height}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async r=>{
   if(r.request().url().includes('viewport-qa.png'))return r.fulfill({body:await readFile('qa-results/final-ten-sprites/fixtures/default.png'),contentType:'image/png'});
   return r.fulfill({json:{cards:[],frames:[]}});
  });
  await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');
  await page.locator('.ko-game-shell').waitFor();
  await page.locator('[data-preview-tools]').evaluate(n=>n.style.display='none');
  await page.evaluate(async()=>{
   const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');
   const s=boardFixture();s.gameId='fit-'+crypto.randomUUID();s.events=[];
   const p={scale:1,x:50,y:35,crop:true,flip:false};
   for(const player of s.players){player.champion.presentationLines={BATTLE_SPRITE:{version:1,frames:{default:{url:'/api/storage/objects/uploads/cosmetics/viewport-qa.png',self:{...p},opponent:{...p}}},reactions:{}}};}
   window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));
  });
  await page.waitForTimeout(250);
  const metrics=await page.evaluate(()=>{
   const sels=['.ko-game-stage','.ko-opponent-hand','.ko-opponent-hud','.ko-opponent-board-row','.ko-game-controls','.ko-player-board-row','.ko-player-info','.ko-player-hand','.ko-player-champion','.ko-opponent-champion','.ko-turn-end','.ko-player-ability','.ko-player-zones','.ko-opponent-zones'];
   const boxes=Object.fromEntries(sels.map(sel=>{const n=document.querySelector(sel);const r=n.getBoundingClientRect();return [sel,{x:r.x,y:r.y,w:r.width,h:r.height,scroll:n.scrollHeight,client:n.clientHeight}]}));
   return {boxes,documentHeight:document.documentElement.scrollHeight,innerHeight,innerWidth,shellHeight:document.querySelector('.ko-game-shell').scrollHeight,slot:[...document.querySelectorAll('.ko-board-slot')].map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})};
  });
  assert.ok(metrics.documentHeight <= height+1, 'document needs vertical scroll');
  assert.ok(metrics.shellHeight <= height+1, 'arena content exceeds viewport');
  for(const [name,b] of Object.entries(metrics.boxes)) {
    assert.ok(b.x >= -1 && b.y >= -1 && b.x+b.w <= width+1 && b.y+b.h <= height+1, `${width}x${height} ${name} outside viewport: ${JSON.stringify(b)}`);
  }
  for(const slot of metrics.slot) assert.ok(slot.w >= 43 && slot.h >= 44, `field target too small: ${JSON.stringify(slot)}`);
  assert.ok(metrics.boxes['.ko-turn-end'].h>=44);
  assert.ok(metrics.boxes['.ko-player-ability'].h>=44);
  await page.screenshot({path:`${out}/${width}x${height}.png`});
  if(width===390 || width===1440) {
    await page.evaluate(()=>{const s=document.querySelector('style[data-vite-dev-id$="battle-viewport.css"]');s.dataset.saved=s.textContent;s.textContent='';});
    await page.screenshot({path:`${out}/before-${width}.png`,fullPage:true});
    await page.evaluate(()=>{const s=document.querySelector('style[data-vite-dev-id$="battle-viewport.css"]');s.textContent=s.dataset.saved;});
  }
  const handCard=page.locator('.ko-hand-card').first();const handBox=await handCard.boundingBox();
  await handCard.click({position:{x:10,y:handBox.height-15}});
  await page.locator('.ko-battle-command button').waitFor();
  const selected=await page.evaluate(()=>{
    const box=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
    return {shell:document.querySelector('.ko-game-shell').scrollHeight,hand:box(document.querySelector('.ko-player-hand')),turn:box(document.querySelector('.ko-turn-end')),cancel:box(document.querySelector('.ko-battle-command button')),slots:[...document.querySelectorAll('.ko-board-slot')].map(box)};
  });
  assert.ok(selected.shell<=height+1);
  for(const b of selected.slots) assert.ok(b.w>=44 && b.h>=44 && b.y>=0 && b.y+b.h<=height, 'selected field target must stay visible and tappable '+JSON.stringify(b));
  assert.ok(selected.hand.y+selected.hand.h<=height+1);
  assert.ok(selected.turn.y+selected.turn.h <= selected.cancel.y+1 || selected.cancel.y+selected.cancel.h <= selected.turn.y+1 || selected.turn.x+selected.turn.w <= selected.cancel.x+1 || selected.cancel.x+selected.cancel.w <= selected.turn.x+1, 'cancel overlaps turn-end');
  assert.ok(selected.cancel.h>=44 && selected.cancel.y+selected.cancel.h<=height);
  assert.equal(errors.length,0);
  let awakeningTextVisible = null;
  if(width<=390 && height<=844) {
    await page.evaluate(async()=>{
      const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');
      const s=boardFixture();s.gameId='awakening-layout-'+crypto.randomUUID();
      for(const pl of s.players){pl.champion.questCompleted=true;pl.champion.awakening={sequenceId:'qa',awakeningPower:4,sequenceActive:true,stage:'TANK',activeStageInstanceId:null,championInvulnerable:false,pendingStage:true};}
      window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));
    });
    await page.getByLabel('위기 각성 상태').first().waitFor();
    const own=await page.locator('.ko-player-quest [aria-label="위기 각성 상태"]').boundingBox();
    const ability=await page.locator('.ko-player-ability').boundingBox();
    assert.ok(own.y+own.height<=ability.y+1||ability.y+ability.height<=own.y+1||own.x+own.width<=ability.x+1||ability.x+ability.width<=own.x+1,'own awakening status overlaps ability');
    if(height<=700){const enemy=await page.locator('.ko-opponent-quest [aria-label="위기 각성 상태"]').boundingBox(),command=await page.locator('.ko-battle-command').boundingBox();assert.ok(enemy.y+enemy.height<=command.y+1||command.y+command.height<=enemy.y+1||enemy.x+enemy.width<=command.x+1||command.x+command.width<=enemy.x+1,'enemy awakening status overlaps command');}
    awakeningTextVisible=true;
  }
  results.push({width,height,...metrics,selected,awakeningTextVisible,errors});
  await page.close();
 }
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));
 for(const r of results) console.log(r.width+'x'+r.height,JSON.stringify({doc:r.documentHeight,shell:r.shellHeight,regions:Object.fromEntries(Object.entries(r.boxes).map(([k,b])=>[k,[Math.round(b.y),Math.round(b.h)]])),slot:r.slot[0]}));
}finally{await browser.close();}
