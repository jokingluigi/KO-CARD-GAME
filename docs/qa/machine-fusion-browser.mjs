import assert from 'node:assert/strict';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[],errors=[];
try {for(const width of [1440,390,320]){
const context=await browser.newContext({viewport:{width,height:844},isMobile:width<500,hasTouch:width<500}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{cards:[],champions:[]}}));
await page.goto('http://127.0.0.1:5173/qa/champion-features.html');await page.getByTestId('board-check').waitFor();
const result=await page.evaluate(async()=>{
const {cardRecordToDefinition}=await import('/src/game/cards/published-cards.ts');
const {createInitialGameState,generateCardInstance}=await import('/src/game/index.ts');
const {resolveTriggeredAbilities}=await import('/src/game/effects/effect-engine.ts');
const common={cardType:'WRESTLER',status:'DRAFT',isToken:true,isChampionToken:true,effectId:null,effectConfig:{countdownTurns:3},keywords:[],tags:['기계']};
const defs=[cardRecordToDefinition({...common,id:'rune',name:'룬스달라이트 군주 루나',cost:6,attack:0,health:8,keywords:['COUNTDOWN'],text:"카운트다운(3):'공격불가' 키워드를 제거하고, 필드에 있는 모든 '기계' 카드들을 전부 이 카드에 합체시킵니다! 그리고 '러쉬' 키워드를 추가합니다! 이 카드는 '도발'을 무시하고 상대 챔피언을 공격 할 수 있습니다!"}),cardRecordToDefinition({...common,id:'machine',name:'기계 재료',cost:1,attack:2,health:3,text:''})];
const s=createInitialGameState(undefined,defs);s.cardPool=defs;s.status='IN_PROGRESS';s.turn=3;s.activePlayerId='player-1';s.events=[];
for(const p of s.players){p.hand=[];p.deck=[];p.board=[null,null,null,null];p.champion.quest=null;}
s.players[0].board[0]={...generateCardInstance(defs[0],{instanceId:'rune'}),boardSlot:0,enteredThisTurn:false};
for(const [owner,slot,id] of [[0,1,'own'],[1,0,'enemy']])s.players[owner].board[slot]={...generateCardInstance(defs[1],{instanceId:id}),boardSlot:slot,enteredThisTurn:false};
const n=resolveTriggeredAbilities(s,'player-1',s.players[0].board[0],'COUNTDOWN');
window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:n,definitions:defs}}));
const c=n.players[0].board[0];return {atk:c.currentAttack,hp:c.currentHealth,vanished:n.events.filter(e=>e.type==='CARD_VANISHED').length,pending:!!n.targetingState};
});
assert.deepEqual(result,{atk:4,hp:14,vanished:2,pending:false});
await page.getByRole('button',{name:'룬스달라이트 군주 루나',exact:true}).waitFor();
assert.equal(await page.getByRole('button',{name:'기계 재료',exact:true}).count(),0);
results.push(width+':fusion engine and rendered board:PASS');await context.close();
}assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));}finally{await browser.close();}

