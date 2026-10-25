import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const art=process.env.KO_INTRO_ART?await readFile(process.env.KO_INTRO_ART):null;
const browser=await chromium.launch({headless:true});
await mkdir('qa-results/intro-regression',{recursive:true});
try {
 for(const [width,height] of [[390,844],[360,740],[1440,900]]) {
  const page=await browser.newPage({viewport:{width,height}});
  await page.route('**/broken.png',r=>r.fulfill({status:404,body:''}));
  await page.route('**/also-broken.png',r=>r.fulfill({status:404,body:''}));
  await page.route('**/original.svg',r=>r.fulfill({contentType:art?'image/png':'image/svg+xml',body:art??'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"><rect width="100" height="150" fill="gold"/></svg>'}));
  await page.goto('http://127.0.0.1:5186/qa/intro-regression.html');
  await page.waitForTimeout(450);
  await page.screenshot({path:`qa-results/intro-regression/before-${width}.png`});
  await page.evaluate(()=>window.updatePortrait({originalPortraitUrl:'/original.svg'}));
  const self=page.getByTestId('img-champion-portrait-self');
  await self.waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-testid="img-champion-portrait-self"]')?.naturalWidth>0);
  await page.evaluate(()=>window.updatePortrait({portraitUrl:null}));
  await self.waitFor();assert.ok(await self.evaluate(e=>e.naturalWidth>0));
  await page.getByTestId('button-skip-match-intro').waitFor();
  assert.ok(await self.evaluate(e=>getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height>0));
  await page.waitForFunction(()=>document.querySelector('[data-testid="dialogue-self"]')?.dataset.visible === 'true');
  await page.evaluate(()=>window.updatePortrait({portraitUrl:'/broken.png',originalPortraitUrl:'/also-broken.png'}));
  await page.waitForFunction(()=>!document.querySelector('[data-testid="img-champion-portrait-self"]'));
  await page.evaluate(()=>window.updatePortrait({portraitUrl:'/original.svg'}));
  await self.waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-testid="img-champion-portrait-self"]')?.naturalWidth>0);
  await page.screenshot({path:`qa-results/intro-regression/after-${width}.png`});
  await page.getByTestId('button-skip-match-intro').click();
  await page.getByText('mulligan boundary').waitFor();
  await page.context().close();console.log(`${width}x${height}: delayed original, missing skin, skip passed`);
 }
}finally{await browser.close();}
