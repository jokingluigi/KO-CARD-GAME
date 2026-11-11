/** Actual online clients/actions and service, isolated PGlite DB; no production writes. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {startTutorialFixture} from './tutorial-rewards-fixture.mjs';
import {chromium} from './black-gold-playwright.mjs';
import {auditSetup} from './ui-audit-fixture.mjs';
import {createInitialGameState} from '../../artifacts/ko-game/src/game/engine/create-initial-game-state.ts';
import {generateCardInstance} from '../../artifacts/ko-game/src/game/cards/generation.ts';
const out='docs/qa/20261111-combat-skins-and-conditions';await mkdir(out,{recursive:true});
const f=await startTutorialFixture(),service=await import('../../artifacts/api-server/src/online/service.ts'),browser=await chromium.launch();
const unit={id:'skin-combat-unit',name:'스킨 검증 선수',cardType:'WRESTLER',rarity:'NORMAL',cost:1,attack:2,health:10,isToken:false,isChampionToken:false,keywords:[],abilities:[],rulesText:'',imageUrl:'/qa/combat-base.png',imageScale:1,imagePositionX:50,imagePositionY:50};
const art=await readFile('artifacts/ko-game/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png');
const loadout=(i)=>({version:1,skins:{['card:'+unit.id]:{id:'combat-skin-'+i,type:'CARD_SKIN',name:'검증 스킨 '+i,targetId:unit.id,isActive:true,sortOrder:0,imageAssets:{art:'/qa/combat-skin-'+i+'.png',__display:JSON.stringify({art:{imageDisplayMode:'COVER',imageScale:i===1?1.24:.76,imagePositionX:i===1?35:65,imagePositionY:45}})}}},cardBack:null,emotes:[]});
const results=[],ids=[];
try{
 await f.db.insert(f.schema.usersTable).values({id:'skin-opponent',email:'skins@example.invalid',nickname:'검증 상대',passwordHash:'unusable',role:'USER'});
 await f.db.insert(f.schema.decksTable).values([{id:'skin-one',userId:'tutorial-user',name:'검증 덱'},{id:'skin-two',userId:'skin-opponent',name:'검증 덱'}]);
 for(const [width,height] of [[390,844],[844,390],[1440,900]])for(const mode of ['self','opponent','lethal','champion','unskinned']){
  console.log('case',width,mode);const id='skin-combat-'+width+'-'+mode;ids.push(id);const state=createInitialGameState();
  Object.assign(state,{gameId:id,status:'IN_PROGRESS',turn:5,activePlayerId:mode==='opponent'?'PLAYER_TWO':'PLAYER_ONE',events:[],openingMulligan:undefined,cardPool:[unit],minionACardPool:[unit]});
  for(const [i,p] of state.players.entries()){Object.assign(p,{id:i?'PLAYER_TWO':'PLAYER_ONE',hand:[],deck:[],board:[null,null,null,null],graveyard:[],removedFromGame:[],health:20,maxHealth:20,currentGold:6});p.champion.quest=null;p.champion.health=20;p.board[0]={...generateCardInstance(unit,{instanceId:'skin-unit-'+i}),boardSlot:0,enteredThisTurn:false,enteredOnTurn:0,currentHealth:mode==='lethal'?2:10};}
  if(mode==='champion')state.players[1].board=[null,null,null,null];
  const cosmetics=mode==='unskinned'?{}:{'PLAYER_ONE':loadout(1),'PLAYER_TWO':loadout(2)};
  await f.db.insert(f.schema.onlineMatchesTable).values({id,status:'ACTIVE',player1UserId:'tutorial-user',player2UserId:'skin-opponent',player1DeckId:'skin-one',player2DeckId:'skin-two',serializedGameState:state,serializedSnapshot:{player1UserId:'tutorial-user',player2UserId:'skin-opponent',player1DeckId:'skin-one',player2DeckId:'skin-two',cardDefinitions:[unit],championDefinitions:[],publicPlayers:state.players.map((p,i)=>({seat:i?'PLAYER_TWO':'PLAYER_ONE',userId:i?'skin-opponent':'tutorial-user',nickname:p.name,championName:p.champion.name,portraitUrl:p.champion.imageUrl,dialogueLine:null})),introFirstSpeaker:null,cosmetics}});
  const runtime=await service.getRuntime(id);assert.ok(runtime);const errors=[];
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000});
  const pages=[];
  for(const user of ['tutorial-user','skin-opponent']){
   const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await auditSetup(p);
   await p.route('**/qa/combat-*.png',r=>r.fulfill({contentType:'image/png',body:art}));
   await p.route('**/api/auth/me',r=>r.fulfill({json:{authenticated:true,user:{id:user,role:'USER',nickname:user,currencyBalance:0}}}));
   await p.route('**/api/online-matches/ws-ticket',r=>r.fulfill({json:{ticket:'isolated'}}));
   await p.routeWebSocket('**/api/online-matches/ws**',ws=>{
    const c={userId:user,send:m=>ws.send(JSON.stringify(m))};
    ws.onMessage(async raw=>{try{const m=JSON.parse(String(raw));if(m.type==='SUBSCRIBE'||m.type==='RESYNC'){service.attachConnection(runtime,c);c.send(service.snapshotMessage(runtime,user));}if(m.type==='PING')ws.send(JSON.stringify({type:'PONG'}));if(m.type==='MATCH_ACTION'){const r=await service.applyMatchAction(id,user,m.requestId,m.expectedVersion,m.action,c);if(r.ok)for(const conn of runtime.connections)conn.send(service.messageForViewer(r,conn.userId));else c.send(service.rejectionMessage(runtime,m.requestId,r.code,r.message));}}catch(e){errors.push(e.stack??e.message)}});
    ws.onClose(()=>service.detachConnection(runtime,c));
   });
   await p.goto('http://127.0.0.1:5186/online/match/'+id);await p.locator('.ko-game-shell').waitFor().catch(async e=>{await p.screenshot({path:out+'/failure.png'});console.log('page body',await p.locator('body').innerText());throw e;});
   await p.evaluate(()=>{window.__skinFrames=[];window.__watchSkins=true;const sample=()=>{if(!window.__watchSkins)return;for(const role of ['attacker','target']){const n=document.querySelector('.attack-animation__'+role+' img[alt="스킨 검증 선수"]');if(n)window.__skinFrames.push({role,src:n.getAttribute('src'),transform:n.style.transform,position:n.style.objectPosition});}requestAnimationFrame(sample)};requestAnimationFrame(sample)});
  }
  const actor=pages[mode==='opponent'?1:0];
  await actor.locator('.ko-player-board-row .ko-board-slot').first().click({position:{x:22,y:45}});
  if(mode==='champion')await actor.locator('.ko-opponent-champion').click();else await actor.locator('.ko-opponent-board-row .ko-board-slot').first().click({position:{x:22,y:45}});
  await Promise.all(pages.map(p=>p.waitForFunction(()=>window.__skinFrames?.some(x=>x.role==='attacker'))));
  if(mode==='self')await actor.screenshot({path:`${out}/attack-${width}.png`});
  await Promise.all(pages.map(p=>p.waitForFunction(()=>!document.querySelector('.attack-animation'))));
  for(const p of pages){const samples=await p.evaluate(()=>{window.__watchSkins=false;return window.__skinFrames});assert.ok(samples.length>1);for(const sample of samples){const player=sample.role==='attacker'?(mode==='opponent'?2:1):(mode==='opponent'?1:2);assert.equal(sample.src,mode==='unskinned'?'/qa/combat-base.png':`/qa/combat-skin-${player}.png`);assert.equal(sample.transform,mode==='unskinned'?'scale(1)':`scale(${player===1?1.24:.76})`);}if(mode!=='champion')assert.ok(samples.some(s=>s.role==='target'));}
  assert.equal(runtime.state.events.filter(e=>e.type==='ATTACK_DECLARED').length,1);
  if(mode==='lethal')assert.ok(runtime.state.players.every(p=>p.board.every(c=>!c)&&p.graveyard.length===1));
  assert.deepEqual(errors,[]);results.push({width,height,mode,bothOnlineClients:true,acceptedServerAttack:true,allAnimationFramesKeepSkin:true,skinCropPreserved:true,productionWrites:0,errors});
  await context.close();service.cleanupMatchRuntime(id);
 }
 await writeFile(out+'/browser-results.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
}finally{for(const id of ids)service.cleanupMatchRuntime(id);await browser.close();await f.close()}
