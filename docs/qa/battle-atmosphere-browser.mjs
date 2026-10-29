import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const out='qa-results/battle-atmosphere';await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[];
try {
 for(const [width,height]of [[390,844],[1440,900]]){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async r=>{const match=r.request().url().match(/atmos-(default|awaken)\.png/);return r.fulfill(match?{body:await readFile(`qa-results/final-ten-sprites/fixtures/${match[1]==='awaken'?'victory':'default'}.png`),contentType:'image/png'}:{json:{cards:[],frames:[]}});});
  await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html?result=1');await page.locator('.ko-game-shell').waitFor();await page.locator('[data-preview-tools]').evaluate(n=>n.style.display='none');
  await page.evaluate(async()=>{
   const {boardFixture}=await import('/qa/black-gold-fixture.ts');
   const {applyEffect,generateCardInstance,executeAction}=await import('/src/game/index.ts');
   const d={id:'atmos-unit',name:'분위기 검증 선수',cardType:'WRESTLER',cost:1,attack:2,health:4,rarity:'NORMAL',rulesText:'',keywords:[],abilities:[],isToken:false,isChampionToken:false};
   const placement={scale:1,x:50,y:40,crop:false,flip:false};
   window.atmosLoad=(health=20)=>{
    const state=boardFixture();state.gameId=crypto.randomUUID();state.events=[];state.cardPool=[d];state.status='IN_PROGRESS';state.turn=3;state.activePlayerId='player-1';
    const cosmetics={};for(const p of state.players){p.health=health;p.maxHealth=20;p.board=[null,null,null,null];p.champion.maxHealth=20;p.champion.quest=null;p.champion.questCompleted=false;p.currentGold=6;p.maxGold=6;p.hand=p.id==='player-1'?[generateCardInstance(d,{instanceId:'atmos-hand'})]:[];
     const manifest={version:1,frames:Object.fromEntries(['default','awaken'].map(k=>[k,{url:'/api/storage/objects/uploads/cosmetics/atmos-'+k+'.png',self:placement,opponent:{...placement,flip:true}}])),reactions:{}};
     const item={id:'atmos-'+p.id,type:'CHAMPION_SKIN',targetId:p.champion.id,name:'Diagnostic',isActive:true,sortOrder:0,imageAssets:{__battle:JSON.stringify(manifest)}};
     cosmetics[p.id]={skins:{['champion:'+p.champion.id]:item},emotes:[],cardBack:null};
    }
    window.atmos={state,cosmetics};window.atmosPush();
   };
   window.atmosPush=()=>window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{...window.atmos,definitions:[d]}}));
   window.atmosHit=(amount)=>{window.atmos.state=applyEffect(window.atmos.state,'player-2',generateCardInstance(d,{instanceId:'source'}),{type:'DAMAGE_OPPONENT_CHAMPION',amount});window.atmosPush();};
   window.atmosQuest=()=>{const n=structuredClone(window.atmos.state);n.players[0].champion.questCompleted=true;n.events.push({type:'CHAMPION_QUEST_COMPLETED',playerId:'player-1',id:crypto.randomUUID()});window.atmos.state=n;window.atmosPush();};
   window.atmosTurn=()=>{const r=executeAction(window.atmos.state,{type:'END_TURN',playerId:window.atmos.state.activePlayerId});if(!r.success)throw Error(r.message);window.atmos.state=r.state;window.atmosPush();};
  });
  for(const [health,wear]of [[20,'0'],[12,'1'],[6,'2'],[5,'3']]){await page.evaluate(h=>window.atmosLoad(h),health);await page.waitForFunction(w=>document.querySelector('.ko-player-champion .ko-portrait-wear')?.getAttribute('data-wear')===w,wear);}
  await page.evaluate(()=>window.atmosLoad());await page.waitForTimeout(150);assert.equal(await page.locator('.ko-turn-handoff').count(),0);
  await page.evaluate(()=>window.atmosTurn());await page.locator('.ko-turn-handoff i').first().waitFor();assert.equal(await page.locator('.ko-turn-handoff i').count(),2);assert.equal(await page.locator('.ko-turn-handoff').evaluate(n=>getComputedStyle(n).pointerEvents),'none');await page.waitForTimeout(750);assert.equal(await page.locator('.ko-turn-handoff').count(),0);
  await page.evaluate(()=>window.atmosLoad());await page.waitForTimeout(180);await page.evaluate(()=>window.atmosHit(8));await page.locator('.ko-impact-trace').waitFor();assert.match(await page.locator('.ko-impact-trace').getAttribute('src'),/kenney\/particle\/scratch_01/);await page.waitForTimeout(1100);assert.equal(await page.locator('.ko-impact-trace').count(),0);
  await page.evaluate(()=>window.atmosLoad());await page.waitForTimeout(180);await page.evaluate(()=>window.atmosQuest());await page.locator('.ko-player-champion .ko-sprite-awakening-echo').waitFor();await page.screenshot({path:`${out}/awakening-${width}.png`});await page.waitForTimeout(1700);assert.equal(await page.locator('.ko-sprite-awakening-echo').count(),0);
  await page.evaluate(()=>window.atmosLoad());await page.waitForTimeout(200);await page.locator('.ko-hand-card').first().click();await page.locator('.ko-player-board-row .ko-board-slot').first().click();await page.getByTestId('summon-landing-shadow').waitFor();await page.screenshot({path:`${out}/landing-${width}.png`});await page.waitForTimeout(1500);assert.equal(await page.getByTestId('summon-landing-shadow').count(),0);
  await page.evaluate(()=>window.atmosLoad());await page.waitForTimeout(180);await page.evaluate(()=>window.atmosHit(20));await page.getByTestId('match-result-overlay').waitFor();assert.equal(await page.getByTestId('match-result-overlay').getAttribute('data-view'),'battlefield');
  assert.equal(await page.locator('.ko-player-champion').count(),1);assert.equal(await page.locator('.ko-player-champion').getAttribute('data-defeated'),'true');
  assert.equal(await page.locator('.ko-result-reward strong').textContent(),'+200크레딧');await page.waitForTimeout(3200);await page.screenshot({path:`${out}/aftermath-${width}.png`});
  await page.getByRole('button',{name:'상세 결과 · 경기 기록 보기',exact:true}).click();assert.equal(await page.getByTestId('match-result-overlay').getAttribute('data-view'),'details');await page.screenshot({path:`${out}/details-${width}.png`});
  await page.getByRole('button',{name:'전장과 챔피언 보기',exact:true}).click();await page.getByTestId('button-return-to-main-menu').click();await page.getByTestId('match-result-overlay').waitFor({state:'detached'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);await page.evaluate(()=>window.atmosLoad());await page.waitForTimeout(150);await page.evaluate(()=>window.atmosHit(8));await page.waitForTimeout(100);assert.equal(await page.locator('.ko-impact-trace').count(),0);await page.evaluate(()=>window.atmosQuest());await page.waitForTimeout(100);assert.equal(await page.locator('.ko-sprite-awakening-echo').count(),0);
  assert.deepEqual(errors,[]);results.push({width,height,wear:true,turn:true,trace:true,awakening:true,landing:true,result:true,actualEngine:'END_TURN, damage, summon and lethal',quest:'confirmed event fixture',physicalDevice:'NOT_RUN'});await context.close();
 }
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
