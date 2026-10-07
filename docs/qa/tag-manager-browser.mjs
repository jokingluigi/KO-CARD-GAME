import assert from 'node:assert/strict';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{headless:true}:{channel:'chrome',headless:true});
const origin=process.env.KO_QA_ORIGIN??'http://127.0.0.1:5173';const results=[],errors=[];
try {for(const [mode,width,height] of [['desktop',1440,900],['mobile',390,844],['small',320,568]]) {
 const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 let tags=['기존'],cards=[{id:'a',name:'테스트 선수 A',tags:['기존'],status:'PUBLISHED',rarity:'NORMAL',cost:2,attack:3,health:4},{id:'b',name:'테스트 선수 B',tags:[],status:'DRAFT',rarity:'EPIC',cost:6,attack:5,health:6}];
 await page.route('**/api/**',async route=>{const r=route.request(),u=new URL(r.url()),parts=u.pathname.split('/').map(decodeURIComponent);let json={cards:[],tags:[]};
 if(u.pathname==='/api/admin/tags') {if(r.method()==='POST'){const name=r.postDataJSON().name;if(!tags.includes(name))tags.push(name);json={name};}else json={tags,cards};}
 else if(parts[3]==='tags'&&r.method()==='PATCH'){const card=cards.find(c=>c.id===parts[6]),tag=parts[4];card.tags=r.postDataJSON().attached?[...new Set([...card.tags,tag])]:card.tags.filter(t=>t!==tag);json={card};}
 else if(parts[3]==='tags'&&r.method()==='DELETE'){tags=tags.filter(t=>t!==parts[4]);cards=cards.map(c=>({...c,tags:c.tags.filter(t=>t!==parts[4])}));json={deleted:true};}
 await route.fulfill({status:r.method()==='POST'?201:200,json});});
 await page.goto(origin+'/qa/champion-features.html?admin=tags');await page.getByTestId('admin-tag-manager').waitFor();await page.getByRole('checkbox',{name:'테스트 선수 A'}).waitFor();
 for(const tag of ['둘','셋','넷','다섯']) {await page.getByLabel('새 태그 이름').fill(tag);await page.getByRole('button',{name:'태그 추가',exact:true}).click();await page.getByRole('heading',{name:tag,exact:true}).waitFor();await page.getByRole('checkbox',{name:'테스트 선수 A'}).click();await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent?.includes('연결'));}
 assert.equal(cards[0].tags.length,5);results.push(mode+':five-tags:PASS');
 await page.getByLabel('태그 연결 필터').selectOption('ATTACHED');assert.equal(await page.getByRole('checkbox').count(),1);await page.getByLabel('태그 연결 필터').selectOption('AVAILABLE');assert.equal(await page.getByRole('checkbox').count(),1);results.push(mode+':filter:PASS');
 await page.getByLabel('태그 연결 필터').selectOption('ALL');await page.getByRole('checkbox',{name:'테스트 선수 A'}).click();await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent?.includes('해제'));assert.ok(tags.includes('다섯'));assert.equal(cards[0].tags.length,4);results.push(mode+':detach-empty-tag:PASS');
 await page.getByRole('checkbox',{name:'테스트 선수 B'}).click();await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent?.includes('연결'));page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'태그 삭제',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent?.includes('삭제'));assert.ok(!tags.includes('다섯'));assert.equal(cards.length,2);assert.equal(cards[0].cost,2);assert.equal(cards[0].attack,3);assert.equal(cards[0].health,4);assert.ok(!cards[1].tags.includes('다섯'));results.push(mode+':delete:PASS');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);results.push(mode+':layout:PASS');await context.close();
}assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));}finally{await browser.close();}
