import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const output='qa-results/pixelfx';await mkdir(output,{recursive:true});
const browser=await chromium.launch();const results=[];
try {
 for(const viewport of [{width:390,height:844},{width:1440,height:900}]) {
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',route=>route.fulfill({json:{cards:[],champions:[],frames:[],cosmetics:[]}}));
  await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');
  await page.addScriptTag({type:'module',content:'import "/qa/pixelfx-driver.tsx";'});
  await page.waitForFunction(()=>window.pixelFxQA);
  await page.waitForFunction(()=>Array.from(document.images).filter(i=>i.src.includes('/vendor/pixelfx/')).every(i=>i.complete));
  for(const [kind,id,strength] of [['IMPACT','impact',3],['IMPACT','critical',12],['ARMOR','guard',3],['HEAL','heal',3]]) {
   await page.evaluate(({kind,strength})=>window.pixelFxQA.preview(kind,strength,1100),{kind,strength});
   const canvas=page.locator('[data-pixelfx="'+id+'"]');await canvas.waitFor();
   await page.waitForFunction(id=>{const c=document.querySelector('[data-pixelfx="'+id+'"]');return c&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);},id);
   await page.waitForTimeout(id==='heal'?220:45);
   await page.screenshot({path:`${output}/${id}-${viewport.width}.png`});
   assert.equal(await canvas.evaluate(c=>getComputedStyle(c).pointerEvents),'none');
   await page.waitForTimeout(1200);
   assert.equal(await canvas.evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)),false);
  }
  await page.evaluate(()=>{window.pixelFxQA.clear();window.pixelFxQA.reset();});await page.waitForTimeout(200);
  await page.locator('.ko-player-board-row .ko-board-slot').first().click();await page.locator('.ko-opponent-board-row .ko-board-slot').first().click();
  await page.locator('[data-pixelfx="impact"]').first().waitFor();await page.waitForTimeout(1200);
  await page.evaluate(()=>window.pixelFxQA.reset(50));await page.waitForTimeout(200);
  await page.locator('.ko-player-board-row .ko-board-slot').first().click();await page.locator('.ko-opponent-board-row .ko-board-slot').first().click();
  await page.locator('[data-external-vfx="BLOCK"][data-pixelfx="guard"]').first().waitFor();await page.waitForTimeout(1200);
  await page.evaluate(()=>window.pixelFxQA.prepareHeal());await page.waitForTimeout(500);
  await page.evaluate(()=>window.pixelFxQA.heal());
  await page.waitForFunction(()=>document.querySelector('[data-external-vfx="HEAL"][data-pixelfx="heal"]'));
  assert.equal(await page.evaluate(()=>window.pixelFxQA.inspect().players[0].board[0].currentHealth),23);
  await page.waitForTimeout(1000);
  await page.evaluate(async()=>{const p=await import('/src/components/combat-preferences.ts');p.saveCombatPreferences({...p.readCombatPreferences(),flash:0});window.pixelFxQA.preview('IMPACT');});
  await page.waitForFunction(()=>document.querySelector('[data-external-vfx="IMPACT"]:not([data-pixelfx])'));
  await page.evaluate(async()=>{const p=await import('/src/components/combat-preferences.ts');p.saveCombatPreferences({...p.readCombatPreferences(),flash:1});});
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.pixelFxQA.preview('IMPACT',8));await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-pixelfx]').evaluateAll(nodes=>nodes.some(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0))),false);
  assert.deepEqual(errors,[]);results.push({...viewport,pixelAtlases:4,actualCombat:true,actualBlock:true,actualHealing:true,flashDisabledFallback:true,reducedMotion:true,cleanup:true,physicalDevice:'NOT_RUN'});
  await context.close();
 }
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{cards:[],champions:[],frames:[]}}));
 await page.route('**/vendor/pixelfx/*.png',r=>r.abort());
 await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');
 await page.addScriptTag({type:'module',content:'import "/qa/pixelfx-driver.tsx";'});await page.waitForFunction(()=>window.pixelFxQA);
 await page.evaluate(()=>window.pixelFxQA.preview('IMPACT'));
 await page.waitForFunction(()=>document.querySelector('[data-external-vfx="IMPACT"]:not([data-pixelfx])'));
 assert.deepEqual(errors,[]);results.push({missingAtlasFallback:true});await context.close();
 await writeFile(output+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {await browser.close();}
