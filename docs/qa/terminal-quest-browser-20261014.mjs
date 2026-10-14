import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const cards=JSON.parse(fs.readFileSync('docs/qa/snapshots/20261014-admin/cards.json'));
const champions=JSON.parse(fs.readFileSync('docs/qa/snapshots/20261014-admin/champions.json'));
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),results=[];
try{
 for(const width of [390,1440])for(const mode of ['alive','zero','finished','cancel']){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>route.fulfill({json:{cards:[],champions:[],frames:[]}}));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await page.goto((process.env.KO_QA_ORIGIN??'http://127.0.0.1:5173')+'/qa/champion-features.html');await page.getByTestId('state-json').waitFor({state:'attached'});
  await page.evaluate(async({cards,champions})=>{
   const {createInitialGameState}=await import('/src/game/index.ts');
   const {cardRecordToDefinition}=await import('/src/game/cards/published-cards.ts');
   const {championRecordToDefinition}=await import('/src/game/champions/published-champions.ts');
   const {audioManager}=await import('/src/audio/audio-manager.ts');
   window.__questDucks=[];audioManager.duckForPresentation=(...args)=>window.__questDucks.push(args);
   const definitions=cards.map(cardRecordToDefinition),state=createInitialGameState(undefined,definitions);
   state.status='IN_PROGRESS';state.events=[];state.turn=3;state.openingMulligan=undefined;
   for(const player of state.players){player.board=[null,null,null,null];player.hand=[];player.health=25;player.maxHealth=25;player.mulliganUsed=true;}
   state.players[0].champion={...state.players[0].champion,...championRecordToDefinition(champions.find(c=>c.name.includes('크루세이더'))),questCompleted:false};
   window.__questState=state;window.__questDefinitions=definitions;
   window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state,definitions}}));
  },{cards,champions});
  await page.waitForTimeout(400);
  await page.evaluate(mode=>{
   const state=structuredClone(window.__questState);state.players[0].health=mode==='zero'||mode==='finished'?0:5;state.status=mode==='finished'?'FINISHED':'IN_PROGRESS';
   state.players[0].champion.questCompleted=true;state.latestQuestCompletedChampionId=state.players[0].champion.id;
   state.events=[{type:'CHAMPION_QUEST_COMPLETED',playerId:state.players[0].id,championId:state.players[0].champion.id}];
   window.__questState=state;window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state,definitions:window.__questDefinitions}}));
  },mode);
  if(mode==='alive'||mode==='cancel'){
   await page.locator('.quest-presentation').waitFor({state:'attached',timeout:3000});
   await page.locator('[data-cinematic-kind="AWAKENING"]').waitFor({state:'visible',timeout:3000});
   if(mode==='cancel')await page.evaluate(()=>{const state=structuredClone(window.__questState);state.players[0].health=0;state.status='FINISHED';window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state,definitions:window.__questDefinitions}}));});
  }
  if(mode!=='alive'){
   await page.waitForTimeout(150);
   assert.equal(await page.locator('.quest-presentation').count(),0);
   assert.equal(await page.locator('[data-cinematic-kind="AWAKENING"]').count(),0);
   if(mode!=='cancel')assert.equal(await page.evaluate(()=>window.__questDucks.length),0);
  }
  assert.deepEqual(errors,[]);results.push({width,mode,passed:true});await context.close();
 }
 console.log(JSON.stringify({results}));
}finally{await browser.close();}
