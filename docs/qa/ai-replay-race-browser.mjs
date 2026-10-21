/** Local real Home → AI scheduler → result transcript → server replay. No production writes. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
await import('./checkpoints/20261006/qa-loader.mjs');
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? 'playwright');
const { createInitialGameState, startGame } = await import('../../lib/game-engine/src/index.ts');
const { generateCardInstance } = await import('../../artifacts/ko-game/src/game/cards/generation.ts');
// Replay is pure; imported service dependencies must never select a real DB.
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
const { replayAIMatch } = await import('../../artifacts/api-server/src/lib/ai-match-quest-service.ts');
const origin = process.env.KO_QA_ORIGIN ?? 'http://127.0.0.1:5186';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const data = JSON.parse(readFileSync(new URL('../../artifacts/ko-game/qa/art-direction-data.json', import.meta.url), 'utf8'));
const cards = data.cards.cards.filter(c => !c.isToken && !c.isChampionToken);
const selected = cards.flatMap(c => Array(c.rarity === 'NORMAL' ? 3 : c.rarity === 'EPIC' ? 2 : 1).fill(c)).slice(0,25);
const champion = data.champions.champions[0];
const deck = {id:'race-deck', name:'Replay race',championDefinitionId:champion.id,cardDefinitionIds:selected.map(c=>c.id),cards:selected,champion,isValid:true};
const ai = {...deck,id:'race-ai',enabled:true,displayOrder:0,difficulty:'NORMAL'};
const token = {id:'race-token',name:'Replay Rush',cost:0,attack:2,health:2,rulesText:'',keywords:['RUSH'],abilities:[],isToken:false,isChampionToken:false};
const summoner = {...token,id:'race-summoner',name:'Replay Summoner',attack:0,keywords:[],abilities:[{trigger:'ENTER_FIELD',effects:[{type:'STRUCTURED',action:'SUMMON',target:{zone:'BOARD',owner:'SELF',selection:'RANDOM',count:1,filter:{excludeSource:true}}}]}]};
const browser = await chromium.launch({headless:true});
try {
 for (const mode of ['emote', 'timeout', 'surrender']) {
  const ctx = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page = await ctx.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(()=>localStorage.setItem('ko-match-coach-v1','done'));
  let initial,submitted,validated;
  await page.route('**/*',async route=>{
   const url = new URL(route.request().url());
   if (!['localhost','127.0.0.1'].includes(url.hostname)) return route.abort();
   const path=url.pathname;if(!path.startsWith('/api/'))return route.continue();
   let json={};
   if(path.includes('/storage/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
   if(path.endsWith('/server-status'))json={enabled:false,allowed:true};
   else if(path.endsWith('/auth/me'))json={authenticated:true,user:{id:'race-user',nickname:'Replay',role:'USER',currencyBalance:100}};
   else if(path.endsWith('/minion-a/cards'))json={definitions:[]};
   else if(path.endsWith('/cards'))json=data.cards;
   else if(path.endsWith('/champions'))json=data.champions;
   else if(path.endsWith('/card-frames'))json=data['card-frames'];
   else if(path.endsWith('/decks'))json={decks:[deck]};
   else if(path.endsWith('/ai-decks'))json={decks:[ai],extraCards:[],extraChampions:[]};
   else if(path.endsWith('/game-media'))json={backgrounds:[],bgms:[]};
   else if(path.endsWith('/main-content'))json=data['main-content'];
   else if(path.endsWith('/ai-match-start')){
    const body=route.request().postDataJSON();
    initial=startGame(createInitialGameState(undefined,undefined,undefined,undefined,{gameId:body.matchId,randomSeed:19}),()=>0.5);
    initial.activePlayerId='player-2'; initial.cardPool=[summoner,token];
    for(const p of initial.players){p.mulliganUsed=true;p.board=[null,null,null,null];p.deck=[];p.hand=[];p.personalTurn=3;p.currentGold=0;p.health=100;p.maxHealth=100;}
    initial.players[1].hand=[generateCardInstance(summoner,{instanceId:'race-source'})];
    json={state:initial,difficulty:'NORMAL'};
   }else if(path.endsWith('/ai-match-progress')){
    submitted=route.request().postDataJSON();
    validated=replayAIMatch(initial,submitted.actions,'player-1','player-2');
    json={completed:true,reward:{amount:200,sourceType:'MATCH_AI_RESULT'}};
   }
   return route.fulfill({json});
  });
  await page.goto(origin+'/ai-match');
  await page.getByRole('button',{name:/매치 시작/}).click();
  await page.getByRole('button',{name:'설정 열기',exact:true}).waitFor();
  // Intro waits a fixed period. Wait for the actual committed AI greeting.
  await page.waitForFunction(()=>document.body.innerText.includes('내 턴') || document.querySelector('.ko-opponent-champion')!==null);
  await page.getByTestId('match-intro-overlay').waitFor({state:'hidden'});
  if(mode==='emote'){
   // Send while the first AI decision is still waiting, before token generation.
   await page.locator('.ko-player-champion').click();
   const menu=page.getByRole('menu',{name:'챔피언 감정표현'});
   await menu.waitFor();await menu.getByRole('menuitem').first().click();
   await page.waitForTimeout(6500);
  }else if(mode==='timeout'){
   await page.evaluate(()=>{const original=Date.now;let offset=0;Date.now=()=>original()+offset;window.__qaAdvanceClock=()=>{offset+=91000;};});
   await page.evaluate(()=>window.__qaAdvanceClock());
   await page.waitForTimeout(350);
  }
  await page.getByRole('button',{name:'설정 열기',exact:true}).click();
  await page.getByRole('button',{name:'항복',exact:true}).click();
  await page.getByRole('button',{name:'항복하기',exact:true}).click();
  await page.getByTestId('match-result-overlay').waitFor();
  await page.getByText('+200 크레딧 지급').waitFor();
  assert.ok(submitted);assert.equal(validated.status,'FINISHED');
  if(mode==='emote'){
   assert.ok(submitted.actions.some(a=>a.type==='EMOTE'&&a.actor!=='AI'));
   assert.ok(submitted.actions.some(a=>a.type==='ATTACK'&&a.attackerInstanceId.startsWith('race-source:')));
  }
  if(mode==='timeout') assert.ok(submitted.actions.some(a=>a.type==='END_TURN'&&a.actor==='AI'), 'AI timeout must be included in the transcript');
  assert.equal(await page.getByTestId('quest-progress-error').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS actual Home '+mode+' → server replay, actions='+submitted.actions.length);
  await ctx.close();
 }
} finally {await browser.close();}
