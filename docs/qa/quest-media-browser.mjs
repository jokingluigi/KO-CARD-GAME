import {chromium} from './black-gold-playwright.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const catalog=JSON.parse(await readFile(process.env.KO_QUEST_MEDIA_CHAMPIONS??'docs/qa/snapshots/20261024-admin/champions.json','utf8'));
const records=(catalog.champions??catalog).filter(c=>c.questCompletedPortraitEnabled);
const out=process.env.KO_QUEST_MEDIA_OUTPUT??'qa-results/quest-media';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const results=[];
try {
 for(const [width,height] of [[390,844],[360,740],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.startsWith('/api/storage/')){
    const f=(process.env.KO_QUEST_MEDIA_CACHE??'/tmp/ko-board-image-cache')+'/'+createHash('sha256').update(path).digest('hex');
    try{return await route.fulfill({body:await readFile(f),contentType:await readFile(f+'.type','utf8')});}catch{return route.fulfill({status:404,body:''});}
   }
   return route.fulfill({json:{frames:[],items:[],cards:[]}});
  });
  await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await page.locator('.ko-game-shell').waitFor();
  for(const record of records){
   await page.evaluate(async record=>{
    const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');
    const {championRecordToDefinition}=await import('/src/game/champions/published-champions.ts');
    const {createChampionState}=await import('/src/game/champions/test-champions.ts');
    const {audioManager}=await import('/src/audio/audio-manager.ts');
    const d=championRecordToDefinition(record),s=boardFixture();s.events=[];
    for(const p of s.players){p.champion=createChampionState(d.id,[d]);p.health=20;}
    window.__mediaState=s;audioManager.stopGameAudio();audioManager.setMusicContext('BATTLE');
    audioManager.playMatchBgm('/vendor/impact-mixes/contact-light.wav',30);
    window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));
   },record);
   await page.waitForFunction(url=>[...document.querySelectorAll('.ko-opponent-champion img')].some(i=>i.getAttribute('src')===url&&i.naturalWidth>0),record.imageUrl);
   await page.screenshot({path:`${out}/before-${width}-${record.id}.png`});
   const music=await page.evaluate(async()=>{
    const {questMusic}=await import('/src/components/quest-media.ts');const {audioManager}=await import('/src/audio/audio-manager.ts');
    const s=structuredClone(window.__mediaState);s.players[1].champion.questCompleted=true;
    s.events.push({type:'CHAMPION_QUEST_COMPLETED',playerId:s.players[1].id,championId:s.players[1].champion.id});
    s.latestQuestCompletedChampionId=s.players[1].champion.id;
    window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s}}));
    const music=questMusic(s);if(music)audioManager.playQuestComplete(music.assetUrl,music.volume);
    return music;
   });
   assert.equal(music?.assetUrl,record.questCompleteAudioUrl);
   await page.waitForFunction(url=>[...document.querySelectorAll('.ko-opponent-champion img')].some(i=>i.getAttribute('src')===url&&i.naturalWidth>0),record.questCompletedPortraitUrl);
   await page.waitForTimeout(2100);
   const actual=await page.evaluate(async()=>{const {audioManager}=await import('/src/audio/audio-manager.ts');return {url:audioManager.bgm?.url,paused:audioManager.bgm?.audio.paused,error:audioManager.bgm?.audio.error?.code,playing:audioManager.bgm?.audio.currentTime};});
   assert.equal(actual.url,record.questCompleteAudioUrl);assert.equal(actual.paused,false);assert.ok(actual.playing>0);assert.equal(actual.error,undefined);
   assert.equal(await page.locator('.ko-player-champion img').evaluateAll((es,url)=>es.some(i=>i.getAttribute('src')===url&&i.naturalWidth>0),record.imageUrl),true);
   await page.screenshot({path:`${out}/after-${width}-${record.id}.png`});
   results.push({width,height,champion:record.name,opponentAwakened:true,selfUnchanged:true,musicPlaying:actual.playing});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {await browser.close();}
