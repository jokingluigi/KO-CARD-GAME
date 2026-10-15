import assert from 'node:assert/strict';
import fs from 'node:fs';
const records=JSON.parse(fs.readFileSync('docs/qa/snapshots/20261015-wrestler-revisions/cards.json'));
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.KO_QA_CHROMIUM_EXECUTABLE});
const results=[];
try{for(const [width,height,touch]of [[360,740,true],[390,844,true],[412,915,true],[1440,900,false]]){
 const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',route=>{assert.equal(route.request().method(),'GET');return route.fulfill({json:{cards:[],champions:[],frames:[]}})});await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.goto((process.env.KO_QA_ORIGIN??'http://127.0.0.1:5175')+'/qa/champion-features.html');await page.getByTestId('state-json').waitFor({state:'attached'});await page.getByTestId('board-check').evaluate(e=>e.parentElement.style.display='none');
 await page.evaluate(async records=>{
  const {createInitialGameState,generateCardInstance}=await import('/src/game/index.ts');const {cardRecordToDefinition}=await import('/src/game/cards/published-cards.ts');const defs=records.map(cardRecordToDefinition);
  const ally={id:'browser-authority',name:'태그 검증 선수',cost:1,attack:2,health:6,cardType:'WRESTLER',rulesText:'',keywords:[],abilities:[],tags:['디 어쏘리티'],isToken:false,isChampionToken:false,status:'PUBLISHED'};defs.push(ally);
  const s=createInitialGameState(undefined,defs);s.cardPool=defs;s.minionACardPool=defs;s.status='IN_PROGRESS';s.turn=3;s.activePlayerId='player-1';s.events=[];
  for(const [i,p]of s.players.entries()){p.health=20;p.currentGold=99;p.board=[null,null,null,null];p.hand=[];p.champion.quest=undefined;p.deck=Array.from({length:12},(_,n)=>generateCardInstance(ally,{instanceId:i+'-deck-'+n}));}
  s.players[0].hand=[generateCardInstance(defs.find(d=>d.name==='루나'),{instanceId:'browser-luna'}),generateCardInstance(ally,{instanceId:'browser-ally'})];window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions:defs}}));
 },records);await page.waitForTimeout(150);
 const activate=async l=>touch?l.tap():l.click(), state=async()=>JSON.parse(await page.getByTestId('state-json').textContent());
 await activate(page.locator('.ko-player-hand').getByRole('button',{name:'루나',exact:true}));await activate(page.getByRole('button',{name:'1구역에 카드 배치',exact:true}));
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=state-json]').textContent).players[0].board[0]?.definitionId==='9b7c0e52-2184-4ec1-8d68-39a4d5981d2a');
 await activate(page.locator('.ko-player-hand').getByRole('button',{name:'태그 검증 선수',exact:true}));await activate(page.getByRole('button',{name:'2구역에 카드 배치',exact:true}));
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=state-json]').textContent).players[0].board[0]?.keywords.includes('ARMOR'));assert.equal((await state()).players[0].board[0].armor,1);
 const field=page.locator('.ko-player-board-row .ko-board-slot').first();assert.match(await field.getByTestId('card-keyword-badges').getAttribute('aria-label'),/아머\(1\)/);
 await page.evaluate(async()=>{
  const {applyEffect}=await import('/src/game/effects/effect-engine.ts');const s=JSON.parse(document.querySelector('[data-testid=state-json]').textContent);const source=s.players[0].board[0];const result=applyEffect(s,'player-1',source,{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{armorGain:2,attack:0,health:0}});window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:result,definitions:result.cardPool}}));
 });await page.waitForTimeout(150);assert.equal((await state()).players[0].board[0].armor,3);assert.match(await field.getByTestId('card-keyword-badges').getAttribute('aria-label'),/아머\(3\)/);
 if(touch)await activate(page.locator('.ko-player-board-row .ko-board-inspect-button').first());else{await page.keyboard.press('Alt');await field.hover();}
 const info=page.getByRole('complementary',{name:'상세정보',exact:true});await info.waitFor();assert.match(await info.textContent(),/조킹루이지/);assert.match(await info.getByTestId('card-keyword-badges').getAttribute('aria-label'),/아머\(3\)/);await info.getByRole('button',{name:'상세정보 닫기'}).click();
 assert.equal(await page.locator('[data-testid=dialog-card-artwork]').count(),0);assert.deepEqual(errors,[]);results.push({width,height,touch,status:'PASS'});console.log('PASS '+width+'x'+height);await context.close();
}fs.mkdirSync('qa-results/latest-wrestler-browser',{recursive:true});fs.writeFileSync('qa-results/latest-wrestler-browser/results.json',JSON.stringify({results,physicalDevice:'NOT_RUN',operationalWrites:false},null,2));}finally{await browser.close();}
