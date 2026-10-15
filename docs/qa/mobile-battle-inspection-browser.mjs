import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch({headless:true,...(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{}:{channel:'chrome'})});
const results=[];
try {
 for(const [width,height] of [[320,740],[360,740],[390,844],[430,932],[844,390]]) {
  console.log(JSON.stringify({checking:{width,height}}));
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{cards:[],champions:[],frames:[]}}));
  await page.goto((process.env.KO_QA_ORIGIN??'http://127.0.0.1:5173')+'/qa/champion-features.html');
  await page.getByTestId('state-json').waitFor({state:'attached'});
  await page.getByTestId('board-check').evaluate(e=>e.parentElement.style.display='none');
  if(process.env.KO_QA_COMPILED_CSS==='1') {
   await page.evaluate(()=>document.querySelectorAll('style,link[rel=stylesheet]').forEach(e=>e.remove()));
   for(const f of fs.readdirSync('artifacts/ko-game/dist/public/assets').filter(f=>f.endsWith('.css')&&(f.startsWith('index-')||f.startsWith('game-state-preview-'))))await page.addStyleTag({path:'artifacts/ko-game/dist/public/assets/'+f});
  }
  await page.evaluate(async()=>{
   const {createInitialGameState,generateCardInstance}=await import('/src/game/index.ts');
   const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280"><rect width="200" height="280" fill="#6b4299"/><circle cx="100" cy="90" r="50" fill="#f2b976"/></svg>');
   const card={id:'mobile-inspection',name:'모바일 정보 검증 선수',cardType:'WRESTLER',rarity:'EPIC',cost:1,attack:3,health:8,imageUrl:image,rulesText:'상대 선수 1장에게 2 데미지.',keywords:[],abilities:[{trigger:'ENTER_FIELD',effects:[{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:2}}]}],isToken:false,isChampionToken:false};
   const s=createInitialGameState(undefined,[card]);s.status='IN_PROGRESS';s.turn=3;s.activePlayerId='player-1';s.events=[];
   for(const p of s.players){p.hand=[];p.board=[null,null,null,null];p.currentGold=6;p.deck=Array.from({length:20},(_,i)=>generateCardInstance(card,{instanceId:p.id+'-deck-'+i}));p.champion.name='챔피언 마왕 벨모르트 긴 이름';p.champion.imageUrl=image;p.champion.quest=null;p.board[0]={...generateCardInstance(card,{instanceId:p.id+'-board'}),boardSlot:0,enteredThisTurn:true};}
   s.players[0].hand=[generateCardInstance(card,{instanceId:'inspection-hand'})];
   window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions:[card]}}));
  });
  await page.waitForTimeout(250);
  for(const side of ['player','opponent']) {
   const portrait=page.locator('.ko-'+side+'-champion');const bounds=await portrait.boundingBox();
   assert.ok(bounds.width>=70&&bounds.height>=84,JSON.stringify({width,height,side,bounds}));
   assert.equal(await portrait.locator('.ko-champion-portrait-name').isVisible(),false);
   assert.equal(await portrait.locator('img').evaluate(e=>e.complete&&e.naturalWidth>0),true);
  }
  if(width===390){fs.mkdirSync('qa-results/mobile-controls',{recursive:true});await page.screenshot({path:'qa-results/mobile-controls/battle-390.png'});}
  console.log('portraits passed');
  const geometry=()=>page.evaluate(()=>({slot:document.querySelector('.ko-player-board-row .ko-board-slot').getBoundingClientRect().toJSON(),controls:document.querySelector('.ko-game-controls').getBoundingClientRect().toJSON(),scroll:document.documentElement.scrollWidth,viewport:innerWidth,scale:visualViewport.scale}));
  const before=await geometry();
  await page.locator('.ko-player-board-row').getByRole('button',{name:'모바일 정보 검증 선수',exact:true}).tap();
  await page.getByText('이 선수는 이번 턴에 공격할 수 없습니다.',{exact:true}).waitFor();
  const hint=await geometry();assert.equal(hint.slot.width,before.slot.width,'attack warning must not shrink cards');assert.equal(hint.controls.height,before.controls.height);
  console.log('hint passed');
  await page.locator('.ko-player-board-row .ko-board-inspect-button').tap();
  const panel=page.getByRole('complementary',{name:'상세정보',exact:true});await panel.waitFor();
  assert.match(await panel.getByTestId('inspector-card-rules').textContent(),/상대 선수 1장에게 2/);
  assert.match(await panel.textContent(),/공격력/);assert.equal(await page.getByRole('dialog').count(),0,'info tap must not trigger artwork');
  await panel.getByRole('button',{name:'상세정보 닫기',exact:true}).tap();await panel.waitFor({state:'hidden'});
  await page.locator('.ko-player-hand .ko-hand-inspect-button').tap();await panel.waitFor();
  assert.match(await panel.getByTestId('inspector-card-rules').textContent(),/상대 선수 1장에게 2/);assert.equal(await page.getByRole('dialog').count(),0);
  console.log('both info buttons passed');
  await panel.getByRole('button',{name:'모바일 정보 검증 선수 풀 일러스트 보기',exact:true}).tap();await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').textContent(),/풀 일러스트/);await page.keyboard.press('Escape');
  console.log('artwork passed');
  // Close the inspector deliberately; then use the real engine targeting path.
  if(await panel.isVisible())await panel.getByRole('button',{name:'상세정보 닫기',exact:true}).tap();
  await page.locator('.ko-player-hand').getByRole('button',{name:'모바일 정보 검증 선수',exact:true}).tap();
  const beforeTarget=await geometry();await page.getByRole('button',{name:'2구역에 카드 배치',exact:true}).tap();
  await page.waitForFunction(()=>Boolean(JSON.parse(document.querySelector('[data-testid=state-json]').textContent).targetingState));
  const targeting=await geometry();assert.equal(targeting.slot.width,beforeTarget.slot.width,'target selection must not shrink cards');if(height>width)assert.equal(targeting.controls.height,beforeTarget.controls.height);
  await page.locator('.ko-opponent-board-row').getByRole('button',{name:'모바일 정보 검증 선수',exact:true}).tap();
  await page.waitForFunction(()=>!JSON.parse(document.querySelector('[data-testid=state-json]').textContent).targetingState);
  assert.equal(JSON.parse(await page.getByTestId('state-json').textContent()).players[1].board[0].currentHealth,6);
  const end=await geometry();assert.ok(end.scroll<=end.viewport+1);assert.equal(end.scale,1);
  assert.equal(await page.locator('.ko-game-shell').evaluate(e=>getComputedStyle(e).touchAction),'pan-x pan-y');
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.synthesizePinchGesture',{x:Math.round(width/2),y:Math.round(height/2),scaleFactor:1.5,relativeSpeed:800,gestureSourceType:'touch'});
  assert.equal(await page.evaluate(()=>visualViewport.scale),1,'battle touch gestures must not zoom the viewport');
  assert.deepEqual(errors,[]);results.push({width,height,passed:true});await context.close();
 }
 console.log(JSON.stringify({results}));
}finally{await browser.close();}
