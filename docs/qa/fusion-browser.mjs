import assert from 'node:assert/strict';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{headless:true}:{channel:'chrome',headless:true});
const results=[],errors=[];
try{for(const width of [1440,390,320]){
 const context=await browser.newContext({viewport:{width,height:width>500?900:844},hasTouch:width<500,isMobile:width<500}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{cards:[],champions:[]}}));
 const activate=async x=>width<500?x.tap():x.click();await page.goto((process.env.KO_QA_ORIGIN??'http://127.0.0.1:5173')+'/qa/champion-features.html');
 await activate(page.getByTestId('fusion'));await page.getByRole('button',{name:'취소',exact:true}).waitFor();await activate(page.getByRole('button',{name:'취소',exact:true}));await page.waitForFunction(()=>document.querySelector('[data-testid="board-check"]')?.textContent?.includes('gold:10')&&document.querySelector('[data-testid="board-check"]')?.textContent?.includes('selected:false'));assert.match(await page.getByTestId('board-check').innerText(),/fusion:0 vanished:0 hp:20 gold:10.*selected:false/);results.push(width+':cancel restores gold and no triggers:PASS');
 await activate(page.getByTestId('fusion'));await activate(page.getByTestId('restore'));
 const target=page.locator('.ko-board-slot-wrapper').filter({has:page.getByText('효과 대상',{exact:true})}).first().getByRole('button',{name:'연출 검증 선수',exact:true});await activate(target);
 await page.waitForFunction(()=>document.querySelector('[data-testid="board-check"]')?.textContent?.includes('fusion:2 vanished:1 hp:21 gold:9')&&document.querySelector('[data-testid="board-check"]')?.textContent?.includes('selected:false'));
 assert.match(await page.getByTestId('state-check').innerText(),/UNCHANGED/);results.push(width+':restored target selection, stats, draw and vanish:PASS');await context.close();
}assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));}finally{await browser.close();}
