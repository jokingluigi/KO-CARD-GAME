import assert from 'node:assert/strict';
import {chromium} from './black-gold-playwright.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qa-results/premium-ui-final';await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true}),results=[],errors=[];
try{for(const [width,height]of[[360,740],[375,812],[390,844],[412,915],[844,390],[1440,900]]){
 const p=await b.newPage({viewport:{width,height},reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.fulfill({json:{cards:[],champions:[],frames:[]}}));
 await p.goto('http://127.0.0.1:5186/qa/champion-features.html');await p.getByTestId('board-check').waitFor();await p.evaluate(()=>document.fonts.ready);await p.getByTestId('board-check').evaluate(e=>e.parentElement.style.display='none');
 const settings=p.getByRole('button',{name:'설정 열기',exact:true}),log=p.getByTestId('button-battle-match-history');
 const geometry=e=>{const r=e.getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height};};const before=await settings.evaluate(geometry);await settings.focus();await p.keyboard.press('Tab');assert.equal(await log.evaluate(e=>e===document.activeElement),true);
 assert.equal(await log.evaluate(e=>getComputedStyle(e).outlineWidth),'2px');
 await settings.click();assert.equal(await settings.getAttribute('aria-expanded'),'true');await p.getByRole('button',{name:'설정 닫기',exact:true}).click();assert.equal(await settings.getAttribute('aria-expanded'),'false');
 const after=await settings.evaluate(geometry);assert.deepEqual(after,before);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 for(const control of await p.locator('.ko-game-controls button').all()){if(await control.isVisible()){const box=await control.boundingBox();assert.ok(box.width>=44&&box.height>=44);}}
 await p.screenshot({path:`${out}/battle-${width}.png`,fullPage:true});results.push({width,height,keyboardFocus:true,settingsToggle:true,stableGeometry:true,overflow:false});await p.close();
}assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({results,errors,physicalPhone:'NOT_RUN'},null,2));console.log(JSON.stringify(results));}finally{await b.close();}
