/** Actual admin components against the isolated HTTP/PGlite publication fixture. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const fixture=JSON.parse(await readFile('qa-results/card-publication/fixture.json','utf8'));
assert.equal(new URL(fixture.origin).hostname,'127.0.0.1');
const origin=process.env.KO_PUBLICATION_ORIGIN??'http://127.0.0.1:5186';assert.equal(new URL(origin).hostname,'127.0.0.1');
for(const path of ['/admin/cards/solo-card/status','/admin/champions/status-champion/status']){const r=await fetch(fixture.origin+'/api'+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:fixture.cookie},body:JSON.stringify({status:'PUBLISHED'})});assert.equal(r.status,200);}
const browser=await chromium.launch({headless:true}),errors=[],results=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname))return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();return route.fulfill({response:await route.fetch({url:fixture.origin+u.pathname+u.search,headers:{...route.request().headers(),cookie:fixture.cookie}})});});
 await context.routeWebSocket('**/api/online-matches/ws**',socket=>socket.close());
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/admin/cards');await page.getByTestId('row-card-solo-card').waitFor();
 const row=()=>page.getByTestId('row-card-solo-card');
 async function openActions(target){if(!await target.locator('details').evaluate(e=>e.open))await target.locator('summary').click();}
 for(const [value,testId,label]of[['DRAFT','unpublish','미공개'],['PUBLISHED','publish','공개'],['DISABLED','disable','비활성화'],['DRAFT','unpublish','미공개']]){
  await openActions(row());const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/admin/cards/solo-card/status');
  await page.getByTestId('button-'+testId+'-card-solo-card').click();const r=await response;assert.equal(r.status(),200);assert.equal(r.request().postDataJSON().status,value);const saved=await fetch(fixture.origin+'/api/admin/cards',{headers:{Cookie:fixture.cookie}});assert.equal((await saved.json()).cards.find(c=>c.id==='solo-card').status,value);
  await page.reload();await row().waitFor();assert.equal(await row().locator('span.absolute').innerText(),label);results.push('actual UI -> HTTP -> DB -> reload '+value+' PASS');console.log(results.at(-1));
 }
 await openActions(row());assert.equal(await page.getByTestId('button-unpublish-card-solo-card').count(),0);assert.ok(await page.getByTestId('button-publish-card-solo-card').isVisible());assert.ok(await page.getByTestId('button-disable-card-solo-card').isVisible());
 for(const [value,label]of[['DRAFT','미공개'],['PUBLISHED','공개'],['DISABLED','비활성화']]){await page.getByTestId('select-card-status').selectOption(value);await page.waitForTimeout(450);const rows=page.locator('[data-testid^="row-card-"]');assert.ok(await rows.count());for(const r of await rows.all())assert.equal(await r.locator('span.absolute').innerText(),label);}results.push('three status filters match persisted state PASS');
 await page.getByTestId('select-card-status').selectOption('');await page.getByTestId('row-card-protected-card').waitFor();const protectedRow=page.getByTestId('row-card-protected-card');await openActions(protectedRow);await page.getByTestId('button-unpublish-card-protected-card').click();await protectedRow.getByRole('alert').waitFor();assert.match(await protectedRow.getByRole('alert').innerText(),/참조/);assert.equal(await protectedRow.locator('span.absolute').innerText(),'공개');results.push('reference conflict remains visible and card stays published PASS');
 await page.reload();await protectedRow.waitFor();await openActions(protectedRow);
 for(const width of [360,375,390,412,1440]){await page.setViewportSize({width,height:width===1440?900:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`qa-results/card-publication/admin-${width}.png`,fullPage:true});}results.push('four mobile and desktop widths have no horizontal overflow PASS');
 await page.goto(origin+'/admin/champions');await page.getByRole('heading',{name:'공개 상태 검증 챔피언',exact:true}).waitFor();const privateButton=page.getByTestId('button-private-champion-status-champion');assert.equal(await privateButton.innerText(),'미공개');await privateButton.click();await privateButton.waitFor({state:'hidden'});await page.reload();await page.getByRole('heading',{name:'공개 상태 검증 챔피언',exact:true}).waitFor();assert.match(await page.locator('article').filter({has:page.getByRole('heading',{name:'공개 상태 검증 챔피언',exact:true})}).innerText(),/미공개 · v/);results.push('champion consistent unpublished label and persisted existing state PASS');
 assert.deepEqual(errors,[]);await mkdir('qa-results/card-publication',{recursive:true});await writeFile('qa-results/card-publication/browser-results.json',JSON.stringify({results,errors,physicalPhone:'NOT_RUN',productionRequests:0},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
