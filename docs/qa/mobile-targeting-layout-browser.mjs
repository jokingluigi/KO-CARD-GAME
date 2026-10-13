import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? 'playwright');
const browser=await chromium.launch({ ...(process.env.KO_QA_CHROME_EXECUTABLE ? { executablePath: process.env.KO_QA_CHROME_EXECUTABLE } : { channel: process.env.KO_QA_CHROME_CHANNEL ?? 'chromium' }), headless:true });
const cards=JSON.parse(fs.readFileSync('artifacts/ko-game/src/game/qa/fixtures/cards-2026-10-12-all.json','utf8'));
try{for(const width of [320,360,390,412]){
 const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await page.route('**/api/**',r=>r.fulfill({json:{cards:[],champions:[],frames:[]}}));
 await page.goto(`${process.env.KO_QA_ORIGIN ?? 'http://127.0.0.1:5173'}/qa/champion-features.html`);await page.getByTestId('state-json').waitFor({state:'attached'});await page.getByTestId('board-check').evaluate(e=>e.parentElement.style.display='none');
 await page.evaluate(async(cards)=>{
 const {cardRecordToDefinition}=await import('/src/game/cards/published-cards.ts');const {createInitialGameState,generateCardInstance}=await import('/src/game/index.ts');
 const defs=cards.map(cardRecordToDefinition);const c=defs.find(x=>x.name==='봉인');
 const b={id:'qa-enemy',name:'상대 표적',cardType:'WRESTLER',cost:1,attack:1,health:10,rulesText:'',keywords:[],abilities:[],isToken:false,isChampionToken:false,status:'PUBLISHED'};defs.push(b);
 const s=createInitialGameState(undefined,defs);s.status='IN_PROGRESS';s.activePlayerId=s.players[0].id;s.turn=5;
 for(const p of s.players){p.hand=[];p.board=[null,null,null,null];p.champion.quest=null;p.currentGold=30;p.deck=[generateCardInstance(b,{instanceId:p.id+'-deck'})];p.graveyard=[];}
 s.players[0].hand=[generateCardInstance(c,{instanceId:'played'})];s.players[1].board[0]={...generateCardInstance(b,{instanceId:'enemy'}),boardSlot:0,enteredThisTurn:false};
 window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions:defs}}));
 },cards);
 await page.waitForTimeout(500);await page.evaluate(()=>document.fonts.ready);
 const dims=()=>page.evaluate(()=>({scale:visualViewport.scale,width:innerWidth,scroll:document.documentElement.scrollWidth,controls:document.querySelector('.ko-game-controls').getBoundingClientRect().height,board:document.querySelector('.ko-board-cards').getBoundingClientRect().height}));
 const before=await dims();await page.locator('.ko-player-hand').getByRole('button',{name:'봉인',exact:true}).tap();await page.getByRole('button',{name:'사용',exact:true}).tap();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=state-json]').textContent).targetingState?.active);await page.waitForTimeout(200);
 const during=await dims();console.log(width,{before,during});assert.equal(during.scale,1);assert.equal(during.width,width);assert.ok(during.scroll<=width);assert.equal(during.controls,before.controls);assert.ok(Math.abs(during.board-before.board)<1,'card field must retain its size');
 await page.locator('.ko-mobile-target-cancel').tap();await page.waitForFunction(()=>!JSON.parse(document.querySelector('[data-testid=state-json]').textContent).targetingState?.active);assert.ok(Math.abs((await dims()).board-before.board)<1);
 await page.locator('.ko-player-hand').getByRole('button',{name:'봉인',exact:true}).tap();
 await page.getByRole('button',{name:'사용',exact:true}).tap();
 await page.locator('.ko-opponent-board-row').getByRole('button',{name:'상대 표적',exact:true}).tap();
 await page.waitForFunction(()=>!JSON.parse(document.querySelector('[data-testid=state-json]').textContent).targetingState?.active);
 assert.ok(Math.abs((await dims()).board-before.board)<1);
 const state=JSON.parse(await page.getByTestId('state-json').textContent());
 assert.ok(state.players[0].deck.some(c=>c.instanceId==='enemy'),'selected target resolves into the caster deck');
 await page.close();
}}finally{await browser.close();}
