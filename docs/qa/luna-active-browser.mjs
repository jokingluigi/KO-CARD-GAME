import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const fixture=process.env.KO_QA_CARDS?JSON.parse(readFileSync(process.env.KO_QA_CARDS,'utf8')):null;
const browser=await chromium.launch({headless:true,...(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{}:{channel:'chrome'})});
const results=[],errors=[];
try{for(const width of [1440,390,320]){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width<500,hasTouch:width<500}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{cards:[],champions:[]}}));
 await page.goto((process.env.KO_QA_ORIGIN??'http://127.0.0.1:5173')+'/qa/champion-features.html');
 await page.getByTestId('board-check').waitFor();
 await page.evaluate(async records=>{
  const {cardRecordToDefinition}=await import('/src/game/cards/published-cards.ts');
  const {createInitialGameState,generateCardInstance}=await import('/src/game/index.ts');
  const fallback=[{id:'luna',name:'다이아몬드 군주 루나',text:"이 카드는 합체 할 때 마다 +2/+2를 얻습니다. 액티브:'다이아몬드 군주 루나(캐논)'으로 변신합니다.",cost:6,attack:4,health:4,keywords:['IMMUNE','ARMOR','DEFENSE']},{id:'cannon',name:'다이아몬드 군주 루나(캐논)',text:'카운트다운(3):상대의 모든 선수 카드에게 5 데미지를 가합니다.',cost:5,attack:0,health:8,keywords:['COUNTDOWN']}].map(c=>({...c,cardType:'WRESTLER',status:'DRAFT',isToken:false,isChampionToken:false,tags:[],effectId:null,effectConfig:{armor:1,countdownTurns:3}}));
  const defs=(records?.cards??records??fallback).filter(c=>c.name.startsWith('다이아몬드 군주 루나')).map(cardRecordToDefinition),base=defs.find(c=>c.name==='다이아몬드 군주 루나');
  const s=createInitialGameState(undefined,defs);s.cardPool=defs;s.status='IN_PROGRESS';s.turn=3;s.activePlayerId='player-1';s.events=[];
  for(const p of s.players){p.currentGold=10;p.hand=[];p.deck=[];p.board=[null,null,null,null];p.champion.quest=null;}
  s.players[0].board[0]={...generateCardInstance(base,{instanceId:'luna'}),boardSlot:0,enteredThisTurn:true};
  for(let slot=1;slot<4;slot++)s.players[0].board[slot]={...generateCardInstance(base,{instanceId:'luna-'+slot}),boardSlot:slot,enteredThisTurn:true};
  window.__lunaQA={state:s,defs};window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions:defs}}));
 },fixture);
 const active=page.getByRole('button',{name:'액티브',exact:true}).first();await active.waitFor();assert.equal(await active.isDisabled(),true);assert.match(await active.getAttribute('title'),/다음 자기 턴/);results.push(width+':summoning turn button visible and disabled:PASS');
 await page.evaluate(()=>{const {state:s,defs}=window.__lunaQA;for(const c of s.players[0].board)c.enteredThisTurn=false;window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:structuredClone(s),definitions:defs}}));});
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='액티브'&&!b.disabled));
 if(width<500){const hit=await active.boundingBox();assert.ok(hit.height>=44);assert.ok(await active.evaluate(el=>{const r=el.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return target===el||el.contains(target);}));}
 if(width<500)await active.tap();else await active.click();await page.getByRole('button',{name:'다이아몬드 군주 루나(캐논)',exact:true}).first().waitFor();assert.match(await page.getByTestId('state-check').innerText(),/UNCHANGED/);results.push(width+':usable active button transforms real card through engine:PASS');
 assert.equal(await page.getByRole('button',{name:'액티브',exact:true}).count(),3);
 await context.close();
}assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));}finally{await browser.close();}
