import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const origin=process.env.KO_QA_ORIGIN??'http://127.0.0.1:5173';
const records=JSON.parse(fs.readFileSync('docs/qa/snapshots/20261014-admin/cards.json'));
const cards=records.filter(c=>c.status==='PUBLISHED'&&!c.isToken&&!c.isChampionToken).map(c=>({...c,quantity:3}));
const champions=JSON.parse(fs.readFileSync('docs/qa/snapshots/20261014-admin/champions.json')).filter(c=>c.status==='PUBLISHED').map(c=>({...c,owned:true}));
const mandang=cards.find(c=>c.name==='만당');assert.ok(mandang);
const ids=[mandang.id,mandang.id];
for(const card of cards.filter(c=>c.id!==mandang.id&&c.cost<=6))for(let i=0;i<(card.rarity==='NORMAL'?3:card.rarity==='EPIC'?2:1)&&ids.length<25;i++)ids.push(card.id);
assert.equal(ids.length,25);
const user={id:'deck-control-qa',nickname:'검증',role:'USER',currencyBalance:0,prismBalance:0,championPrismBalance:0,isTestAccount:false};
const browser=await chromium.launch({headless:true,...(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{}:{channel:'chrome'})});
const results=[];
try{
for(const [width,height,touch]of[[390,844,true],[320,740,true],[430,932,true],[1440,900,false]]){
 console.log(JSON.stringify({checking:{width,height,touch}}));
 const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,reducedMotion:'reduce'});const page=await context.newPage();const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 let deck={id:'deck-controls',name:'검증 덱',championDefinitionId:champions[0].id,cardDefinitionIds:[...ids],champion:champions[0],cards:ids.map(id=>cards.find(c=>c.id===id)),isValid:true,isSelected:true,missingCardDefinitionIds:[],invalidReasons:[],validationReasons:[]};
 await page.route('**/api/**',async route=>{
  const r=route.request(),p=new URL(r.url()).pathname;let json={};
  if(r.method()!=='GET'){writes.push({path:p,method:r.method(),body:r.postDataJSON()});assert.equal(p,'/api/decks/deck-controls');assert.equal(r.method(),'PATCH');deck={...deck,...r.postDataJSON()};json={deck};}
  else if(p.endsWith('/auth/me'))json={authenticated:true,user};
  else if(p.endsWith('/server-status'))json={enabled:false,allowed:true};
  else if(p.endsWith('/decks/options'))json={cards,champions,isTestAccount:false};
  else if(p.endsWith('/decks'))json={decks:[deck]};
  else if(p.endsWith('/cards'))json={cards};else if(p.endsWith('/champions'))json={champions};
  else if(p.includes('/storage/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
  await route.fulfill({json});
 });
 const activate=async locator=>touch?locator.tap():locator.click();
 await page.goto(origin+'/decks');await page.getByTestId('row-selected-card-'+mandang.id).waitFor({state:'attached'});const expand=page.getByRole('button',{name:'덱 정보 펼치기 ▲',exact:true});if(await expand.count())await activate(expand);await page.getByTestId('row-selected-card-'+mandang.id).waitFor();
 const row=page.getByTestId('row-selected-card-'+mandang.id),minus=page.getByTestId('button-remove-card-'+mandang.id);
 await activate(minus);await page.getByTestId('text-card-count-'+mandang.id).filter({hasText:'×1'}).waitFor();await page.waitForTimeout(250);
 assert.equal(await page.getByRole('complementary',{name:'상세정보',exact:true}).count(),0,'minus must not open hover/touch inspector');
 assert.equal(await page.getByRole('dialog').count(),0,'minus must not open card detail dialog');assert.equal(writes.length,0);
 await activate(minus);await row.waitFor({state:'detached'});assert.equal(await page.locator('.ko-touch-inspector').count(),0);
 const add=page.getByTestId('button-add-card-action-'+mandang.id);await activate(add);await activate(add);await page.getByTestId('text-card-count-'+mandang.id).filter({hasText:'×2'}).waitFor();assert.equal(await page.locator('.ko-touch-inspector').count(),0);
 // Removal must not disable intentional card details or desktop inspection.
 const detail=row.getByRole('button',{name:'만당 상세 보기',exact:true});
 if(!touch){await detail.hover();await page.getByRole('complementary',{name:'상세정보',exact:true}).waitFor();}
 await activate(detail);await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/decks/deck-controls'&&r.request().method()==='PATCH');await activate(page.getByTestId('button-save-deck'));assert.equal((await saved).status(),200);
 assert.equal(writes.length,1);assert.equal(writes[0].body.cardDefinitionIds.length,25);assert.equal(writes[0].body.cardDefinitionIds.filter(id=>id===mandang.id).length,2);
 assert.deepEqual(errors,[]);results.push({width,height,touch,passed:true});await context.close();
}
console.log(JSON.stringify({results}));
}finally{await browser.close();}
