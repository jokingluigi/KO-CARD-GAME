import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const out='qa-results/vfx-discard';await mkdir(out,{recursive:true});const browser=await chromium.launch(),results=[];
try{for(const touch of [false,true]){
 const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1440,height:900},isMobile:touch,hasTouch:touch,deviceScaleFactor:touch?3:1}),page=await context.newPage(),errors=[],effectRequests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/vendor\/(pixelfx|effekseer)\/|\/vendor\/kenney\/particle\//.test(r.url()))effectRequests.push(r.url());});
 await page.addInitScript(()=>{sessionStorage.setItem('ko-dev-black-gold-board','1');localStorage.setItem('ko-controls-hint-v1','done');});
 await page.route('**/api/**',r=>r.fulfill({json:{authenticated:true,user:{id:'local-qa',role:'ADMIN',nickname:'QA'},cards:[],champions:[],frames:[],bgms:[],backgrounds:[],tracks:[],favorites:[]}}));
 await page.goto('http://127.0.0.1:5186/settings');await page.getByText('전투 연출',{exact:true}).waitFor();assert.equal(await page.getByText('PIXELFX 효과 미리보기').count(),0);await page.screenshot({path:out+'/'+(touch?'touch':'desktop')+'-settings.png'});
 await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await page.getByTestId('state-json').waitFor();
 await page.evaluate(async()=>{const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');const s=boardFixture();for(const p of s.players){p.championAbilityUsedThisTurn=true;for(const c of p.board.filter(Boolean)){c.baseAttack=c.currentAttack=5;c.baseHealth=c.maxHealth=c.currentHealth=50;c.keywords=[];c.abilities=[];c.enteredThisTurn=false;c.attacksUsedThisTurn=0;}}window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));});
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="state-json"]').textContent).players[1].board[0].currentHealth===50);
 await page.locator('[data-card-instance-id="player-1-field-0"]').click();await page.locator('[data-card-instance-id="player-2-field-0"]').click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="state-json"]').textContent).events.some(e=>e.type==='ATTACK_DECLARED'));
 await page.waitForFunction(()=>document.querySelector('[data-testid="preview-busy"]').textContent==='false');
 const state=await page.getByTestId('state-json').evaluate(n=>JSON.parse(n.textContent));assert.ok(state.events.some(e=>e.type==='DAMAGE_DEALT'&&(e.amount??0)>0));
 const retired='[data-pixelfx],[data-original-vfx],[data-external-vfx],[data-pixelfx-host],[data-screen-impact],.ko-effect-wave,.ko-resource-flight,.ko-turn-handoff,.ko-sprite-awakening-echo';assert.equal(await page.locator(retired).count(),0);assert.deepEqual(effectRequests,[]);assert.deepEqual(errors,[]);await page.screenshot({path:out+'/'+(touch?'touch':'desktop')+'-battle.png'});results.push({touch,settingsLoads:true,battleLoads:true,attackResolves:true,inputReleased:true,retiredLayers:0,effectRequests:0,scriptErrors:0});await context.close();
}await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
