import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const output='qa-results/pixelfx-expansion';await mkdir(output,{recursive:true});
const browser=await chromium.launch(),results=[];
try{
 for(const mobile of [false,true]){
  const viewport=mobile?{width:390,height:844}:{width:1440,height:900};
  const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:1}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>route.fulfill({json:{cards:[],champions:[],frames:[],cosmetics:[]}}));
  await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');
  await page.addScriptTag({type:'module',content:'import "/qa/pixelfx-driver.tsx";'});
  await page.waitForFunction(()=>window.pixelFxQA);await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches),mobile);
  const ids=await page.evaluate(()=>window.pixelFxQA.areas()),checked=[];
  for(const area of ids){
   await page.evaluate(area=>{window.dispatchEvent(new Event('resize'));window.pixelFxQA.area(area,1000);},area);
   console.log(JSON.stringify({mobile,area}));
   await page.waitForFunction(area=>Array.from(document.querySelectorAll(`[data-fx-area="${area}"]`)).some(c=>c.width>0&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>10)),area,{timeout:6000});
   const geometry=await page.locator(`[data-fx-area="${area}"]`).first().evaluate(c=>({width:c.width,cssWidth:parseFloat(c.style.width),pointer:getComputedStyle(c).pointerEvents}));
   assert.equal(geometry.pointer,'none');assert.ok(geometry.cssWidth<= (mobile?900:1400));
   checked.push(area);
   if([4,14,26,48,68,84,103,132].includes(area))await page.screenshot({path:`${output}/area-${area}-${mobile?'touch':'desktop'}.png`});
  }
  await page.waitForTimeout(1300);
  assert.equal(await page.locator('[data-pixelfx-layer] canvas').count(),0);
  await page.evaluate(()=>{for(let i=0;i<30;i++)window.pixelFxQA.area(6,1500);});await page.waitForTimeout(100);
  assert.ok(await page.locator('[data-pixelfx-layer] canvas').count()<=12);
  await page.waitForTimeout(1800);
  await page.evaluate(()=>window.pixelFxQA.reset());await page.waitForTimeout(250);
  await page.locator('.ko-player-board-row .ko-board-slot').first().click();await page.locator('.ko-opponent-board-row .ko-board-slot').first().click();
  await page.waitForFunction(()=>document.querySelector('[data-pixelfx="impacts/blunt-hit"]'));await page.waitForTimeout(1200);
  await page.evaluate(()=>window.pixelFxQA.prepareHeal());await page.waitForTimeout(500);await page.evaluate(()=>window.pixelFxQA.heal());
  await page.waitForFunction(()=>document.querySelector('[data-fx-area="48"]'));
  assert.equal(await page.evaluate(()=>window.pixelFxQA.inspect().players[0].board[0].currentHealth),23);
  await page.waitForTimeout(1300);
  await page.evaluate(async()=>{const p=await import('/src/components/combat-preferences.ts');p.saveCombatPreferences({...p.readCombatPreferences(),flash:0});window.pixelFxQA.area(6);});await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-pixelfx-layer] canvas').count(),0);
  await page.evaluate(async()=>{const p=await import('/src/components/combat-preferences.ts');p.saveCombatPreferences({...p.readCombatPreferences(),flash:1});});
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.pixelFxQA.area(68));await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-pixelfx-layer] canvas').count(),0);
  assert.deepEqual(errors,[]);results.push({mobile,viewport,areasWithVisiblePixels:checked,cleanup:true,budget:true,actualAttack:true,actualHealing:true,flashOff:true,reducedMotion:true,physicalDevice:'NOT_RUN'});
  console.log(JSON.stringify({mobile,checked:checked.length}));await context.close();
 }
 await writeFile(output+'/results.json',JSON.stringify(results,null,2));
}finally{await browser.close();}
