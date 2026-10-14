import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const cards=JSON.parse(fs.readFileSync('docs/qa/snapshots/20261014-admin/cards.json'));
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),results=[];
try{
 for(const width of [390,1440])for(const viewer of ['OWNER','OPPONENT']){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>route.fulfill({json:{cards:[],champions:[],frames:[]}}));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await page.goto((process.env.KO_QA_ORIGIN??'http://127.0.0.1:5175')+'/qa/champion-features.html');await page.getByTestId('state-json').waitFor({state:'attached'});
  const expected=await page.evaluate(async({cards,viewer})=>{
   const {cardRecordToDefinition}=await import('/src/game/cards/published-cards.ts');
   const {createInitialGameState,generateCardInstance,executeAction}=await import('/src/game/index.ts');
   const definitions=cards.map(cardRecordToDefinition),guide=definitions.find(d=>d.name==='초보 길잡이'),top=definitions.find(d=>d.name==='암시장 상인'),other=definitions.find(d=>d.name==='독버섯 채집꾼');
   const state=createInitialGameState(undefined,definitions);state.status='IN_PROGRESS';state.turn=3;state.activePlayerId='player-1';state.events=[];
   for(const player of state.players){player.board=[null,null,null,null];player.hand=[];player.currentGold=6;player.mulliganUsed=true;player.champion.quest=null;}
   state.players[0].hand=[generateCardInstance(guide,{instanceId:'guide'})];state.players[0].deck=[generateCardInstance(top,{instanceId:'revealed-top'}),generateCardInstance(other,{instanceId:'hidden-second'})];
   window.__revealOriginal=state;window.__revealDefinitions=definitions;window.__revealViewer=viewer;
   const view=structuredClone(state);if(viewer==='OPPONENT')view.players.reverse();window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:view,definitions}}));
   return {name:top.name,cost:top.cost,attack:top.attack,health:top.health,otherName:other.name};
  },{cards,viewer});
  await page.waitForTimeout(250);
  await page.evaluate(async()=>{const {executeAction}=await import('/src/game/index.ts');const result=executeAction(window.__revealOriginal,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'guide',boardSlot:0});if(!result.success)throw Error(result.message);const view=structuredClone(result.state);if(window.__revealViewer==='OPPONENT')view.players.reverse();window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:view,definitions:window.__revealDefinitions}}));});
  await page.locator('[data-cinematic-kind="BIG_SPELL"]').waitFor({state:'visible',timeout:3000});
  assert.ok(await page.getByText(expected.name,{exact:true}).isVisible());
  assert.ok(await page.getByText(`덱 맨 위 카드 공개 · 비용 ${expected.cost} · 공격력 ${expected.attack} · 체력 ${expected.health}`,{exact:true}).isVisible());
  assert.equal(await page.getByText(expected.otherName,{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.visualViewport?.scale??1),1);assert.deepEqual(errors,[]);
  results.push({width,viewer,passed:true,scope:'Actual engine play and public card face; production image decoding is a separate check'});await context.close();
 }
 console.log(JSON.stringify({results}));
}finally{await browser.close();}
