import assert from 'node:assert/strict';
import {chromium} from './black-gold-playwright.mjs';
const browser=await chromium.launch();
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{authenticated:false,user:null}}));
 await page.goto((process.env.KO_FX_BASE??'http://127.0.0.1:5186')+'/settings?v='+Date.now());
 await page.getByLabel('미리볼 효과').waitFor();assert.equal(await page.getByLabel('미리볼 효과').locator('option').count(),140);
 // Preview remains positioned and noninteractive even if battle CSS has not loaded.
 await page.getByLabel('미리볼 효과').selectOption('68');await page.getByRole('button',{name:'재생',exact:true}).click();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-fx-area="68"]')).some(c=>{if(!c.isConnected||!c.width)return false;const css=getComputedStyle(c);const visible=c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);if(visible)window.__fxStyles={position:css.position,pointer:css.pointerEvents};return visible;}));
 const styles=await page.evaluate(()=>window.__fxStyles);
 assert.deepEqual(styles,{position:'fixed',pointer:'none'});await page.screenshot({path:'qa-results/pixelfx-expansion/settings-touch.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({previewOptions:140,touch:true,visiblePixels:true,independentOverlay:true}));await context.close();
}finally{await browser.close();}
