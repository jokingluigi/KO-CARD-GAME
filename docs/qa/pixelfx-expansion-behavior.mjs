import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const browser=await chromium.launch(),results={};
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{cards:[],champions:[],frames:[],cosmetics:[]}}));
 await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');
 await page.addScriptTag({type:'module',content:'import "/qa/pixelfx-driver.tsx";'});await page.waitForFunction(()=>window.pixelFxQA);
 await page.waitForTimeout(1500);
 // Initial snapshots and identical snapshots must not replay effects.
 assert.equal(await page.locator('[data-pixelfx-layer] canvas').count(),0);
 await page.evaluate(()=>window.pixelFxQA.snapshot(structuredClone(window.pixelFxQA.inspect())));await page.waitForTimeout(150);
 assert.equal(await page.locator('[data-pixelfx-layer] canvas').count(),0);results.noInitialOrIdenticalReplay=true;
 for(const [field,value,area] of [['isStunned',true,19],['countdownRemaining',2,127],['capturedCards',[{}],121],['capturedCards',[],122]]){
  await page.evaluate(({field,value})=>{const next=structuredClone(window.pixelFxQA.inspect());next.players[0].board[0][field]=value;window.pixelFxQA.snapshot(next);},{field,value});
  await page.waitForFunction(area=>document.querySelector(`[data-fx-area="${area}"]`),area);await page.waitForTimeout(1100);
 }results.statusCountdownCaptureRelease=true;
 await page.evaluate(()=>window.pixelFxQA.pack());await page.locator('[data-testid="button-unseal-pack"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-fx-area="81"]'));
 for(const [index,area]of [[0,82],[1,83],[2,84]]){
  await page.locator(`[data-testid="button-reveal-reward-${index}"]`).click();
  await page.waitForFunction(area=>document.querySelector(`[data-fx-area="${area}"]`),area);
  await page.waitForTimeout(200);await page.screenshot({path:`qa-results/pixelfx-expansion/pack-${area}.png`});
  await page.waitForTimeout(1700);
 }results.packSealAndThreeRarities=true;
 await page.evaluate(()=>window.pixelFxQA.clear());await page.waitForTimeout(1500);await page.evaluate(()=>window.pixelFxQA.craft());
 await page.waitForFunction(()=>document.querySelector('[data-fx-area="88"]'));await page.waitForTimeout(200);await page.screenshot({path:'qa-results/pixelfx-expansion/craft.png'});
 await page.waitForTimeout(1800);results.crafting=true;
 // Network failures retain the established non-PixelFX fallback.
 await page.route('**/vendor/pixelfx/**/*.png',r=>r.abort());
 await page.evaluate(()=>window.pixelFxQA.preview('DESTROY'));
 await page.waitForFunction(()=>document.querySelector('[data-external-vfx="DESTROY"]:not([data-pixelfx])'));results.failedAssetFallback=true;
 assert.deepEqual(errors,[]);await context.close();
 const touch=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:3}),p=await touch.newPage();
 await p.route('**/api/**',r=>r.fulfill({json:{cards:[],champions:[],frames:[]}}));await p.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await p.addScriptTag({type:'module',content:'import "/qa/pixelfx-driver.tsx";'});await p.waitForFunction(()=>window.pixelFxQA);
 await p.evaluate(()=>window.pixelFxQA.area(68));await p.waitForFunction(()=>document.querySelector('[data-fx-area="68"]'));await p.waitForTimeout(150);await p.screenshot({path:'qa-results/pixelfx-expansion/landscape.png'});
 assert.equal(await p.locator('[data-pixelfx-layer]').evaluate(n=>getComputedStyle(n).pointerEvents),'none');results.touchLandscape=true;
 await touch.close();await writeFile('qa-results/pixelfx-expansion/behavior.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
