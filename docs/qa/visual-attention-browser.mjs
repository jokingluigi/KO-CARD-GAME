import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const out='qa-results/visual-attention';await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[];
try{
 for(const [width,height] of [[360,740],[375,812],[390,844],[412,915],[740,360],[768,1024],[1440,900]]){
  const context=await browser.newContext({viewport:{width,height},recordVideo:width===390?{dir:out,size:{width,height}}:undefined});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{cards:[],frames:[]}}));
  async function open(port){await page.goto(`http://127.0.0.1:${port}/qa/black-gold-board.html`);await page.locator('.ko-game-shell').waitFor();await page.locator('[data-preview-tools]').evaluate(n=>n.style.display='none');
   await page.evaluate(async()=>{const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');const {generateCardInstance}=await import('/src/game/index.ts');const s=boardFixture();s.gameId='attention-'+crypto.randomUUID();s.events=[];const c=definitions.find(c=>c.cardType==='WRESTLER'&&!c.rulesText.trim()&&c.cost>0&&c.cost<=3);s.players[0].hand=[generateCardInstance(c,{instanceId:'paid-card'}),...s.players[0].hand.slice(0,3)];window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));});await page.waitForTimeout(250);
  }
  if(width===390||width===1440){await open(5192);await page.locator('.ko-hand-card').first().click({position:{x:18,y:45}});await page.screenshot({path:`${out}/before-selected-${width}.png`});}
  await open(5186);
  await page.locator('.ko-hand-card').first().click({position:{x:18,y:45}});
  await page.locator('[data-hand-selection=true]').waitFor();
  const contrast=await page.locator('.ko-hand-card').evaluateAll(nodes=>nodes.map(n=>({selected:n.classList.contains('ko-hand-card--selected'),opacity:Number(getComputedStyle(n).opacity)})));
  assert.ok(contrast.find(c=>c.selected).opacity>contrast.find(c=>!c.selected).opacity);
  await page.screenshot({path:`${out}/after-selected-${width}.png`});
  await page.locator('.ko-player-board-row .ko-board-slot').nth(2).click({position:{x:18,y:45}});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=state-json]').textContent).events.some(e=>e.type==='GOLD_CHANGED'&&e.reason==='CARD_COST'));
  // The actual committed engine event drives a local pulse, not a synthetic click cue.
  const pulsed=await page.locator('.ko-player-stats [data-resource=gold]').evaluate(n=>n.getAnimations().length>0);
  assert.ok(pulsed,'actual resource consumption pulses its gold cell');
  await page.screenshot({path:`${out}/paid-${width}.png`});
  await page.waitForFunction(()=>document.querySelector('[data-testid=preview-busy]').textContent==='false');
  const state=await page.getByTestId('state-json').textContent().then(JSON.parse);assert.ok(state.players[0].board.some(c=>c?.instanceId==='paid-card'));assert.ok(!state.players[0].hand.some(c=>c.instanceId==='paid-card'));
  await page.waitForTimeout(1000);assert.equal(await page.locator('.ko-player-stats [data-resource=gold]').evaluate(n=>n.getAnimations().length),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1||document.documentElement.scrollWidth>innerWidth+1),false);
  const attacker=page.locator('.ko-player-board-row .ko-board-slot').first();const box=await attacker.boundingBox();await attacker.click({position:{x:18,y:box.height-14}});
  const target=await page.locator('.ko-opponent-board-row .ko-board-slot').first().boundingBox();await page.mouse.move(target.x+target.width/2,target.y+target.height/2);
  await page.waitForFunction(()=>document.querySelector('.ko-attack-aim circle')?.style.opacity==='1');
  assert.ok(Math.abs(Number(await page.locator('.ko-attack-aim circle').getAttribute('cx'))-(target.x+target.width/2))<1);
  await page.screenshot({path:`${out}/target-${width}.png`});await page.keyboard.press('Escape');assert.equal(await page.locator('.ko-attack-aim').count(),0);
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'설정 열기'}).click();await page.getByLabel('카메라 줌',{exact:true}).selectOption('0');await page.getByRole('button',{name:'설정 닫기'}).click();
  assert.deepEqual(errors,[]);results.push({width,height,selectionContrast:true,realEnginePlay:true,goldPulse:true,aimContact:true,settled:true,noScroll:true,errors});
  const video=page.video();await context.close();if(video)await video.saveAs(`${out}/actual-local-battle-390.webm`);
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
