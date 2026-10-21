/** Real React deck UI; intercepted local APIs, zero production traffic. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'./black-gold-playwright.mjs');
const origin=process.env.KO_QA_ORIGIN??'http://127.0.0.1:5186';assert.equal(new URL(origin).hostname,'127.0.0.1');
const out='qa-results/deck-sharing';await mkdir(out,{recursive:true});
const catalog=JSON.parse(await readFile('docs/qa/snapshots/20261014-admin/cards.json','utf8'));
const cards=catalog.filter(c=>c.status==='PUBLISHED'&&!c.isToken&&!c.isChampionToken&&c.rarity==='EPIC').slice(0,13).map(c=>({...c,quantity:3}));
const champions=JSON.parse(await readFile('docs/qa/snapshots/20261014-admin/champions.json','utf8')).filter(c=>c.status==='PUBLISHED');
const ids=cards.flatMap((c,i)=>Array(i<12?2:1).fill(c.id));assert.equal(ids.length,25);
const champion=champions[0];const user={id:'share-test',nickname:'공유 검증',role:'USER',isTestAccount:false};
const original={id:'original',name:'공유 테스트 덱',championDefinitionId:champion.id,cardDefinitionIds:ids,cards,champion,isSelected:true,isValid:true,missingCardDefinitionIds:[],invalidReasons:[],validationReasons:[]};
const results=[],errors=[];const browser=await chromium.launch({headless:true});let savedCode='',savedLink='';
async function fixture({width=390,height=844,loggedIn=true,owns=true}={}){
 const ctx=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'}),page=await ctx.newPage();let authenticated=loggedIn;const writes=[],reads=[];const decks=owns?[structuredClone(original)]:[];
 page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/*',async route=>{const r=route.request(),url=new URL(r.url());if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();if(!url.pathname.includes('/api/'))return route.continue();
 const p=url.pathname;let json={};
 if(r.method()!=='GET'){
  writes.push({path:p,method:r.method(),body:r.postDataJSON()});
  if(p==='/api/auth/login'){authenticated=true;json={authenticated:true,user};}
  else {assert.equal(p,'/api/decks');assert.equal(r.method(),'POST');assert.equal(authenticated,true);assert.equal(owns,true);assert.equal('id' in r.postDataJSON(),false);const body=r.postDataJSON();const deck={...original,...body,id:'imported-'+decks.length,isSelected:false};decks.push(deck);json={deck};}
 } else {reads.push(p);
 if(p==='/api/healthz')json={status:'ok'};
 else if(p==='/api/auth/me')json={authenticated,user:authenticated?user:null};
 else if(p==='/api/server-status')json={enabled:false,allowed:true};
 else if(p==='/api/decks/options')json={cards:cards.map(c=>({...c,quantity:owns?3:0})),champions:owns?champions:[],isTestAccount:false};
 else if(p==='/api/decks')json={decks};else if(p==='/api/champions')json={champions};else if(p==='/api/cards')json={cards};
 else if(p.includes('/storage/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
 }
 await route.fulfill({json});});return{ctx,page,writes,reads,decks};
}
try{
 for(const [width,height]of[[360,740],[375,812],[390,844],[412,915],[1440,900]]){
 const f=await fixture({width,height});const {page}=f;await page.goto(origin+'/decks');await page.getByTestId('button-import-deck').waitFor();
 const expand=page.getByRole('button',{name:'덱 정보 펼치기 ▲',exact:true});if(await expand.count())await expand.click();
 await page.getByTestId('button-share-deck').click();await page.getByTestId('deck-share-preview').waitFor();
 const code=await page.getByRole('textbox',{name:'공유 코드',exact:true}).inputValue();const link=await page.getByRole('textbox',{name:'공유 링크',exact:true}).inputValue();assert.ok(code.startsWith('KO1.'));savedCode=code;savedLink=link;
 assert.equal(f.writes.length,0);assert.equal(f.reads.filter(p=>p==='/api/decks/options').length,1);assert.equal(f.reads.filter(p=>p==='/api/champions').length,0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.waitForTimeout(300);const modalBox=await page.getByRole('dialog').boundingBox();assert.ok(modalBox.x>=0&&modalBox.x+modalBox.width<=width+1&&modalBox.y>=0&&modalBox.y+modalBox.height<=height+1,JSON.stringify(modalBox));await page.screenshot({path:`${out}/share-${width}.png`});await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});await page.waitForTimeout(250);
 await page.getByTestId('button-import-deck').click();await page.getByTestId('deck-code-input').waitFor();await page.getByTestId('deck-code-input').fill(link);await page.getByTestId('button-preview-deck-code').click();await page.getByTestId('deck-share-preview').waitFor();
 assert.equal(f.writes.length,0);assert.equal(await page.getByTestId('deck-share-preview').locator('button[aria-label$="카드 정보"]').count(),13);
 await page.getByTestId('button-import-shared-deck').click();await page.getByTestId('deck-share-preview').waitFor({state:'hidden'});assert.equal(f.writes.length,1);assert.deepEqual([...f.writes[0].body.cardDefinitionIds].sort(),[...ids].sort());assert.equal(f.writes[0].body.championDefinitionId,champion.id);assert.equal(f.decks.length,2);assert.deepEqual(f.decks[0],original);
 await page.screenshot({path:`${out}/imported-${width}.png`});results.push(`${width}x${height}: share/link/preview/new-deck/zero-sharing-writes PASS`);await f.ctx.close();
 }
 const missing=await fixture({owns:false});await missing.page.goto(savedLink);await missing.page.getByTestId('deck-share-missing').waitFor();await missing.page.getByText(champion.name,{exact:true}).waitFor();assert.equal(await missing.page.getByTestId('button-import-shared-deck').isDisabled(),true);assert.equal(missing.writes.length,0);await missing.page.screenshot({path:out+'/missing.png'});results.push('unowned cards/champion previewed; save blocked PASS');await missing.ctx.close();
 const login=await fixture({loggedIn:false});await login.page.goto(savedLink);await login.page.getByRole('textbox',{name:'이메일',exact:true}).fill('share@local.invalid');await login.page.getByLabel('비밀번호',{exact:true}).fill('Local12345!');await login.page.getByRole('button',{name:'로그인',exact:true}).last().click();await login.page.getByTestId('deck-share-preview').waitFor();assert.equal(new URL(login.page.url()).hash,new URL(savedLink).hash);assert.equal(login.writes.length,1);assert.equal(login.writes[0].path,'/api/auth/login');await login.page.getByTestId('button-import-shared-deck').click();await login.page.getByTestId('deck-share-preview').waitFor({state:'hidden'});assert.equal(login.writes.length,2);results.push('login preserves share link and imports identical independent deck PASS');await login.ctx.close();
 const bad=await fixture();await bad.page.goto(origin+'/decks#deck=KO1.broken');await bad.page.getByRole('alert').filter({hasText:'損傷|손상'}).count();await bad.page.getByTestId('deck-code-input').waitFor();assert.equal(await bad.page.getByTestId('button-import-shared-deck').count(),0);assert.equal(bad.writes.length,0);results.push('corrupted link cannot save PASS');await bad.ctx.close();
 assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
