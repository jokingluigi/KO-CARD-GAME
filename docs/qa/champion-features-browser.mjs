import assert from 'node:assert/strict';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{headless:true}:{channel:'chrome',headless:true});
const origin=process.env.KO_QA_ORIGIN??'http://127.0.0.1:5173';const results=[],failures=[];
try {
for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844],['small',320,568]]) {
 const ctx=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500});const page=await ctx.newPage();page.on('pageerror',e=>failures.push(name+':'+e.message));
 let championSaved=null,cardSaved=null,championStatus="DRAFT",excludedChampionIds=[];
 await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url());let json={cards:[],champions:[],frames:[],interactions:[],requests:[],actions:[],triggers:[],conditions:[],targetResolvers:[],valueResolvers:[],excludedCardIds:[],excludedChampionIds};
  if(url.pathname==="/api/admin/champions"&&request.method()==="GET"&&championSaved)json={champions:[{...championSaved,id:"browser-champion",status:championStatus,version:1}]};
  if(url.pathname==="/api/admin/draft/champions/browser-champion/selection"&&request.method()==="PATCH"){excludedChampionIds=request.postDataJSON().excluded?["browser-champion"]:[];json={excludedChampionIds};}
  if(url.pathname==="/api/admin/champions/browser-champion/status"&&request.method()==="POST"){championStatus=request.postDataJSON().status;json={champion:{...championSaved,id:"browser-champion",status:championStatus,version:2}};}
  if(url.pathname==='/api/admin/champions'&&request.method()==='POST'){championSaved=request.postDataJSON();json={champion:{...championSaved,id:'browser-champion',status:'DRAFT',version:1}};}
  if(url.pathname==='/api/admin/cards'&&request.method()==='POST'){cardSaved=request.postDataJSON();json={card:{...cardSaved,id:'browser-card',status:'DRAFT',version:1}};}
  if(url.pathname==='/api/admin/effects/analyze')json={outcome:'supported',status:'success',effects:[{trigger:'GAME_START',action:'DRAW',values:{amount:1}}],summaries:['1장 드로우']};
  await route.fulfill({status:request.method()==='POST'?201:200,json});
 });
 const activate=async locator=>width<500?locator.tap():locator.click();
 await page.goto(origin+'/qa/champion-features.html');
 for(const mode of ['reward','reward-full']){
  await activate(page.getByTestId(mode));await page.getByText(/퀘스트 토큰 소환:/).waitFor();
  assert.equal(await page.getByRole('button',{name:'취소',exact:true}).count(),0);
  await activate(page.getByTestId('restore'));
  const target=page.locator('.ko-board-slot-wrapper').filter({has:page.getByText('효과 대상',{exact:true})}).first().getByRole('button',{name:'연출 검증 선수',exact:true});await activate(target);
  await page.waitForFunction(()=>document.querySelector('[data-testid="board-check"]')?.textContent?.includes('tokens:1')&&document.querySelector('[data-testid="board-check"]')?.textContent?.includes('selected:false'));
  if(mode==='reward-full')assert.match(await page.getByTestId('board-check').innerText(),/decktop:replace-0/);
  results.push(name+':'+mode+':PASS');
 }
 for(const [mode,line] of [['retire','리타이어 대사'],['destroy','파괴 대사']]){await activate(page.getByTestId('reset'));await activate(page.getByTestId(mode));await page.locator('.champion-spoken-line').filter({hasText:line}).waitFor();const rect=await page.locator('.champion-spoken-line').boundingBox();assert.ok(rect&&rect.x>=-1&&rect.x+rect.width<=width+1);results.push(name+':'+mode+':PASS');}
 if(name!=='small'){
 await page.goto(origin+'/qa/champion-features.html?admin=champion');await activate(page.getByRole('button',{name:'새 챔피언',exact:true}));await page.getByLabel('이름',{exact:true}).fill('브라우저 챔피언');
 await page.getByTestId('champion-start-name').fill('첫 등장 준비');const field=page.locator('label').filter({hasText:'게임 시작 능력 효과'}).filter({has:page.locator('textarea')});await field.locator('textarea').first().fill('게임 시작: 카드를 1장 뽑습니다.');await activate(field.getByRole('button',{name:'효과 분석',exact:true}));await activate(field.getByRole('button',{name:'효과 적용',exact:true}));await activate(page.getByRole('button',{name:'DRAFT 저장',exact:true}));await page.waitForTimeout(100);assert.equal(championSaved?.abilityName,'');assert.equal(championSaved?.gameStartAbilityName,'첫 등장 준비');assert.equal(championSaved?.gameStartAbilityEffects?.effects[0]?.action,'DRAW');assert.deepEqual(championSaved?.abilityEffects,{});results.push(name+':admin-start-save:PASS');
 const draftButton=page.getByTestId("button-draft-champion-selection-browser-champion");await draftButton.waitFor();await activate(draftButton);await page.waitForFunction(()=>document.querySelector('[data-testid="button-draft-champion-selection-browser-champion"]')?.getAttribute("aria-pressed")==="true");assert.deepEqual(excludedChampionIds,["browser-champion"]);await activate(draftButton);await page.waitForFunction(()=>document.querySelector('[data-testid="button-draft-champion-selection-browser-champion"]')?.getAttribute("aria-pressed")==="false");results.push(name+":admin-champion-draft-toggle:PASS");
 await activate(page.getByRole("button",{name:"공개",exact:true}));const privateButton=page.getByTestId("button-private-champion-browser-champion");await privateButton.waitFor();await activate(privateButton);await page.getByRole("button",{name:"공개",exact:true}).waitFor();assert.equal(championStatus,"DRAFT");assert.equal(await page.getByRole("button",{name:"비활성화",exact:true}).count(),1);results.push(name+":admin-champion-private:PASS");
 await page.goto(origin+'/qa/champion-features.html?admin=card');await activate(page.getByTestId('button-create-card'));await page.getByTestId('input-card-name').fill('브라우저 선수');await page.getByTestId('retireLine-input').fill('리타이어 입력');await page.getByTestId('destroyLine-input').fill('파괴 입력');await activate(page.getByTestId('button-save-card'));await page.waitForTimeout(100);assert.equal(cardSaved?.retireLine,'리타이어 입력');assert.equal(cardSaved?.destroyLine,'파괴 입력');results.push(name+':admin-exit-save:PASS');
 }
 await ctx.close();
}
assert.deepEqual(failures,[]);console.log(JSON.stringify({results,failures},null,2));
} finally {await browser.close();}
