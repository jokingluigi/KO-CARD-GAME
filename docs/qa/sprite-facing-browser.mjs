import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/api/**',async r=>r.fulfill(r.request().url().includes('facing-broken')?{status:404,body:'not found'}:r.request().url().includes('/facing-')?{body:await readFile('qa-results/final-ten-sprites/fixtures/default.png'),contentType:'image/png'}:{json:{cards:[],frames:[]}}));
 await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await page.locator('.ko-game-shell').waitFor();
 await page.evaluate(async()=>{
  const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');
  const s=boardFixture();s.gameId='facing-'+crypto.randomUUID();s.events=[];
  const p={scale:1,x:50,y:35,crop:false,flip:false};
  const frame=(url,selfFlip,opponentFlip)=>({url:'/api/storage/objects/uploads/cosmetics/facing-'+url+'.png',self:{...p,flip:selfFlip},opponent:{...p,flip:opponentFlip}});
  const cosmetics={};
  for(const [i,player] of s.players.entries()) {
   player.health=10;player.champion.quest=null;player.champion.questCompleted=false;
   const config={version:1,frames:{default:frame('normal-'+i,false,true),low:frame('low-'+i,true,false)},reactions:{},awakening:'REPLACE',awakened:{version:1,frames:{default:frame('awake-'+i,true,false)},reactions:{}}};
   cosmetics[player.id]={cardBack:null,emotes:[null,null,null,null],skins:{['champion:'+player.champion.id]:{id:'selected-skin-'+i,type:'CHAMPION_SKIN',targetId:player.champion.id,name:'Fixture '+i,description:'',isActive:true,sortOrder:0,imageAssets:{art:'/api/storage/objects/uploads/cosmetics/facing-art-'+i+'.png',__battle:JSON.stringify(config)}}}};
  }
  window.__facing={state:s,definitions,cosmetics};
  window.__publishFacing=()=>window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:structuredClone(window.__facing)}));window.__publishFacing();
 });
 async function verify(ownFlip,enemyFlip,set){
  for(const [side,index,flip] of [['player',0,ownFlip],['opponent',1,enemyFlip]]){
   const actor=page.locator(`.ko-${side}-champion .ko-battle-actor`);
   await page.waitForFunction(({side,set})=>{const a=document.querySelector(`.ko-${side}-champion .ko-battle-actor`);const img=a.querySelector('img');return a.dataset.spriteSet===set&&img?.complete&&img.naturalWidth>0;},{side,set});
   assert.equal(await actor.getAttribute('data-sprite-skin'),'selected-skin-'+index);
   assert.equal(await actor.locator('.ko-battle-actor__body').evaluate(n=>getComputedStyle(n).transform),flip?'matrix(-1, 0, 0, 1, 0, 0)':'matrix(1, 0, 0, 1, 0, 0)');
  }
 }
 await verify(false,true,'normal');
 await page.evaluate(()=>{for(const p of window.__facing.state.players)p.health=5;window.__publishFacing();});
 await page.waitForFunction(()=>document.querySelector('.ko-player-champion .ko-battle-actor img')?.src.includes('facing-low-0'));
 await verify(false,true,'normal');
 await page.evaluate(()=>{for(const p of window.__facing.state.players)p.champion.questCompleted=true;window.__publishFacing();});
 await verify(false,true,'awakened');
 // No new event history on a remount: restore current selected skin/set/HP immediately.
 await page.evaluate(()=>{window.__facing.state.gameId='reconnect-facing';window.__publishFacing();});
 await verify(false,true,'awakened');
 await page.evaluate(()=>{
  for(const player of window.__facing.state.players) {
   player.champion.questCompleted=false;
   const item=window.__facing.cosmetics[player.id].skins['champion:'+player.champion.id];
   const config=JSON.parse(item.imageAssets.__battle);
   config.frames.default.url='/api/storage/objects/uploads/cosmetics/facing-broken.png';
   config.frames.low.url=config.frames.default.url;
   item.imageAssets.__battle=JSON.stringify(config);
  }
  window.__facing.state.gameId='art-fallback';window.__publishFacing();
 });
 await page.waitForFunction(()=>[...document.querySelectorAll('.ko-battle-actor')].every(a=>a.dataset.spriteSource==='illustration-fallback'&&a.querySelector('img')?.src.includes('facing-art-')));
 await verify(false,true,'normal');
 await page.evaluate(()=>{
  for(const player of window.__facing.state.players){const item=window.__facing.cosmetics[player.id].skins['champion:'+player.champion.id];item.imageAssets.art='/api/storage/objects/uploads/cosmetics/facing-broken-art.png';}
  window.__facing.state.gameId='name-fallback';window.__publishFacing();
 });
 await page.waitForFunction(()=>[...document.querySelectorAll('.ko-battle-actor')].every(a=>!a.querySelector('img')&&a.querySelector('span')?.textContent));
 assert.equal(await page.locator('.ko-turn-end').isVisible(),true);
 console.log('PASS actual shared battle: both selected skins, automatic mirrored opponent and original self across normal/low/awake, remount and illustration fallback; skin-art and name fallbacks keep battle available');
} finally {await browser.close();}
