/** Actual app routes + isolated accounts/API. Never mutates a live account. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
import {auditSetup} from './ui-audit-fixture.mjs';
const origin=process.env.KO_UI_ORIGIN??'http://127.0.0.1:5186';
const out=process.env.KO_DECK_QUALITY_OUT??'qa-results/quality-deck-recovery';
await mkdir(out,{recursive:true});
const b=await chromium.launch(),results=[];
try{
 for(const [width,height] of [[390,844],[844,390],[1440,900]]){
  const context=await b.newContext({viewport:{width,height},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce',ignoreHTTPSErrors:true});
  const p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const fixture=await auditSetup(context);
  let optionsReads=0,listReads=0,failInitial=true,failList=false,saveWrites=0,deleteWrites=0,selectWrites=0;
  let releaseSave;
  await context.route('**/api/decks/options',r=>{
   optionsReads++;
   if(failInitial)return r.fulfill({status:503,json:{message:'덱 목록 연결을 확인해 주세요.'}});
   return r.fallback();
  });
  await context.route('**/api/decks',r=>{
   if(r.request().method()==='GET'){
    listReads++;
    if(failList)return r.fulfill({status:503,json:{message:'목록 읽기만 실패'}});
   }
   return r.fallback();
  });
  await context.route('**/api/decks/selected',async r=>{
   if(r.request().method()==='PATCH'){
    saveWrites++;
    await new Promise(resolve=>releaseSave=resolve);
    return r.fulfill({status:400,json:{message:'이름을 확인해 주세요. 편집 내용은 유지됩니다.'}});
   }
   return r.fallback();
  });
  await context.route('**/api/decks/other/select',r=>{
   selectWrites++;
   return r.fulfill({json:{deck:{...fixture.decks.find(d=>d.id==='other'),isSelected:true}}});
  });
  await context.route('**/api/decks/other',r=>{
   if(r.request().method()==='DELETE'){
    deleteWrites++;return r.fulfill({status:204,body:''});
   }
   return r.fallback();
  });
  await p.goto(origin+'/decks');
  await p.getByTestId('status-decks-error').waitFor();
  assert.equal(optionsReads,1);
  failInitial=false;
  await p.getByTestId('button-retry-decks').click();
  await p.getByTestId('grid-card-collection').waitFor();
  assert.equal(optionsReads,2);
  await p.getByRole('button',{name:'현재 덱 · 25/25',exact:true}).click();
  const name=p.getByTestId('input-deck-name');
  await name.fill('실패해도 유지할 편집');
  await p.getByTestId('button-save-deck').click();
  await p.waitForFunction(()=>document.querySelector('[data-testid="input-deck-name"]')?.matches(':disabled'));
  assert.equal(await p.getByTestId('button-create-deck').isDisabled(),true);
  // Native fieldset blocks a synthetic second click as well.
  await p.getByTestId('button-save-deck').evaluate(el=>{el.click();el.click();});
  assert.equal(saveWrites,1);
  releaseSave();
  await p.getByTestId('status-decks-error').filter({hasText:'이름을 확인'}).waitFor();
  assert.equal(await name.inputValue(),'실패해도 유지할 편집');
  assert.equal(await name.isDisabled(),false);
  assert.equal(optionsReads,2);
  assert.equal(await p.getByTestId('button-retry-decks').count(),0);
  assert.equal(await p.getByTestId('status-decks-error').evaluate(el=>document.activeElement===el),true);
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('ko-deck-edit-draft:launch-user')??'null')?.name),'실패해도 유지할 편집');
  await p.screenshot({path:`${out}/deck-error-${width}x${height}.png`});
  await name.fill('출전 검증 덱');
  await p.getByRole('button',{name:'내 덱',exact:true}).click();
  await p.getByTestId('list-decks').getByRole('button').filter({hasText:'첫 번째 덱'}).click();
  const beforeReads=listReads;
  failList=true;
  await p.getByTestId('button-select-deck').click();
  await p.getByTestId('status-decks-success').filter({hasText:'출전 덱을 변경했습니다.'}).waitFor();
  assert.equal(selectWrites,1);
  assert.equal(listReads,beforeReads);
  assert.equal(await p.getByTestId('button-select-deck').textContent(),'현재 출전 덱');
  await p.getByTestId('button-delete-deck').click();
  const dialog=p.getByRole('alertdialog');
  await dialog.waitFor();
  await dialog.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
  await p.evaluate(()=>document.fonts.ready);
  assert.equal(await dialog.getByRole('button',{name:'계속 보관'}).evaluate(el=>document.activeElement===el),true);
  assert.equal(deleteWrites,0);
  await p.screenshot({path:`${out}/deck-delete-${width}x${height}.png`});
  for(const name of ['계속 보관','덱 삭제']){
   const box=await dialog.getByRole('button',{name,exact:true}).boundingBox();
   assert.ok(box.height>=44&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,JSON.stringify({width,height,name,box}));
  }
  await p.screenshot({path:`${out}/deck-delete-${width}x${height}.png`});
  await dialog.getByRole('button',{name:'계속 보관'}).click();
  assert.equal(deleteWrites,0);
  await p.waitForFunction(()=>document.activeElement?.getAttribute('data-testid')==='button-delete-deck');
  await p.getByTestId('button-delete-deck').click();
  await p.getByRole('alertdialog').getByRole('button',{name:'덱 삭제',exact:true}).click();
  await p.getByTestId('status-decks-success').filter({hasText:'덱을 삭제했습니다.'}).waitFor();
  assert.equal(deleteWrites,1);
  assert.equal(listReads,beforeReads);
  assert.equal(await name.inputValue(),'새로운 전략');
  await p.getByRole('button',{name:'카드 찾기',exact:true}).click();
  await p.getByTestId('input-card-search').fill('존재하지않는검색어');
  await p.getByTestId('empty-card-results').getByRole('button',{name:'검색·필터 초기화'}).click();
  await p.getByTestId('grid-card-collection').waitFor();
  assert.equal(await p.getByTestId('input-card-search').inputValue(),'');
  assert.equal(await p.getByTestId('input-card-search').evaluate(el=>document.activeElement===el),true);
  await p.goto(origin+'/collection');
  const search=p.getByRole('textbox',{name:'카드 이름 검색'});
  await search.fill('없는검색어');
  await p.getByRole('button',{name:'즐겨찾기만',exact:true}).click();
  await p.getByRole('button',{name:'검색·필터 초기화',exact:true}).click();
  await p.locator('.ko-collection-item').first().waitFor();
  assert.equal(await search.inputValue(),'');
  assert.equal(await p.getByRole('button',{name:'즐겨찾기만',exact:true}).getAttribute('aria-pressed'),'false');
  assert.equal(await search.evaluate(el=>document.activeElement===el),true);
  assert.deepEqual(errors,[]);
  results.push({width,height,initialReadRetry:true,saveFailureKeepsDraft:true,saveLocksEditingAndDuplicates:true,selectSuccessDoesNotNeedListRead:true,deleteCancelFocusAnd44px:true,deleteSuccessDoesNotNeedListRead:true,deckAndCollectionReset:true,pageErrors:errors});
  await context.close();
 }
 // A rejected React.lazy import cannot recover through resetting the boundary.
 const p=await b.newPage({viewport:{width:390,height:844},ignoreHTTPSErrors:true});
 await auditSetup(p);
 let blocked=0;
 const rejectChunk=r=>{blocked++;return blocked===1?r.abort('failed'):r.continue();};
 await p.route('**/src/pages/settings.tsx*',rejectChunk);
 await p.route('**/assets/settings-*.js',rejectChunk);
 await p.goto(origin+'/settings');
 await p.getByRole('heading',{name:'화면 파일을 다시 불러와 주세요'}).waitFor();
 await p.screenshot({path:`${out}/screen-file-recovery-390.png`});
 await p.getByRole('button',{name:'화면 다시 불러오기',exact:true}).click();
 await p.locator('.ko-settings-panel').waitFor();
 assert.ok(blocked>=2);
 results.push({rejectedScreenImportReloadRecovers:true});
 await p.close();
 const slow=await b.newPage({viewport:{width:390,height:844},ignoreHTTPSErrors:true});
 await auditSetup(slow);
 await slow.clock.install();
 let releaseChunk;
 const hold=r=>new Promise(resolve=>{releaseChunk=()=>resolve(r.continue());});
 await slow.route('**/src/pages/settings.tsx*',hold);
 await slow.route('**/assets/settings-*.js',hold);
 await slow.goto(origin+'/settings');
 await slow.locator('.ko-loading-track').waitFor();
 assert.equal(await slow.getByRole('button',{name:'화면 다시 불러오기',exact:true}).count(),0);
 await slow.clock.fastForward(10100);
 await slow.getByRole('button',{name:'화면 다시 불러오기',exact:true}).waitFor();
 await slow.screenshot({path:`${out}/screen-slow-recovery-390.png`});
 releaseChunk();
 await slow.locator('.ko-settings-panel').waitFor();
 assert.equal(await slow.locator('.ko-loading-recovery').count(),0);
 results.push({slowScreenOffersReadReloadAfter10Seconds:true,lateImportStillOpensNormally:true});
 await slow.close();
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
}finally{await b.close();}
