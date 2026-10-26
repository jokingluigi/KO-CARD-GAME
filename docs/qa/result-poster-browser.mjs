/** Actual result component with a real lethal engine action, local assets only. */
import {chromium} from './black-gold-playwright.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='qa-results/result-poster';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
try {
 for(const [width,height] of [[360,740],[375,812],[390,844],[412,915],[768,1024],[1440,900],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:width===375?'reduce':'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname;
   if(path.startsWith('/api/storage/')){try{return await r.fulfill({body:await readFile('/tmp/ko-board-image-cache/'+createHash('sha256').update(path).digest('hex')),contentType:'image/png'});}catch{}}
   return r.fulfill({json:{}});
  });
  await page.goto('http://127.0.0.1:5186/qa/match-result.html');await page.getByTestId('match-result-overlay').waitFor();
  for(const outcome of ['victory','defeat']){
   await page.evaluate(outcome=>window.showResult({outcome,rewardStatus:'success',long:true}),outcome);await page.locator(`[data-result=${outcome}]`).waitFor();await page.waitForTimeout(400);
   const geometry=await page.evaluate(()=>{const sheet=document.querySelector('.ko-result-poster'),cta=document.querySelector('[data-testid=button-return-to-main-menu]'),scroll=document.querySelector('.ko-result-scroll'),box=cta.getBoundingClientRect();return {overflow:sheet.scrollWidth>sheet.clientWidth+1||scroll.scrollWidth>scroll.clientWidth+1,cta:{x:box.x,y:box.y,right:box.right,bottom:box.bottom,width:box.width,height:box.height},text:sheet.textContent};});
   assert.equal(geometry.overflow,false);assert.ok(geometry.cta.x>=0&&geometry.cta.y>=0&&geometry.cta.right<=width&&geometry.cta.bottom<=height&&geometry.cta.height>=44);
   assert.ok(!geometry.text.includes('RESULT MUST NOT SPEAK'));
   await page.getByRole('region',{name:'경기 MVP'}).getByText('리버덩크',{exact:true}).waitFor();
   assert.equal(await page.locator('.ko-result-reward strong').textContent(),'+200크레딧');
   await page.screenshot({path:`${out}/${outcome}-${width}.png`});
   const highlights=page.getByRole('group',{name:'경기 하이라이트'});await highlights.locator('summary').click();await highlights.getByText(/결정타/).waitFor();
   const button=page.getByTestId('button-return-to-main-menu');await button.click();
   const calls=JSON.parse(await page.getByTestId('result-callbacks').textContent());assert.ok(calls.returns>0);
   results.push({width,height,outcome,realMvp:true,noOverflow:true,stickyAction:true,reward:true,highlights:true,noDuplicateDialogue:true});
  }
  if(width===390){
   await page.evaluate(()=>window.showResult({outcome:'victory',rewardStatus:'pending'}));await page.getByRole('status').filter({hasText:'확인하는 중'}).waitFor();assert.equal(await page.locator('.ko-result-reward strong').count(),0);
   await page.evaluate(()=>window.showResult({outcome:'defeat',rewardStatus:'error',questError:'저장 실패',continueLabel:'타워 보상으로'}));
   await page.getByTestId('quest-progress-error').getByRole('button').click();await page.getByRole('button',{name:'다시 시도',exact:true}).click();
   const counts=JSON.parse(await page.getByTestId('result-callbacks').textContent());assert.equal(counts.quests,1);assert.equal(counts.rewards,1);await page.getByRole('button',{name:'타워 보상으로'}).waitFor();
   await page.screenshot({path:`${out}/error-retry-${width}.png`});
   await page.evaluate(()=>window.showResult({outcome:'complete',empty:true}));await page.locator('[data-result=complete]').waitFor();await page.getByText('MVP를 선정할 선수 기록이 없습니다.').waitFor();
   const root=page.getByTestId('match-result-overlay');await root.focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.getByTestId('button-return-to-main-menu').evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await root.evaluate(e=>e.contains(document.activeElement)),true);
   results.push({pendingNoFakeReward:true,retryCallbacks:true,towerLabel:true,emptyComplete:true,keyboardContained:true});
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
