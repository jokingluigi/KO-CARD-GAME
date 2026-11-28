import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '../black-gold-playwright.mjs';
const phase=process.argv[2]??'after';
const mobile=process.env.KO_QUALITY_MOBILE==='1';
const interact=locator=>mobile?locator.tap():locator.click();
const out=new URL('./'+phase+(mobile?'-mobile':'')+'/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--disable-dev-shm-usage']});
const results=[];
try {
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());return !['127.0.0.1','localhost'].includes(u.hostname)?r.abort():u.pathname.startsWith('/api/')?r.fulfill({json:{cards:[],frames:[],champions:[]}}):r.continue();});
 await page.goto((process.env.KO_QUALITY_URL ?? 'http://127.0.0.1:5187')+'/qa/black-gold-board.html?result');
 await page.locator('.ko-game-shell').waitFor({timeout:60000});
 await page.locator('[data-preview-tools]').evaluate(n=>n.style.display='none');
 async function load(mode){
  await page.evaluate(async mode=>{
   const {fixture,unit,definitions}=await import('/qa/quality-a-fixture.ts');
   const {executeAction}=await import('/src/game/actions/engine-actions.ts');
   let s=fixture();s.gameId='quality-'+mode+'-'+Date.now();
   if(mode==='fireworks'){
    s.players[0].hand=[unit('폭죽광','fire')];s.players[1].board[0]={...unit('불록스','bull'),boardSlot:0};
    s=executeAction(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'fire',boardSlot:0}).state;
   }else if(mode==='sidekick')s.players[0].hand=[unit('신입 사이드킥','sidekick')];
   else if(mode==='own-ability'||mode==='ai-choice'||mode==='own-response'||mode==='ability-ready'){
    s.players[0].board[0]={...unit('좀비 벨로나','ally'),boardSlot:0};
    s.players[1].board[0]={...unit('불록스','enemy'),boardSlot:0};
    if(mode==='ai-choice')s.activePlayerId='player-2';
    if(mode!=='ability-ready')s=executeAction(s,{type:'BEGIN_TARGETED_ACTION',playerId:mode==='ai-choice'?'player-2':'player-1',action:{type:'USE_CHAMPION_ABILITY'}}).state;
    if(mode==='own-response')s.activePlayerId='player-2';
   }else if(mode==='result'){
    s.status='FINISHED';s.winnerId='player-2';s.loserId='player-1';
    s.players[0].champion.questConditionCounts={root:1};s.players[1].champion.questConditionCounts={root:4};
   }
   window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));
  },mode);
  await page.waitForTimeout(500);
 }
 await load('own-ability');
 results.push({mode:'own-ability',text:await page.locator('.ko-effect-target-controls').innerText()});
 if(phase==='after'){
  await interact(page.getByRole('button',{name:'효과 설명',exact:true}));
  const d=page.getByRole('dialog');await d.waitFor();await page.waitForTimeout(260);
  results[0].visibleExplanation=await d.innerText();
  assert.match(results[0].visibleExplanation,/불안한 일격/);assert.match(results[0].visibleExplanation,/핀폴/);assert.match(results[0].visibleExplanation,/확정 시 1골드/);
  await page.screenshot({path:new URL('ability-detail.png',out).pathname});
  await page.keyboard.press('Escape');
 }
 await page.screenshot({path:new URL('ability.png',out).pathname});
 await load('ai-choice');
 results.push({mode:'ai-choice',humanControls:await page.getByRole('button',{name:'선택 취소',exact:true}).count(),text:await page.getByTestId('battle-command-strip').innerText()});
 await page.screenshot({path:new URL('ai-choice.png',out).pathname});
 await load('own-response');
 results.push({mode:'own-response',humanControls:await page.getByRole('button',{name:'선택 취소',exact:true}).count()});
 await load('sidekick');
 await interact(page.locator('.ko-hand-card').last());
 if(mobile)await interact(page.locator('.ko-hand-card').last());
 results.push({mode:'sidekick',text:await page.getByTestId('battle-command-strip').innerText()});
 await page.screenshot({path:new URL('sidekick.png',out).pathname});
 await load('fireworks');
 await interact(page.getByTestId('button-battle-match-history'));
 const log=page.locator('[role="dialog"]').last();await log.waitFor();await page.waitForTimeout(260);
 results.push({mode:'fireworks',lines:await log.locator('.ko-log__lines li').allTextContents()});
 await page.screenshot({path:new URL('fireworks.png',out).pathname});
 await page.keyboard.press('Escape');
 await load('result');
 const detailButton=page.getByRole('button',{name:/상세|자세/}).last();
 if(await detailButton.count()){if(phase==='before'){await detailButton.focus();await page.keyboard.press('Enter');}else await interact(detailButton);}
 results.push({mode:'result',text:await page.locator('.ko-result-score-row').allTextContents(),pointerEvents:await page.evaluate(()=>getComputedStyle(document.documentElement).pointerEvents)});
 await page.locator('.ko-result-stinger').waitFor({state:'detached',timeout:10000});
 await page.screenshot({path:new URL('result.png',out).pathname});
 if(phase==='after'){
  assert.match(results[0].text,/불안한 일격/);assert.match(results[0].text,/1.*골드/);assert.match(results[0].text,/핀폴/);
  assert.equal(results[1].humanControls,0);assert.equal(results[2].humanControls,1);
  assert.match(results[3].text,/2.*골드/);
  assert.equal(results[4].lines.filter(t=>/1 피해/.test(t)).length,2);
  assert.ok(results[5].text.some(t=>t.includes('1/8')&&t.includes('4/8')));
 }
 if(phase==='after'){
  await load('ability-ready');
  const before=await page.getByTestId('state-json').textContent();
  await interact(page.getByRole('button',{name:'불안한 일격 능력 설명'}));
  const dialog=page.getByRole('dialog');await dialog.waitFor();await page.waitForTimeout(260);
  assert.match(await dialog.innerText(),/불안한 일격/);assert.match(await dialog.innerText(),/비용 1 골드/);assert.match(await dialog.innerText(),/핀폴/);
  await page.screenshot({path:new URL('ability-before-use.png',out).pathname});
  await interact(dialog.getByRole('button',{name:'닫기'}));
  assert.equal(await page.getByTestId('state-json').textContent(),before);
  results.push({mode:'ability-info',readable:true,resourcesUnchanged:true});
 }
 assert.deepEqual(errors,[]);
 await writeFile(new URL('results.json',out),JSON.stringify({phase,mobile,results,errors},null,2)+'\n');
 console.log(JSON.stringify({phase,mobile,results,errors},null,2));
}finally{await browser.close();}
