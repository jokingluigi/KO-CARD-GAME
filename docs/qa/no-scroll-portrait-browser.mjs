import assert from 'node:assert/strict';
import {chromium} from './black-gold-playwright.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qa-results/no-scroll-portrait';
await mkdir(out,{recursive:true});
const browser=await chromium.launch();
const rows=[];
try {
  const page=await browser.newPage({hasTouch:true,reducedMotion:'reduce'});
  await page.route('**/api/**',route=>route.fulfill({json:{cards:[],frames:[]}}));
  await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');
  await page.locator('.ko-game-shell').waitFor();
  await page.locator('[data-preview-tools]').evaluate(node=>node.style.display='none');
  for(const [width,height] of [[393,760],[360,640],[360,740],[375,812],[390,844],[412,915],[844,390],[1440,900],[393,760]]) {
    await page.setViewportSize({width,height});
    await page.waitForTimeout(120);
    const measure=await page.evaluate(()=>{
      const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
      const root=document.querySelector('.ko-game-shell');
      return {own:box('.ko-player-champion'),enemy:box('.ko-opponent-champion'),art:box('.ko-player-champion .ko-portrait-window'),field:box('.ko-player-board-row .ko-board-slot'),hand:box('.ko-hand-card'),controls:box('.ko-game-controls'),rootScroll:root.scrollHeight,documentScroll:document.documentElement.scrollHeight,viewport:innerHeight};
    });
    assert.ok(measure.rootScroll<=height+1,`Battle overflow at ${width}x${height}`);
    assert.ok(measure.documentScroll<=height+1,`Page overflow at ${width}x${height}`);
    assert.ok(measure.field.width>=44,`Field touch target below 44px at ${width}x${height}`);
    assert.ok(measure.hand.bottom<=height+1);
    if(width<500 && height>=740) {
      assert.ok(measure.own.height>=207.9);
      assert.ok(measure.enemy.height>=207.9);
      assert.ok(measure.art.height>=175.9);
    }
    rows.push({width,height,...measure});
    await page.screenshot({path:`${out}/${width}x${height}.png`});
  }
  await writeFile(`${out}/results.json`,JSON.stringify(rows,null,2));
  console.log(JSON.stringify(rows,null,2));
} finally {await browser.close();}
