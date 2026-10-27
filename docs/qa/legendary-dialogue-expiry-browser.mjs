/** Actual landing -> speech, uninterrupted expiry and expiry while temporarily suppressed. */
import {chromium} from './black-gold-playwright.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='qa-results/legendary-dialogue-expiry';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
try{for(const [width,height,reduced] of JSON.parse(process.env.KO_EXPIRY_SIZES??'[[360,740,false],[375,812,false],[390,844,false],[412,915,false],[1440,900,false],[844,390,false],[390,844,true]]')){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async r=>{try{return await r.fulfill({body:await readFile('/tmp/ko-board-image-cache/'+createHash('sha256').update(new URL(r.request().url()).pathname).digest('hex')),contentType:'image/png'});}catch{return r.fulfill({json:{cards:[],champions:[],frames:[]}})}});
 await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await page.locator('.ko-game-shell').waitFor();await page.getByRole('button',{name:'기존 / 블랙·골드',exact:true}).evaluate(n=>n.parentElement.style.display='none');
 async function summon(){await page.evaluate(async()=>{const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');const {generateCardInstance}=await import('/src/game/index.ts');const s=boardFixture();s.gameId='expiry-'+crypto.randomUUID();s.events=[];s.cardPool=definitions;s.players.forEach(p=>{p.hand=[];p.board=[null,null,null,null];p.currentGold=10;p.champion.quest=null});s.players[0].hand=[generateCardInstance(definitions.find(d=>d.name==='퀘스쳔'),{instanceId:'expiry-legend'})];window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));});await page.waitForTimeout(100);await page.locator('.ko-player-hand .ko-hand-card').click();await page.locator('.ko-player-board-row .ko-board-slot').first().click();await page.locator('[data-legendary-spotlight]').waitFor();}
 const panel=page.locator('[data-legendary-spotlight]');
 // Suppression unmounts only presentation, not the queued event. Its deadline must survive.
 await summon();await page.waitForTimeout(350);await page.getByRole('button',{name:'설정 열기',exact:true}).dispatchEvent('click');await page.getByRole('dialog',{name:'게임 설정',exact:true}).waitFor();assert.equal(await panel.count(),0);
 await page.waitForTimeout(3100);await page.getByRole('button',{name:'설정 닫기',exact:true}).dispatchEvent('click');await page.waitForTimeout(100);assert.equal(await panel.count(),0,'expired dialogue must not return after settings close');
 if(process.env.KO_EXPIRY_REPRO){results.push({reproduction:'fixed'});await page.close();continue;}
 await summon();await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('[data-legendary-spotlight]')).opacity)>.99);
 const metrics=await panel.evaluate(n=>{const r=n.getBoundingClientRect(),l=n.querySelector('.ko-legendary-spotlight__line');return {top:r.top,bottom:r.bottom,right:r.right,left:r.left,quoteFits:l.scrollHeight<=l.clientHeight+1,position:getComputedStyle(n).position};});assert.equal(metrics.position,'fixed');assert.ok(metrics.top<height*.35&&metrics.top>=0,JSON.stringify(metrics));assert.ok(metrics.right<=width&&metrics.left>=0,JSON.stringify(metrics));assert.ok(metrics.quoteFits,JSON.stringify(metrics));
 await panel.locator('img').evaluate(n=>n.decode());await page.screenshot({path:`${out}/top-${width}-${reduced}.png`});
 const state=await page.getByTestId('state-json').textContent();await panel.waitFor({state:'detached',timeout:3100});assert.equal(await page.getByTestId('state-json').textContent(),state);
 await page.evaluate(()=>{const state=JSON.parse(document.querySelector('[data-testid=state-json]').textContent);window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state}}));});await page.waitForTimeout(100);assert.equal(await panel.count(),0);
 assert.deepEqual(errors,[]);results.push({width,height,reduced,topOverlay:true,fullQuote:true,automaticExpiry:true,hiddenExpiryNoReplay:true,noStateMutation:true});await page.close();
}await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
