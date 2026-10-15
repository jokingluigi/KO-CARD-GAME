import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({headless:true,executablePath:process.env.KO_QA_CHROMIUM_EXECUTABLE});
const results=[];
try {
 for (const [width,height,touch] of [[360,740,true],[390,844,true],[412,915,true],[1440,900,false]]) {
  const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{assert.equal(route.request().method(),'GET');return route.fulfill({json:{cards:[],champions:[],frames:[]}})});
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.goto((process.env.KO_QA_ORIGIN??'http://127.0.0.1:5175')+'/qa/champion-features.html');
  await page.getByTestId('state-json').waitFor({state:'attached'});await page.getByTestId('board-check').evaluate(e=>e.parentElement.style.display='none');
  const cdp=touch?await context.newCDPSession(page):null;
  const load=async(mode='normal')=>{
   await page.evaluate(async mode=>{
    const {createInitialGameState,generateCardInstance}=await import('/src/game/index.ts');
    const d={id:'drag-player',name:'드래그 공격 선수',cost:1,attack:3,health:10,cardType:'WRESTLER',rulesText:'',keywords:[],abilities:[],isToken:false,isChampionToken:false};
    const s=createInitialGameState(undefined,[d]);s.status='IN_PROGRESS';s.turn=3;s.activePlayerId='player-1';s.events=[];s.cardPool=[d];
    for(const [i,p]of s.players.entries()){p.currentGold=6;p.health=20;p.hand=[];p.board=[null,null,null,null];p.deck=[generateCardInstance(d,{instanceId:'deck-'+i})];p.champion.quest=undefined;p.champion.health=20;p.board[0]={...generateCardInstance(d,{instanceId:i?'enemy':'attacker'}),boardSlot:0,enteredThisTurn:false,entryDefenseActive:false};}
    if(mode==='taunt'){s.players[1].board[0].keywords=['TAUNT'];s.players[1].board[1]={...generateCardInstance(d,{instanceId:'other-enemy'}),boardSlot:1,enteredThisTurn:false};}
    if(mode==='defense'){s.players[1].board[0].keywords=['DEFENSE'];s.players[1].board[0].entryDefenseActive=true;}
    if(mode==='token')s.players[1].board[0].isChampionToken=true;
    if(mode==='cooldown')s.players[0].board[0].enteredThisTurn=true;
    if(mode==='opponent')s.activePlayerId='player-2';
    window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions:[d]}}));
   },mode);await page.waitForTimeout(150);
  };
  const state=async()=>JSON.parse(await page.getByTestId('state-json').textContent());
  const own=()=>page.locator('.ko-player-board-row .ko-board-slot').first();
  const enemy=()=>page.locator('.ko-opponent-board-row .ko-board-slot').first();
  const drag=async(target,cancel=false)=>{
   const from=await own().boundingBox();const to=await target.boundingBox();assert.ok(from&&to);
   const start={x:from.x+from.width*.5,y:from.y+from.height*.82},end={x:to.x+to.width*.5,y:to.y+to.height*.78};
   if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/8,y:start.y+(end.y-start.y)*i/8}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});}
   else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
   await page.waitForTimeout(250);
  };
  await load();await drag(enemy());assert.equal((await state()).players[1].board[0].currentHealth,7);assert.equal((await state()).players[0].board[0].attacksUsedThisTurn,1);assert.equal((await state()).events.filter(e=>e.type==='ATTACK_DECLARED').length,1);
  await load();await drag(page.locator('.ko-opponent-champion'));assert.equal((await state()).players[1].health,17);
  for(const mode of ['defense','cooldown','opponent']){await load(mode);const before=await state();await drag(enemy());assert.deepEqual(await state(),before,mode+' rejects illegal drag');}
  for(const mode of ['taunt','token']){await load(mode);const before=await state();await drag(page.locator('.ko-opponent-champion'));assert.deepEqual(await state(),before,mode+' protects champion');}
  await load();const beforeCancel=await state();await drag(enemy(),true);assert.deepEqual(await state(),beforeCancel,'cancel sends no attack');
  await load();const beforeOutside=await state();await drag(page.locator('.ko-player-zones'));assert.deepEqual(await state(),beforeOutside,'outside drop sends no attack');
  // Ordinary taps remain the same attack-selection path.
  await load();if(touch){await own().tap({position:{x:20,y:80}});await enemy().tap({position:{x:20,y:80}});}else{await own().click({position:{x:20,y:80}});await enemy().click({position:{x:20,y:80}});}assert.equal((await state()).players[1].board[0].currentHealth,7);
  assert.equal(await page.evaluate(()=>visualViewport.scale),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  results.push({width,height,touch,status:'PASS'});console.log('PASS '+width+'x'+height);await context.close();
 }
 fs.mkdirSync('qa-results/field-attack-drag',{recursive:true});fs.writeFileSync('qa-results/field-attack-drag/results.json',JSON.stringify({results,physicalDevice:'NOT_RUN',operationalWrites:false},null,2));
}finally{await browser.close();}
