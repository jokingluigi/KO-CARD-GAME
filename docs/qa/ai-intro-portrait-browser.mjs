/** Actual Home/AI entry UI with isolated API fixtures and original portrait files. No DB writes. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from './black-gold-playwright.mjs';
await import('./checkpoints/20261006/qa-loader.mjs');
const {championRecordToDefinition}=await import('../../artifacts/ko-game/src/game/champions/published-champions.ts');
const {cardRecordToDefinition}=await import('../../artifacts/ko-game/src/game/cards/published-cards.ts');
const {createInitialGameState,startGame}=await import('../../lib/game-engine/src/index.ts');
const champions=JSON.parse(await readFile('docs/qa/snapshots/20261024-admin/champions.json','utf8')).filter(c=>c.status==='PUBLISHED');
const cards=JSON.parse(await readFile('docs/qa/snapshots/20261024-admin/cards.json','utf8')).filter(c=>c.status==='PUBLISHED');
const shell=JSON.parse(await readFile('artifacts/ko-game/qa/art-direction-data.json','utf8'));
const paintCheck=process.env.KO_INTRO_PAINT_CHECK==='1';
const self=champions.find(c=>c.name==='챔피언 퍼플레인'),opp=champions.find(c=>c.name===(paintCheck?'챔피언 크루세이더즈':'챔피언 마왕 벨모르트'));
const selected=cards.filter(c=>c.rarity==='NORMAL'&&!c.isToken&&!c.isChampionToken).flatMap(c=>[c,c,c]).slice(0,25);
const ids=selected.map(c=>c.id),definitions=cards.map(cardRecordToDefinition),cs=champions.map(championRecordToDefinition);
const deck={id:'portrait-test-deck',name:'초상화 테스트',championDefinitionId:self.id,cardDefinitionIds:ids,cards:selected,champion:self,isValid:true};
const ai={...deck,id:'portrait-test-ai',name:'기존 AI 상대',championDefinitionId:opp.id,champion:opp,enabled:true,displayOrder:0,difficulty:'NORMAL'};
const out=process.env.KO_AI_INTRO_OUTPUT??'qa-results/ai-intro-portraits';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[],paintSamples=[];
try{
 for(const [width,height] of (paintCheck?[[360,740],[375,812],[390,844],[412,915],[1440,900]]:[[390,844],[1440,900]])){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:paintCheck?3:1,isMobile:paintCheck&&width<768,hasTouch:paintCheck&&width<768});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(paintCheck)await page.addInitScript(()=>{const origin=Date.now();window.__introPaintTime=0;Date.now=()=>origin+window.__introPaintTime;});
  const images=[];
  await page.route('**/api/**',async r=>{
   const p=new URL(r.request().url()).pathname;let json={};
   if(p.startsWith('/api/storage/')){
    images.push(p);
    const f='/tmp/ko-board-image-cache/'+createHash('sha256').update(p).digest('hex');
    try{return await r.fulfill({body:await readFile(f),contentType:await readFile(f+'.type','utf8')});}catch{return r.fulfill({status:404,body:''});}
   }
   if(p.endsWith('/server-status'))json={enabled:false,allowed:true};
   else if(p.endsWith('/auth/me'))json={authenticated:true,user:{id:'portrait-test',nickname:'Portrait',role:paintCheck?'ADMIN':'USER',currencyBalance:0}};
   else if(p.endsWith('/minion-a/cards'))json={definitions:[]};
   else if(p.endsWith('/cards'))json={cards};
   else if(p.endsWith('/champions'))json={champions};
   else if(p.endsWith('/card-frames'))json={frames:[]};
   else if(p.endsWith('/decks'))json={decks:[deck]};
   else if(p.endsWith('/ai-decks'))json={decks:[ai],extraCards:[],extraChampions:[]};
   else if(p.endsWith('/main-content'))json=shell['main-content'];
   else if(p.endsWith('/game-media'))json={backgrounds:[],bgms:[]};
   else if(p.endsWith('/ai-match-start')){
    const body=r.request().postDataJSON();
    json={state:startGame(createInitialGameState([self.id,opp.id],definitions,cs,[ids,ids],{gameId:body.matchId,randomSeed:19}),()=>.5),difficulty:'NORMAL',intro:{playerOneLine:self.introLineOne,playerTwoLine:opp.introLineOne,firstSpeaker:'PLAYER_ONE'}};
   }
   return r.fulfill({json});
  });
  await page.goto('http://127.0.0.1:5186/ai-match');
  try {await page.getByRole('button',{name:/매치 시작/}).click({timeout:15000});} catch(e) {console.error((await page.locator('body').innerText()).slice(0,2000),errors);throw e;}
  await page.getByTestId('match-intro-overlay').waitFor({timeout:25000});
  await page.waitForFunction(()=>['self','opponent'].every(side=>document.querySelector(`[data-testid=img-champion-portrait-${side}]`)?.naturalWidth>0));
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.getByTestId('img-champion-portrait-self').getAttribute('src'),self.imageUrl);
  assert.equal(await page.getByTestId('img-champion-portrait-opponent').getAttribute('src'),opp.imageUrl);
  if(paintCheck){
   for(const elapsed of [1200,2100,3100]){
    await page.evaluate(t=>{window.__introPaintTime=t;},elapsed);await page.waitForTimeout(100);
    const samples=await page.evaluate(()=>['self','opponent'].map(side=>{
     const image=document.querySelector(`[data-testid=img-champion-portrait-${side}]`),rect=image.getBoundingClientRect();
     const chain=[];for(let e=image;e;e=e.parentElement){const s=getComputedStyle(e);chain.push({transform:s.transform,perspective:s.perspective,filter:s.filter,clip:s.clipPath,blend:s.mixBlendMode,opacity:s.opacity});if(e.dataset.testid==='match-intro-overlay')break;}
     return {side,src:image.getAttribute('src'),natural:[image.naturalWidth,image.naturalHeight],rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},chain};
    }));
    for(const sample of samples)for(const layer of sample.chain){
     assert.equal(layer.transform,'none','portrait ancestor must paint without texture transforms');
     assert.equal(layer.perspective,'none');assert.equal(layer.filter,'none');assert.equal(layer.clip,'none');assert.equal(layer.blend,'normal');assert.equal(layer.opacity,'1');
    }
    if(elapsed===1200||(width===390&&elapsed===3100)){
     const screenshot=`${out}/paint-${width}-${elapsed}.png`;await page.screenshot({path:screenshot});
     for(const sample of samples)paintSamples.push({...sample,width,height,elapsed,screenshot,source:'/tmp/ko-board-image-cache/'+createHash('sha256').update(sample.src).digest('hex')});
    }
   }
  }
  await page.getByTestId('button-skip-match-intro').waitFor();
  if(!paintCheck)await page.screenshot({path:`${out}/actual-ai-intro-${width}.png`});
  await page.getByTestId('button-skip-match-intro').click();
  if(paintCheck)await page.evaluate(()=>{window.__introPaintTime=5000;});
  await page.locator('.ko-mulligan-sheet').waitFor({timeout:8000});
  assert.deepEqual(errors,[]);results.push({width,height,actualHomeEntry:true,bothOriginalsDecoded:true,skipToMulligan:true});await page.close();
 }
 await writeFile(out+'/paint-samples.json',JSON.stringify(paintSamples,null,2));
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
