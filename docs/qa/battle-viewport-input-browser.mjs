import assert from 'node:assert/strict';
import {chromium} from './black-gold-playwright.mjs';
const browser=await chromium.launch({headless:true});const results=[];
try {
 for(const [width,height] of [[390,844],[740,360],[1440,900]]) {
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:true});
  const page=await ctx.newPage();page.on('pageerror',e=>console.log('PAGE_ERROR',width,e.message));await page.route('**/api/**',r=>r.fulfill({json:{cards:[],frames:[]}}));
  await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await page.locator('.ko-game-shell').waitFor();
  await page.locator('[data-preview-tools]').evaluate(n=>n.style.display='none');
  async function load(mode){await page.evaluate(async mode=>{
   const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');const {generateCardInstance}=await import('/src/game/index.ts');
   const s=boardFixture();s.gameId='input-'+crypto.randomUUID();s.events=[];
   s.players[0].hand=[generateCardInstance(definitions.find(c=>c.name===(mode==='summon'?'리버덩크':'봉인')),{instanceId:'fit-'+mode})];
   window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));
  },mode);await page.waitForTimeout(200);}
  const cdp=await ctx.newCDPSession(page);
  async function drag(from,to,cancel=false){const a=await from.boundingBox(),b=await to.boundingBox();const x=a.x+a.width*.25,y=a.y+a.height*.75,tx=b.x+b.width*.5,ty=b.y+b.height*.7;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   // Lift vertically first: the existing hand gesture intentionally reserves horizontal swipes for scrolling.
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-24}]});
   for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(tx-x)*i/8,y:y-24+(ty-y+24)*i/8}]});
   await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  }
  const state=()=>page.getByTestId('state-json').textContent().then(JSON.parse);
  await load('summon');
  await drag(page.locator('.ko-hand-card'),page.locator('.ko-player-board-row .ko-board-slot').nth(2));
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=state-json]')?.textContent ?? '{}' ).players?.[0]?.board[2]?.instanceId==='fit-summon');
  await page.waitForFunction(()=>document.querySelector('[data-testid=preview-busy]').textContent==='false');
  await load('spell');const before=await state();
  await drag(page.locator('.ko-hand-card'),page.locator('.ko-player-board-row .ko-board-slot').nth(2),true);
  await page.locator('.ko-card-drag-ghost').waitFor({state:'detached'});assert.deepEqual(await state(),before);
  await drag(page.locator('.ko-hand-card'),page.locator('.ko-player-board-row .ko-board-slot').nth(2));
  await page.waitForFunction(()=>!!document.querySelector('.ko-opponent-board-row [data-card-highlight=target]'));
  const victim=page.locator('.ko-opponent-board-row .ko-board-slot').first(),box=await victim.boundingBox();
  await victim.click({position:{x:15,y:box.height-12}});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=state-json]')?.textContent ?? '{}' ).players[0].hand.length===0);
  assert.equal((await state()).players[1].board[0],null);
  await page.waitForFunction(()=>document.querySelector('[data-testid=preview-busy]').textContent==='false');
  const accepted=await state();await page.setViewportSize({width:height,height:width});
  const resize=await page.locator('.ko-game-shell').evaluate(n=>({scroll:n.scrollHeight,h:innerHeight,boxes:[...n.querySelectorAll('.ko-player-champion,.ko-opponent-champion,.ko-turn-end')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})}));
  assert.ok(resize.scroll<=resize.h+1);for(const b of resize.boxes)assert.ok(b.x>=0&&b.y>=0&&b.right<=height+1&&b.bottom<=width+1);
  assert.deepEqual(await state(),accepted,'rotation must preserve accepted game state');
  results.push({width,height,touchSummon:true,canceledSpellPreservesState:true,spellDragAndTarget:true,rotationPreservesState:true});
  await ctx.close();
 }
 console.log(JSON.stringify(results));
}finally{await browser.close();}
