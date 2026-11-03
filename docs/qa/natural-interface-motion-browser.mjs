/** Actual menus + AI match entry/actions; API fixtures never write live accounts. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
import {auditSetup,cards,champions} from './ui-audit-fixture.mjs';
const {cardRecordToDefinition,championRecordToDefinition,createInitialGameState,startGame,generateCardInstance}=await import('../../lib/game-engine/src/index.ts');
const origin=process.env.KO_UI_ORIGIN??'http://127.0.0.1:5186',out=process.env.KO_MOTION_OUT??'qa-results/natural-interface-motion';
await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[];
try{for(const [width,height,reduced] of [[390,844,false],[844,390,false],[1440,900,false],[390,844,true]]){
 const ctx=await browser.newContext({viewport:{width,height},isMobile:width===390,hasTouch:width===390,reducedMotion:reduced?'reduce':'no-preference',ignoreHTTPSErrors:true,recordVideo:{dir:out+'/video',size:{width,height}}});
 const p=await ctx.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await auditSetup(ctx);
 const art=new Map();
 for(const record of [...cards,...champions])for(const file of [`/tmp/tutorial-art/${record.id}.png`,`artifacts/ko-game/qa/retro-font/assets/champion-${record.id}.png`,`artifacts/ko-game/qa/retro-font/assets/card-${record.id}.png`])try{if(record.imageUrl&&!art.has(new URL(record.imageUrl,origin).pathname))art.set(new URL(record.imageUrl,origin).pathname,await readFile(file));}catch{}
 await ctx.route('**/api/storage/**',r=>{const image=art.get(new URL(r.request().url()).pathname);return image?r.fulfill({contentType:'image/png',body:image}):r.fallback();});
 await ctx.route('**/api/daily-quests/ai-match-progress',r=>r.fulfill({json:{completed:true,reward:{amount:20,sourceType:'QA_AI_MATCH'}}}));
 await ctx.addInitScript(()=>{
  window.__motionEvents=[];window.__cssMotions=[];
  const original=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){
   window.__motionEvents.push({key:this.getAttribute('data-motion-key'),value:this.getAttribute('data-value'),tag:this.className,frames:JSON.parse(JSON.stringify(frames)),duration:options?.duration});
   return original.call(this,frames,options);
  };
  document.addEventListener('animationstart',e=>window.__cssMotions.push({name:e.animationName,tag:e.target.className}));
 });
 await p.goto(origin+'/online');await p.locator('.ko-battle-mode-grid').waitFor();
 await p.waitForFunction(()=>Boolean(document.querySelector('[data-ui-entrance="/online"]')));
 const stage=await p.evaluate(()=>window.__motionEvents.filter(e=>e.frames.some(f=>f.translate==='0px 8px')));
 if(reduced)assert.equal(stage.length,0);else assert.ok(stage.length>0);
 const button=p.getByTestId('button-mode-ai');
 await button.scrollIntoViewIfNeeded();
 const before=await button.boundingBox();
 await p.mouse.move(before.x+before.width*.5,before.y+before.height*.5);await p.mouse.down();
 await p.waitForFunction(()=>Boolean(document.querySelector('[data-ui-pressed=true]')));
 const pressed=await button.boundingBox();assert.ok(Math.abs(pressed.width-before.width)<1&&Math.abs(pressed.height-before.height)<1);
 // Release outside to exercise cancellation without starting a match.
 await p.mouse.move(1,1);await p.mouse.up();
 assert.equal(await p.locator('[data-ui-pressed]').count(),0);
 await p.goto(origin+'/collection');await p.locator('.ko-collection-item').first().waitFor();
 const name=(await p.locator('.ko-collection-item').nth(1).getAttribute('aria-label')).replace(' 카드 상세 보기','');
 await p.getByRole('textbox',{name:'카드 이름 검색'}).fill(name);
 await p.waitForTimeout(80);
 let reflow=reduced?'reduced':'offscreenSkipped';
 if(!reduced){const diagnostic=await p.evaluate(()=>({motions:window.__motionEvents.filter(e=>e.key),visible:[...document.querySelectorAll('[data-motion-key]')].some(n=>{const r=n.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;})}));if(diagnostic.visible){assert.ok(diagnostic.motions.some(e=>e.duration===240&&e.frames.some(f=>f.translate&&f.translate!=='0px 0px')),JSON.stringify(diagnostic));reflow='animated';}else assert.equal(diagnostic.motions.length,0);}
 await p.locator('.ko-collection-item').first().click();
 await p.getByRole('dialog').waitFor();
 if(reduced)assert.equal(await p.getByRole('dialog').evaluate(n=>getComputedStyle(n).animationName),'none');
 else await p.waitForFunction(()=>window.__cssMotions.some(e=>e.name==='ko-dialog-settle-in'));
 await p.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
 await p.getByRole('dialog').waitFor({state:'hidden'});
 if(!reduced)assert.ok(await p.evaluate(()=>window.__cssMotions.some(e=>e.name==='ko-dialog-settle-out')));
 await p.screenshot({path:`${out}/collection-${width}x${height}-${reduced}.png`});
 const definitions=cards.map(cardRecordToDefinition),heroes=champions.map(championRecordToDefinition),unit=definitions.find(c=>c.cardType==='WRESTLER'&&c.rarity==='NORMAL'&&c.cost===1&&!c.isToken&&!c.isChampionToken);
 assert.ok(unit);
 await ctx.route('**/api/daily-quests/ai-match-start',r=>{
  const s=startGame(createInitialGameState([heroes[0].id,heroes[0].id],definitions,heroes,undefined,{gameId:r.request().postDataJSON().matchId,randomSeed:27}),()=>.5);
  s.activePlayerId=s.players[0].id;s.openingMulligan=false;s.turn=9;
  s.players.forEach(x=>{x.mulliganUsed=true;x.personalTurn=5;x.currentGold=5;x.champion.quest=null;x.board=[null,null,null,null];});
  s.players[0].hand=Array.from({length:3},(_,i)=>generateCardInstance(unit,{instanceId:'motion-card-'+i}));
  return r.fulfill({json:{state:s,difficulty:'NORMAL'}});
 });
 await p.goto(origin+'/ai-match');await p.locator('.ko-game-shell').waitFor();
 const first=p.locator('.ko-hand-card').first();await first.waitFor();
 await p.waitForFunction(()=>!document.querySelector('.ko-match-intro')&&!document.querySelector('.online-intro'));
 await p.waitForTimeout(8500);
 const handCount=await p.locator('.ko-hand-card').count();
 const rect=await first.boundingBox();
 await p.mouse.move(rect.x+rect.width*.35,rect.y+rect.height*.55);await p.mouse.down();
 await p.mouse.move(8,8,{steps:12});await p.locator('.ko-card-drag-ghost').waitFor();
 await p.mouse.up();
 await p.locator('.ko-card-drag-ghost').waitFor({state:'hidden'});
 assert.equal(await p.locator('.ko-hand-card').count(),handCount);
 assert.equal(await p.locator('[data-drag-returning]').count(),0);
 await first.click({position:{x:rect.width*.35,y:rect.height*.55}});
 await p.locator('.ko-player-board-row .ko-board-slot').first().click();
 await p.waitForFunction(n=>document.querySelectorAll('.ko-hand-card').length===n-1,handCount);
 await p.locator('.ko-player-board-row .ko-card-depth').first().waitFor();
 if(!reduced)assert.ok(await p.evaluate(()=>window.__motionEvents.some(e=>e.value==='4'&&e.frames.some(f=>f.textShadow))));
 await p.getByRole('button',{name:'설정 열기',exact:true}).click();
 await p.getByRole('button',{name:'항복',exact:true}).click();await p.getByRole('button',{name:'항복하기',exact:true}).click();
 await p.getByTestId('match-result-overlay').waitFor();
 await p.getByTestId('match-reward').filter({hasText:'지급 완료'}).waitFor();
 if(!reduced)await p.waitForFunction(()=>window.__cssMotions.some(e=>e.name==='ko-verdict-type')&&window.__cssMotions.some(e=>e.name==='ko-reward-number-settle'));
 await p.screenshot({path:`${out}/actual-ai-result-${width}x${height}-${reduced}.png`});
 assert.deepEqual(errors,[]);
 const video=p.video();await ctx.close();await copyFile(await video.path(),`${out}/motion-${width}x${height}-${reduced}.webm`);
 results.push({width,height,reduced,actualMenuPanelEntrance:true,pressKeepsHitArea:true,dialogEnterAndExit:true,retainedListReflow:reflow,actualAIEntry:true,dragCancelReturnsWithoutDuplicate:true,actualSummonAndGoldFeedback:true,actualSurrenderResult:true,errors});
}
await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
