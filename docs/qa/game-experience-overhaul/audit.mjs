import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
export async function auditExperience(page, origin) {
 const out='qa-results/game-experience-overhaul';await mkdir(out,{recursive:true});const results=[];
 for(const route of ['/','/decks','/collection','/shop','/daily-quests','/attendance','/cosmetics','/online','/unavailable-review-page']){
  await page.goto(origin+route);await page.locator('main').waitFor();
  await page.locator('.ko-loading-screen').waitFor({state:'hidden'});
  await page.locator('h1').first().waitFor();
  if(route==='/') await page.getByTestId('button-main-menu-online').waitFor();
  if(route==='/decks'||route==='/collection')await page.getByLabel('보유 여부',{exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  for(const [width,height]of[[360,740],[375,812],[390,844],[412,915],[768,1024],[1024,768],[1440,900]]){
   await page.setViewportSize({width,height});await page.screenshot({path:`${out}/${route==='/'?'main':route.slice(1)}-${width}.png`,fullPage:true});
   if(route==='/decks'&&width>=821&&width<1200){const library=await page.locator('.ko-decks__library').boundingBox();assert.ok(library.width>=320,'tablet card library retains usable width');const search=await page.locator('.ko-decks__search').boundingBox();assert.ok(search.width>=library.width*.8,'search is not squeezed by filters');}
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   results.push({route,width,height,overflow,heading:await page.locator('h1').allTextContents()});
   await writeFile(out+'/layout.json',JSON.stringify(results,null,2));assert.equal(overflow,false,`${route} ${width} overflow`);
  }
 }
 await page.goto(origin+'/decks');await page.getByLabel('보유 여부',{exact:true}).waitFor();await page.setViewportSize({width:390,height:844});
 await page.getByLabel('보유 여부',{exact:true}).selectOption('OWNED');
 await page.getByRole('button',{name:'보유 여부 필터 해제',exact:true}).click();assert.equal(await page.getByLabel('보유 여부',{exact:true}).inputValue(),'ALL');
 await page.getByRole('navigation',{name:'덱 편집 작업 이동'}).getByRole('link',{name:/현재 덱/}).click();
 const editor=await page.locator('#deck-workspace').boundingBox();assert.ok(editor.y>=0&&editor.y<200,'workspace anchor visible below sticky toolbar');
 await page.getByRole('navigation',{name:'게임 화면 이동'}).getByRole('link',{name:'컬렉션',exact:true}).click();await page.getByLabel('보유 여부',{exact:true}).waitFor();
 assert.equal(await page.getByRole('navigation',{name:'게임 화면 이동'}).getByRole('link',{name:'컬렉션',exact:true}).getAttribute('aria-current'),'page');
 await writeFile(out+'/interactions.json',JSON.stringify({individualFilterRemoval:true,workspaceAnchor:true,directNavigation:true,physicalDevice:false},null,2));
}
