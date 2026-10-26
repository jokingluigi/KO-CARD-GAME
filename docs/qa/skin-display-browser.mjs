/** Real editor → durable settings → frozen PvP HUD/card and fresh AI intro. */
await import('./cosmetics-browser.mjs');
import {chromium} from './black-gold-playwright.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile('qa-results/cosmetics/fixture.json','utf8'));
const origin=process.env.KO_COSMETICS_FRONTEND;const out='qa-results/skin-display';await mkdir(out,{recursive:true});
if(!origin||new URL(origin).hostname!=='127.0.0.1')throw Error('Local only');
const browser=await chromium.launch({headless:true});const results=[];
async function context(user,width=390,height=844){const ctx=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});const [name,...value]=fixture.cookies[user].split('=');await ctx.addCookies([{name,value:value.join('='),url:origin}]);const page=await ctx.newPage();return {ctx,page};}
async function range(page,testid,value){await page.getByTestId(testid).evaluate((input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},value);}
try{
 const admin=await context('admin');const page=admin.page;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/admin/cosmetics');await page.getByRole('button',{name:/검증 챔피언 스킨 · UI 수정/}).click();
 const editor=page.getByRole('group',{name:'art 이미지 조정',exact:true});await editor.waitFor();
 await range(page,'art-skin-scale',1.48);await range(page,'art-skin-x',17);await range(page,'art-skin-y',83);
 const img=editor.getByAltText('art 미리보기');assert.equal(await img.evaluate(e=>e.style.transform),'scale(1.48)');assert.equal(await img.evaluate(e=>e.style.objectPosition),'17% 83%');
 // Drag the same artwork component used by the original card editor.
 const dragSurface=editor.locator(".cursor-grab");await dragSurface.scrollIntoViewIfNeeded();const area=await dragSurface.boundingBox();await page.mouse.move(area.x+area.width/2,area.y+area.height/2);await page.mouse.down();await page.mouse.move(area.x+area.width/2+18,area.y+area.height/2-12,{steps:4});await page.mouse.up();
 assert.notEqual(await page.getByTestId('art-skin-x').inputValue(),'17');
 await range(page,'art-skin-x',17);await range(page,'art-skin-y',83);
 await page.getByRole('button',{name:'아이템 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'저장했어'}).waitFor();
 await page.reload();await page.getByRole('button',{name:/검증 챔피언 스킨 · UI 수정/}).click();assert.equal(await page.getByTestId('art-skin-scale').inputValue(),'1.48');assert.equal(await page.getByTestId('art-skin-y').inputValue(),'83');
 for(const [width,height]of [[360,740],[390,844],[1440,900]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await editor.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/editor-${width}.png`});results.push({width,height,editorFits:true});}
 await editor.getByRole('button',{name:'위치·크기 초기화'}).click();assert.equal(await page.getByTestId('art-skin-scale').inputValue(),'1');assert.equal(await page.getByTestId('art-skin-x').inputValue(),'50');
 // Editing a pack skin stores the same composition in its original catalog columns.
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:/검증 CARD_SKIN · 카드 스킨/}).click();
 await range(page,'art-skin-scale',.9);await range(page,'art-skin-x',66);await range(page,'art-skin-y',32);
 await page.getByRole('button',{name:'아이템 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'저장했어'}).waitFor();
 await page.reload();await page.getByRole('button',{name:/검증 CARD_SKIN · 카드 스킨/}).click();assert.equal(await page.getByTestId('art-skin-scale').inputValue(),'0.9');
 const old=await page.evaluate(()=>fetch('/api/admin/card-skins').then(r=>r.json()));assert.equal(old.skins.find(s=>s.name==='검증 CARD_SKIN').imageScale,.9);
 // Do not save reset: verify the saved custom composition in the user preview.
 const user=await context('player-a');await user.page.goto(origin+'/cosmetics');const owned=user.page.locator('article').filter({hasText:'검증 챔피언 스킨 · UI 수정'});
 await owned.waitFor();assert.equal(await owned.locator('img').first().evaluate(e=>e.style.transform),'scale(1.48)');
 // The match created before editor changes keeps its original frozen composition.
 await user.page.goto(origin+'/online/match/'+fixture.matchId);await user.page.locator('.ko-game-shell').waitFor();
 const hud=user.page.locator('.ko-player-champion .ko-champion-portrait-art img');await hud.waitFor();assert.equal(await hud.evaluate(e=>e.style.transform),'scale(1.35)');assert.equal(await hud.evaluate(e=>e.style.objectPosition),'24% 72%');
 await user.page.screenshot({path:`${out}/frozen-pvp-hud.png`});
 const transforms=await user.page.locator('.ko-player-board-row img').evaluateAll(es=>es.map(e=>e.style.transform));assert.ok(transforms.includes('scale(1.35)')||transforms.includes('scale(0.8)'));
 // A new AI opening reads the saved configuration, rather than the old frozen PvP one.
 await user.page.goto(origin+'/ai-match');
 const start=user.page.getByRole('button',{name:'매치 시작',exact:true});await start.waitFor();
 await start.click();const intro=user.page.getByTestId('img-champion-portrait-self');await intro.waitFor();assert.equal(await intro.evaluate(e=>e.style.transform),'scale(1.48)');await user.page.screenshot({path:`${out}/new-ai-intro.png`});results.push({newAiIntro:true});
 assert.deepEqual(errors,[]);results.push({drag:true,persisted:true,userPreview:true,frozenPvp:true,cardOrTokenTransform:true,reset:true});
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));await user.ctx.close();await admin.ctx.close();
}finally{await browser.close();}
