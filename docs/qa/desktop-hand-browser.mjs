import assert from 'node:assert/strict';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch({headless:true,...(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{}:{channel:'chrome'})});
const results=[],errors=[];
try {
  for(const [width,height] of [[1440,900],[1366,768],[1280,720],[1024,600]]) {
    const page=await browser.newPage({viewport:{width,height}});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.KO_QA_ORIGIN??'http://127.0.0.1:5173')+'/qa/champion-features.html');
    await page.getByTestId('board-check').waitFor();
    for(const count of [1,6,10]) {
      await page.evaluate(async count=>{
        const {createInitialGameState,generateCardInstance}=await import('/src/game/index.ts');
        const spell={id:'desktop-spell',name:'PC 주문',cardType:'TECHNIQUE',cost:1,attack:0,health:0,rulesText:'상대 챔피언에게 2 피해',keywords:[],abilities:[{trigger:'ACTIVE',effects:[{type:'DAMAGE_OPPONENT_CHAMPION',amount:2}]}],isToken:false,isChampionToken:false};
        const s=createInitialGameState(undefined,[spell]);
        s.status='IN_PROGRESS';s.turn=3;s.activePlayerId=s.players[0].id;s.events=[];
        for(const p of s.players){p.hand=[];p.board=[null,null,null,null];p.champion.quest=null;p.health=20;p.currentGold=10;}
        s.players[0].hand=Array.from({length:count},(_,i)=>generateCardInstance(spell,{instanceId:'desktop-hand-'+i}));
        window.dispatchEvent(new CustomEvent('ko-qa-load-state',{detail:{state:s,definitions:[spell]}}));
      },count);
      const hand=page.locator('.ko-player-hand');
      await hand.scrollIntoViewIfNeeded();
      const geometry=await hand.evaluate(e=>{
        const r=e.getBoundingClientRect(),card=e.querySelector('.ko-hand-card').getBoundingClientRect();
        return {bottom:r.bottom,height:r.height,cardBottom:card.bottom,viewport:innerHeight,overflow:getComputedStyle(document.querySelector('.ko-game-shell')).overflowY,bar:getComputedStyle(e).scrollbarWidth};
      });
      assert.ok(geometry.bottom<=height+1,JSON.stringify(geometry));
      assert.ok(geometry.cardBottom<=geometry.bottom,JSON.stringify(geometry));
      assert.notEqual(geometry.overflow,'hidden');
      assert.notEqual(geometry.bar,'none');
      if(count===10){assert.ok(await hand.evaluate(e=>e.scrollWidth>e.clientWidth));await hand.evaluate(e=>e.scrollLeft=0);await hand.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(300);assert.ok(await hand.evaluate(e=>e.scrollLeft>0),'keyboard must scroll the hand');}
      for(const index of [...new Set([0,Math.floor(count/2),count-1])]) {
        const card=hand.getByRole('button',{name:'PC 주문',exact:true}).nth(index);
        await card.scrollIntoViewIfNeeded();await card.click();
        const use=page.getByRole('button',{name:'사용',exact:true});
        await use.scrollIntoViewIfNeeded();
        assert.ok(await use.isVisible());
        const hit=await use.evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e;});
        if(!hit){console.log(await use.evaluate(e=>{const r=e.getBoundingClientRect();return {rect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,600),hand:document.querySelector('.ko-player-hand').getBoundingClientRect().toJSON()};}));await page.screenshot({path:'../desktop-hand-failure.png'});}assert.ok(hit,'use button must not be clipped or covered');
        await card.click();
      }
      const last=hand.getByRole('button',{name:'PC 주문',exact:true}).last();
      await last.scrollIntoViewIfNeeded();await last.click();
      await page.getByRole('button',{name:'사용',exact:true}).click();
      await page.waitForFunction(count=>document.querySelector('[data-testid="state-check"]').textContent.includes('hand:'+(count-1)),count);
      results.push(width+'x'+height+': '+count+' cards, first/middle/last selection and last spell use: PASS');
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
} finally {await browser.close();}
