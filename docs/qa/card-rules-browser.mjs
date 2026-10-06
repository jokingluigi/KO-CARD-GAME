// Node + Playwright; run against Vite /qa/card-rules.html.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const mobile of [false,true]) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/card-frames',r=>r.fulfill({json:{frames:[]}}));
  await page.goto((process.env.KO_QA_ORIGIN??'http://localhost:5173')+'/qa/card-rules.html');
  const dialog=page.locator('[data-card-rules-dialog]');
  const activate=async locator=>mobile?locator.tap():locator.click();
  for(const [label,title,expected] of [['아머','아머','피해를 2'],['정보 확인 선수','정보 확인 선수','도발'],['카운트다운','카운트다운','카운트다운: 3']]) {
   await activate(page.getByTestId('direct').getByRole('button',{name:`${label} 정보 보기`}));
   await dialog.waitFor();assert.match(await dialog.innerText(),new RegExp(expected));
   await page.waitForFunction(()=>{const r=document.querySelector('[data-card-rules-dialog]')?.getBoundingClientRect();return r&&r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
   await activate(dialog.getByRole('button',{name:'닫기',exact:true}));
   await dialog.waitFor({state:'detached'});
  }
  await activate(page.getByTestId('card').getByRole('button',{name:'아머 정보 보기'}));
  await dialog.waitFor();await activate(dialog.getByRole('button',{name:'닫기',exact:true}));await dialog.waitFor({state:'detached'});
  assert.equal(await page.getByTestId('actions').innerText(),'0','description clicks must not play/select the card');
  await activate(page.getByTestId('card').getByRole('button',{name:'아머 정보 보기'}));await dialog.waitFor();
  if(mobile) await page.touchscreen.tap(2,2);else await page.mouse.click(2,2);
  await dialog.waitFor({state:'detached'});
  assert.equal(await page.getByTestId('actions').innerText(),'0','backdrop dismissal must not play/select the card');
  if(mobile) {
   await page.getByTestId('direct').getByRole('button',{name:'아머 정보 보기'}).dispatchEvent('pointerdown',{pointerType:'touch',clientX:30,clientY:70});
   await dialog.waitFor();await dialog.getByRole('button',{name:'닫기',exact:true}).tap();await dialog.waitFor({state:'detached'});
  }
  if(!mobile) {
   const keyword=page.getByTestId('direct').getByRole('button',{name:'아머 정보 보기'});
   for(const key of ['Enter','Space']) {
    await keyword.focus();await keyword.press(key);await dialog.waitFor();
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='아머 정보 보기');
   }
   await page.getByTestId('inspect').hover();
   await page.getByTestId('inspector-rules').getByRole('button',{name:'아머 정보 보기'}).click();
   await dialog.waitFor();await dialog.hover();await page.waitForTimeout(300);
   assert.equal(await dialog.count(),1,'mouse leave must not unmount explanation');
   await dialog.getByRole('button',{name:'닫기',exact:true}).click();await dialog.waitFor({state:'detached'});
   await page.getByTestId('inspector-rules').hover();
   await page.mouse.move(1200,750);await page.waitForTimeout(300);
  }
  await activate(page.getByTestId('details'));
  const outer=page.getByRole('dialog',{name:'상세 검사',exact:true});await outer.waitFor();
  await activate(outer.getByRole('button',{name:'정보 확인 선수 정보 보기'}).last());
  await dialog.waitFor();await activate(dialog.getByRole('button',{name:'닫기',exact:true}));await dialog.waitFor({state:'detached'});
  assert.equal(await outer.count(),1,'nested explanation must keep parent card detail open');
  await page.waitForFunction(()=>!document.querySelector('[data-state="closed"]'));
  if(mobile) await page.touchscreen.tap(2,2);else await page.mouse.click(2,2);
  await outer.waitFor({state:'detached'});
  assert.equal(await page.getByTestId('actions').innerText(),'0');
  assert.deepEqual(errors,[]);
  console.log(`PASS ${mobile?'mobile touch':'desktop mouse + keyboard'}: keyword, reference, card action isolation, nested modal${mobile?'':', inspector mouse leave, Escape and focus restore'}`);
  await context.close();
 }
} finally {await browser.close();}
