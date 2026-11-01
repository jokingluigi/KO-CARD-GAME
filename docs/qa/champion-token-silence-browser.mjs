/** Actual common battle UI + engine, with a restored old-format token flag. */
import assert from 'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{chromium}from'./black-gold-playwright.mjs';
const out='qa-results/champion-token-silence';await mkdir(out,{recursive:true});const b=await chromium.launch(),results=[];
try{for(const[width,height]of[[390,844],[1440,900]]){
 const p=await b.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.fulfill({json:{cards:[],frames:[]}}));await p.addInitScript(()=>{localStorage.setItem('ko-match-coach-v1','done');HTMLMediaElement.prototype.play=()=>Promise.resolve();});
 await p.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await p.locator('.ko-game-shell').waitFor();await p.locator('[data-preview-tools]').evaluate(n=>n.style.display='none');
 await p.evaluate(async()=>{const{boardFixture}=await import('/qa/black-gold-fixture.ts');const{generateCardInstance}=await import('/src/game/index.ts');
 const unit={id:'silence-normal',name:'검증 일반 선수',cardType:'WRESTLER',rarity:'NORMAL',cost:1,attack:2,health:5,rulesText:'러쉬',isToken:false,isChampionToken:false,keywords:['RUSH'],abilities:[]};
 const token={...unit,id:'silence-champion-token',name:'검증 챔피언 토큰',rarity:'CHAMPION',isToken:true,isChampionToken:true};
 const spell={...unit,id:'silence-spell',name:'검증 침묵 주문',cardType:'TECHNIQUE',cost:1,attack:0,health:0,keywords:[],rulesText:'상대 선수를 침묵시킵니다.',abilities:[{trigger:'ACTIVE',effects:[{type:'STRUCTURED',action:'SILENCE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1}}]}]};
 const s=boardFixture();s.gameId='silence-'+crypto.randomUUID();s.events=[];s.cardPool=[unit,token,spell];s.activePlayerId='player-1';s.targetingState=undefined;s.openingMulligan=undefined;
 for(const pl of s.players){pl.board=[null,null,null,null];pl.hand=[];pl.currentGold=10;pl.champion.quest=null;pl.champion.questCompleted=false;}
 s.players[0].hand=[generateCardInstance(spell,{instanceId:'cast-1'}),generateCardInstance(spell,{instanceId:'cast-2'})];
 s.players[1].board=[{...generateCardInstance(token,{instanceId:'immune-target'}),isSilenceImmune:false,currentAttack:7,maxHealth:9,currentHealth:8,boardSlot:0},{...generateCardInstance(unit,{instanceId:'normal-target'}),boardSlot:1},null,null];
 window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:JSON.parse(JSON.stringify(s)),definitions:s.cardPool}}));});
 const state=async()=>JSON.parse(await p.getByTestId('state-json').textContent());
 async function cast(slot){await p.locator('.ko-hand-card').first().click();await p.getByRole('button',{name:'사용',exact:true}).click();await p.getByTestId('effect-target-focus').waitFor();await p.locator('.ko-opponent-board-row .ko-board-slot').nth(slot).click();await p.getByTestId('effect-target-focus').waitFor({state:'detached'});await p.getByTestId('preview-busy').filter({hasText:'false'}).waitFor();}
 await cast(0);let s=await state();assert.equal(s.players[0].hand.length,1);assert.equal(s.players[0].currentGold,9);assert.equal(s.players[1].board[0].isSilenced,false);assert.equal(s.players[1].board[0].currentAttack,7);assert.ok(s.players[1].board[0].keywords.includes('RUSH'));
 await cast(1);s=await state();assert.equal(s.players[0].hand.length,0);assert.equal(s.players[0].currentGold,8);assert.equal(s.players[1].board[1].isSilenced,true);assert.deepEqual(s.players[1].board[1].keywords,[]);assert.equal(s.players[1].board[0].isSilenced,false);await p.screenshot({path:`${out}/after-${width}.png`});assert.deepEqual(errors,[]);
 results.push({width,height,actualTechniqueUseAndTargetSelection:true,oldSnapshotImmuneTokenPreservesStatsAndKeywords:true,ordinaryTargetStillSilenced:true,normalSpellCostConsumed:true,errors});await p.close();
}await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await b.close();}
