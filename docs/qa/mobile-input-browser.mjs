import assert from 'node:assert/strict';import fs from 'node:fs';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const data=JSON.parse(fs.readFileSync('artifacts/ko-game/qa/art-direction-data.json','utf8'));
const cards=data.cards.cards.filter(c=>!c.isToken&&!c.isChampionToken).map(c=>({...c,quantity:3})),card=cards.find(c=>c.rarity==='NORMAL'),champions=data.champions.champions.map(c=>({...c,owned:true})),champion=champions[0];
const deck={id:'touch-deck',name:'터치 검사',championDefinitionId:champion.id,cardDefinitionIds:[card.id,card.id],cards:[card,card],champion,isValid:false,isSelected:false,missingCardDefinitionIds:[],invalidReasons:[],validationReasons:[]};
const browser=await chromium.launch({headless:true,...(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{}:{channel:'chrome'})}),results=[],errors=[];
try{for(const width of [390,320]){
const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname;let json={};if(p.endsWith('/server-status'))json={enabled:false,allowed:true};else if(p.endsWith('/auth/me'))json={authenticated:true,user:{id:'qa',nickname:'qa',role:'USER'}};else if(p.endsWith('/decks/options'))json={cards,champions,isTestAccount:false};else if(p.endsWith('/decks'))json={decks:[deck]};else if(p.endsWith('/cards'))json=data.cards;else if(p.endsWith('/champions'))json=data.champions;else if(p.endsWith('/card-frames'))json=data['card-frames'];return r.fulfill({json});});
await page.goto((process.env.KO_QA_ORIGIN??'http://127.0.0.1:5173')+'/decks');await page.getByTestId('button-open-deck-touch-deck').tap();
const expand=page.getByRole('button',{name:/덱 정보 펼치기/});if(await expand.isVisible())await expand.tap();
const remove=page.getByTestId('button-remove-card-'+card.id);await remove.scrollIntoViewIfNeeded();await remove.tap();assert.match(await page.getByTestId('text-card-count-'+card.id).innerText(),/1/);
assert.equal(await page.locator('.ko-inspector-content:visible').count(),0);
const layer=await page.locator('.ko-decks__editor').evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=Math.min(innerHeight-10,r.y+20);const stack=document.elementsFromPoint(x,y),library=stack.findIndex(n=>n.closest('.ko-decks__library')),editor=stack.findIndex(n=>n.closest('.ko-decks__editor'));return {color:getComputedStyle(e).backgroundColor,order:library===-1||editor<library};});assert.match(layer.color,/^rgb\(/);assert.ok(layer.order);
await remove.tap();await page.getByTestId('empty-selected-cards').waitFor();assert.equal(await page.locator('.ko-inspector-content:visible').count(),0);results.push(width+':opaque editor and two removals without inspector:PASS');
await page.goto((process.env.KO_QA_ORIGIN??'http://127.0.0.1:5173')+'/qa/champion-features.html');await page.getByTestId('board-check').waitFor();
for(const selectedIndex of [0,4,9]){
await page.evaluate(async index=>{const {createInitialGameState,generateCardInstance}=await import('/src/game/index.ts');const spell={id:'touch-spell',name:'터치 주문',cardType:'TECHNIQUE',cost:1,attack:0,health:0,rulesText:'상대 챔피언에게 2 피해',keywords:[],abilities:[{trigger:'ACTIVE',effects:[{type:'DAMAGE_OPPONENT_CHAMPION',amount:2}]}],isToken:false,isChampionToken:false};const filler={...spell,id:'filler',name:'손패 선수',cardType:'WRESTLER',attack:1,health:2,abilities:[]};const defs=[spell,filler],s=createInitialGameState(undefined,defs);s.status='IN_PROGRESS';s.turn=3;s.activePlayerId=s.players[0].id;s.events=[];for(const p of s.players){p.hand=[];p.board=[null,null,null,null];p.champion.quest=null;p.health=20;p.currentGold=10;}s.players[0].hand=Array.from({length:10},(_,i)=>generateCardInstance(i===index?spell:filler,{instanceId:'hand-'+i}));window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions:defs}}));},selectedIndex);
await page.locator('.ko-player-hand').getByRole('button',{name:'터치 주문',exact:true}).tap();const use=page.getByRole('button',{name:'사용',exact:true});await use.waitFor();assert.ok((await use.boundingBox()).height>=44);await use.tap();
await page.waitForFunction(()=>document.querySelector('[data-testid="state-check"]').textContent.includes('hand:9'));assert.equal(await page.locator('.ko-player-hand').getByRole('button',{name:'터치 주문',exact:true}).count(),0);results.push(width+':ten-card hand spell at '+selectedIndex+':PASS');
}
for(const resized of [width,320,390,width]){
await page.setViewportSize({width:resized,height:844});await page.waitForTimeout(250);
const geometry=await page.locator('.ko-game-stage').evaluate(e=>({w:e.getBoundingClientRect().width,x:e.getBoundingClientRect().x,viewport:innerWidth}));assert.ok(Math.abs(geometry.w-geometry.viewport)<1,JSON.stringify(geometry));assert.ok(Math.abs(geometry.x)<1,JSON.stringify(geometry));
const emote=page.getByRole('button',{name:'내 챔피언 감정표현 열기'});await emote.tap();
const menu=page.getByRole('menu',{name:'챔피언 감정표현'});await menu.waitFor();
const bounds=await menu.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=resized+1&&bounds.y+bounds.height<=844);
for(const item of await menu.getByRole('menuitem').all()){assert.ok(await item.isVisible());const b=await item.boundingBox();const top=await item.evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[role="menuitem"]')===e;});assert.ok(top,await item.innerText());}
await menu.getByRole('menuitem').first().tap();await menu.waitFor({state:'hidden'});
}results.push(width+':viewport resize and all six unobscured emote buttons:PASS');
await context.close();
}assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));}finally{await browser.close();}

