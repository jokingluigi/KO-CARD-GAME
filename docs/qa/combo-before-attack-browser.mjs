import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {chromium} from './black-gold-playwright.mjs';
const out='qa-results/combo-before-attack';await mkdir(out,{recursive:true});const browser=await chromium.launch(),results=[];
try{for(const [width,height]of [[390,844],[740,360],[1440,900]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{cards:[],frames:[]}}));await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await page.locator('.ko-game-shell').waitFor();await page.locator('[data-preview-tools]').evaluate(n=>n.style.display='none');
 for(const mode of ['unit','champion','health']){
  await page.evaluate(async mode=>{const {boardFixture,definitions}=await import('/qa/black-gold-fixture.ts');const s=boardFixture();s.gameId='combo-'+crypto.randomUUID();s.events=[];s.players[0].champion.quest=null;s.players[1].champion.quest=null;
   const a=s.players[0].board[0];Object.assign(a,{currentAttack:2,currentHealth:mode==='health'?1:5,maxHealth:5,abilities:[],keywords:[],isSilenced:false,isAbilityDisabled:false,enteredThisTurn:false,attacksUsedThisTurn:0});
   const listener=s.players[0].board[1];listener.abilities=[{trigger:'OTHER_ALLY_ATTACK',effects:[{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'LAST_ATTACKER',count:1},values:mode==='health'?{attack:0,health:3}:{attack:3,health:0}}]}];listener.keywords=[];listener.isSilenced=false;listener.isAbilityDisabled=false;
   s.players[0].board=[a,listener,null,null];const d=s.players[1].board[0];Object.assign(d,{currentAttack:mode==='health'?3:1,currentHealth:12,maxHealth:12,abilities:[],keywords:[],isSilenced:false,isAbilityDisabled:false});s.players[1].board=mode==='champion'?[null,null,null,null]:[d,null,null,null];s.players[1].health=20;s.players[1].champion.health=20;
   window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions}}));},mode);await page.waitForTimeout(100);
  const before=await page.getByTestId('state-json').textContent().then(JSON.parse);assert.equal(before.players[0].board[0].currentAttack,2);
  const source=page.locator('.ko-player-board-row .ko-board-slot').first(),r=await source.boundingBox();await source.click({position:{x:18,y:r.height-14}});
  if(mode==='champion')await page.locator('.ko-opponent-champion').click({position:{x:70,y:45}});else await page.locator('.ko-opponent-board-row .ko-board-slot').first().click({position:{x:18,y:45}});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid=state-json]').textContent).events.some(e=>e.type==='DAMAGE_DEALT'));await page.waitForFunction(()=>document.querySelector('[data-testid=preview-busy]').textContent==='false');
  const after=await page.getByTestId('state-json').textContent().then(JSON.parse);const attacker=after.players[0].board[0];assert.ok(attacker);assert.equal(attacker.attacksUsedThisTurn,1);
  if(mode==='health'){assert.equal(attacker.currentHealth,1);assert.equal(attacker.maxHealth,8);}else{assert.equal(attacker.currentAttack,5);assert.equal(mode==='champion'?after.players[1].health:after.players[1].board[0].currentHealth,mode==='champion'?15:7);}
  const changed=after.events.findIndex(e=>e.type==='STAT_CHANGED'&&e.cardInstanceId===attacker.instanceId),hit=after.events.findIndex(e=>e.type==='DAMAGE_DEALT');assert.ok(changed>=0&&changed<hit);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1||document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`${out}/${mode}-${width}.png`});results.push({width,height,mode,preDamageCombo:true,oneAttackUse:true,noScroll:true});
 }assert.deepEqual(errors,[]);await page.close();
}await writeFile(out+'/browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
