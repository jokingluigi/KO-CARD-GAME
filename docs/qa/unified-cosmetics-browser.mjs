/** Actual catalog/edit/grant/equip flow against the isolated HTTP fixture. */
await import('./cosmetics-browser.mjs');
import {chromium} from './black-gold-playwright.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile('qa-results/cosmetics/fixture.json','utf8'));
const origin=process.env.KO_COSMETICS_FRONTEND;
if(!origin||new URL(origin).hostname!=='127.0.0.1')throw Error('Local only');
const out='qa-results/unified-cosmetics';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
async function context(user,width,height){
 const ctx=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});
 const [name,...value]=fixture.cookies[user].split('=');await ctx.addCookies([{name,value:value.join('='),url:origin}]);
 const page=await ctx.newPage();return {ctx,page};
}
try {
 for(const [width,height] of [[360,740],[375,812],[390,844],[412,915],[1440,900]]){
  const {ctx,page}=await context('admin',width,height);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/admin/skins');await page.getByLabel('아이템 이름',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'기존 카드팩 스킨',exact:true}).count(),0);
  const item=page.getByRole('button',{name:/팩 카드 스킨 · 카드 스킨/});await item.click();
  await page.getByLabel('스킨 공개 상태').waitFor();assert.equal(await page.getByLabel('아이템 유형').inputValue(),'CARD_SKIN');
  const name='통합 카드팩 스킨 '+width;
  await page.getByLabel('아이템 이름',{exact:true}).fill(name);
  await page.getByRole('button',{name:'아이템 저장',exact:true}).click();
  await page.getByRole('status').filter({hasText:'저장했어'}).waitFor();
  const catalog=await page.evaluate(()=>fetch('/api/admin/cosmetics').then(r=>r.json()));
  const skin=catalog.items.find(i=>i.legacySkinId==='pack-card-skin');
  assert.equal(skin.name,name);assert.equal(catalog.items.filter(i=>i.id===skin.id).length,1);
  const old=await page.evaluate(()=>fetch('/api/admin/card-skins').then(r=>r.json()));
  assert.equal(old.skins.find(s=>s.id==='pack-card-skin').name,name);
  await page.getByLabel('꾸미기 유형 필터').selectOption('IMAGE_EMOTE');assert.equal(await page.getByRole('button',{name:new RegExp(name+' · 카드 스킨')}).count(),0);
  await page.getByLabel('꾸미기 유형 필터').selectOption('CARD_SKIN');await page.getByRole('button',{name:new RegExp(name+' · 카드 스킨')}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`${out}/admin-${width}.png`,fullPage:true});
  const user=await context('player-b',width,height);await user.page.goto(origin+'/cosmetics');
  await user.page.getByRole('button',{name:'카드 스킨',exact:true}).click();
  const owned=user.page.locator('article').filter({has:user.page.getByRole('heading',{name,exact:true})});await owned.waitFor();
  await owned.getByRole('button',{name:'장착',exact:true}).click();await owned.getByText('장착 중',{exact:true}).waitFor();
  const equipped=await user.page.evaluate(()=>fetch('/api/cosmetics').then(r=>r.json()));
  assert.equal(equipped.loadout.skins['card:'+fixture.cards[0].id].id,'pack-skin:pack-card-skin');
  await user.page.reload();await user.page.getByRole('button',{name:'카드 스킨',exact:true}).click();await owned.getByText('장착 중',{exact:true}).waitFor();
  await user.page.screenshot({path:`${out}/equipped-${width}.png`,fullPage:true});
  assert.deepEqual(errors,[]);results.push({width,height,unifiedAlias:true,legacyEdit:true,filters:true,oldOwnerEquip:true,persistent:true,overflow:false});
  // Restore the original fixture name for the following viewport.
  await page.evaluate(async({skin})=>{await fetch('/api/admin/cosmetics/items/'+encodeURIComponent(skin.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...skin,name:'팩 카드 스킨'})});},{skin});
  if(width===360){
   await page.getByRole('button',{name:'새 아이템',exact:true}).click();
   await page.getByLabel('아이템 유형').selectOption('CARD_SKIN');
   await page.getByLabel('아이템 이름',{exact:true}).fill('새 통합 카드팩 스킨');
   await page.getByLabel('적용 대상',{exact:true}).selectOption(fixture.cards[0].id);
   await page.getByLabel('art 이미지 업로드').setInputFiles({name:'new-skin.png',mimeType:'image/png',buffer:await readFile('qa-results/cosmetics/upload-fixture.png')});
   await page.getByRole('status').filter({hasText:'이미지 검증 완료'}).waitFor();
   await page.getByRole('button',{name:'아이템 저장',exact:true}).click();
   await page.getByRole('status').filter({hasText:'저장했어'}).waitFor();await page.getByLabel('스킨 공개 상태').waitFor();
   const created=await page.evaluate(async()=>{const c=await fetch('/api/admin/cosmetics').then(r=>r.json());const p=await fetch('/api/admin/packs/options').then(r=>r.json());const item=c.items.find(i=>i.name==='새 통합 카드팩 스킨');return {item,inPack:p.skins.some(s=>s.id===item.legacySkinId),count:c.items.filter(i=>i.id===item.id).length};});
   assert.equal(created.inPack,true);assert.equal(created.count,1);assert.ok(created.item.legacySkinId);
   await page.getByLabel('플레이어 검색',{exact:true}).fill('player-b');await page.getByRole('button',{name:'플레이어 검색',exact:true}).click();await page.getByRole('button',{name:'player-b',exact:true}).click();
   const granted=page.locator('article').filter({hasText:'새 통합 카드팩 스킨'});await granted.getByRole('button',{name:'지급',exact:true}).click();await granted.getByRole('button',{name:'회수',exact:true}).waitFor();
   await user.page.reload();await user.page.getByRole('button',{name:'카드 스킨',exact:true}).click();
   const newOwned=user.page.locator('article').filter({has:user.page.getByRole('heading',{name:'새 통합 카드팩 스킨',exact:true})});await newOwned.getByRole('button',{name:'장착',exact:true}).click();await newOwned.getByText('장착 중',{exact:true}).waitFor();
   page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'아이템 삭제',exact:true}).click();await page.getByRole('status').filter({hasText:'아이템을 삭제했습니다'}).waitFor();
   await user.page.reload();await user.page.getByRole('button',{name:'카드 스킨',exact:true}).click();assert.equal(await newOwned.count(),0);
   results.push({newCardSkinUpload:true,packEligible:true,adminGrant:true,userEquip:true,deleteBothCatalogs:true});
  }
  await user.ctx.close();await ctx.close();
 }
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
