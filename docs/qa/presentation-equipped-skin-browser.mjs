/** Real battle UI + engine events; mirror champions must use the acting player's loadout. */
import {chromium} from './black-gold-playwright.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qa-results/presentation-equipped-skin';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
try{for(const width of [390,1440]){
 const p=await browser.newPage({viewport:{width,height:width===390?844:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/**',r=>r.fulfill({json:{cards:[],champions:[],frames:[]}}));
 await p.route('https://skins.example/**',r=>r.request().url().includes('broken')?r.fulfill({status:404,body:''}):r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#55452c"/><path d="M50 350L150 30L250 350Z" fill="#dbbc7b"/></svg>'}));
 await p.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await p.locator('.ko-game-shell').waitFor();
 async function setup(owner,kind,variant='skin',awake=false){await p.evaluate(async({owner,kind,variant,awake})=>{
  const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');const {generateCardInstance}=await import('/src/game/index.ts');
  const s=boardFixture();s.gameId='skin-'+crypto.randomUUID();s.events=[];s.cardPool=definitions;s.activePlayerId=s.players[owner].id;
  const champion=structuredClone(s.players[0].champion),legend=definitions.find(d=>d.name==='RM우디르'),plain=definitions.find(d=>d.name==='리버덩크');
  s.players.forEach((p,i)=>{p.currentGold=10;p.health=20;p.hand=[];p.board=[null,null,null,null];p.champion=structuredClone(champion);Object.assign(p.champion,{quest:null,questCompleted:awake,questProgress:0,imageUrl:'https://skins.example/original.svg',questCompletedPortraitEnabled:true,questCompletedPortraitUrl:'https://skins.example/original-awake.svg',ability:{id:'qa-ability',name:'스킨 확인 능력',description:'골드 +1',cost:0,effects:[{type:'GAIN_GOLD',amount:1}]},upgradedAbility:null});});
  const cosmetics={};for(const [i,p]of s.players.entries()){const who=i===0?'self':'opponent';cosmetics[p.id]={version:1,skins:{['champion:'+champion.id]:{id:who,type:'CHAMPION_SKIN',targetId:champion.id,name:who,isActive:true,sortOrder:0,description:'',imageAssets:{art:`https://skins.example/${variant==='broken'?'broken':who+'-champion'}.svg`,awakened:`https://skins.example/${who}-awake.svg`,__display:JSON.stringify({art:{imageDisplayMode:'CUSTOM',imageScale:1.3,imagePositionX:23,imagePositionY:61},awakened:{imageDisplayMode:'CUSTOM',imageScale:1.2,imagePositionX:37,imagePositionY:65}})}},['card:'+legend.id]:{id:who+'-card',type:'CARD_SKIN',targetId:legend.id,name:who,isActive:true,sortOrder:0,description:'',imageAssets:{art:`https://skins.example/${who}-card.svg`,__display:JSON.stringify({art:{imageDisplayMode:'CUSTOM',imageScale:1.4,imagePositionX:31,imagePositionY:72}})}}},cardBack:null,emotes:[null,null,null,null]};}
  if(variant==='default')Object.values(cosmetics).forEach(l=>l.skins={});
  if(kind==='quest'){s.players[owner].champion.questCompleted=false;s.players[owner].champion.quest={id:'skin-quest',name:'사용',description:'한 장',trackedEvent:'CARD_PLAYED',requiredProgress:1,reward:{type:'GAIN_GOLD',amount:1}};}
  if(kind!=='ability')s.players[owner].hand=[generateCardInstance(kind==='legend'?legend:plain,{instanceId:'skin-play'})];
  window.__skin={state:s,definitions,cosmetics,owner,kind};window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:window.__skin}));
 },{owner,kind,variant,awake});await p.waitForTimeout(100);await p.locator("[data-cinematic-kind]").waitFor({state:"detached",timeout:3000});}
 async function act(){await p.evaluate(async()=>{const x=window.__skin;const {executeAction}=await import('/src/game/index.ts');const action=x.kind==='ability'?{type:'USE_CHAMPION_ABILITY',playerId:x.state.players[x.owner].id}:{type:'PLAY_WRESTLER',playerId:x.state.players[x.owner].id,cardInstanceId:'skin-play',boardSlot:0};const r=executeAction(x.state,action);if(!r.success)throw Error(r.message);x.state=r.state;window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:x}));});}
 for(const owner of [0,1])for(const kind of ['ability','quest','legend']){
  await setup(owner,kind);await act();const who=owner===0?'self':'opponent';const scene=p.locator(kind==='legend'?'[data-legendary-spotlight]':`[data-cinematic-kind="${kind==='quest'?'AWAKENING':'ABILITY'}"]`);await scene.waitFor();const image=scene.locator('img').first();await image.waitFor();await image.evaluate(i=>i.decode());
  const expected=`https://skins.example/${who}-${kind==='quest'?'awake':kind==='legend'?'card':'champion'}.svg`;assert.equal(await image.getAttribute('src'),expected);
  const style=await image.getAttribute('style');assert.ok(style.includes(`scale(${kind==='quest'?1.2:kind==='legend'?1.4:1.3})`),style);assert.ok(style.includes(kind==='quest'?'37% 65%':kind==='legend'?'31% 72%':'23% 61%'),style);
  if(width===390)await p.screenshot({path:`${out}/${who}-${kind}.png`});results.push({width,owner,kind,actualSkin:true,customFraming:true,mirrorOwnerCorrect:true});
 }
 for(const variant of ['default','broken']){await setup(0,'ability',variant);await act();const image=p.locator('[data-cinematic-kind="ABILITY"] img');await image.waitFor();await p.waitForFunction(()=>document.querySelector('[data-cinematic-kind="ABILITY"] img')?.getAttribute('src')==='https://skins.example/original.svg');assert.ok((await image.getAttribute('style')).includes('scale(1)'));results.push({width,variant,originalFallback:true});}
 await setup(1,'ability','skin',true);await act();const awake=p.locator('[data-cinematic-kind="ABILITY"] img');await awake.waitFor();assert.equal(await awake.getAttribute('src'),'https://skins.example/opponent-awake.svg');results.push({width,awakenedAbilitySkin:true});
 assert.deepEqual(errors,[]);await p.close();
}await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
