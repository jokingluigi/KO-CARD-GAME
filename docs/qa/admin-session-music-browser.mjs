/** Real administrator React route; all data is local intercepted fixture data. */
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'./black-gold-playwright.mjs');const origin=process.env.KO_QA_ORIGIN??'http://127.0.0.1:5186';assert.equal(new URL(origin).hostname,'127.0.0.1');
const out='qa-results/admin-session-music';await mkdir(out,{recursive:true});const results=[],errors=[];const admin={id:'local-admin',nickname:'local',role:'ADMIN',isTestAccount:false};
const browser=await chromium.launch({headless:true,...(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{}:{})});
try{for(const scenario of ['fast-admin','pending-admin','guest','music']){
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));let checks=0;const writes=[],pending=[];
 let media=['VICTORY_BGM','DEFEAT_BGM'].map((mediaType,i)=>({id:'result-'+i,mediaType,name:i?'패배 곡':'승리 곡',assetUrl:'/local-result.ogg',volume:75,gameEnabled:true,titleEnabled:false,fileName:'local.ogg',contentType:'audio/ogg'}));
 await ctx.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),p=url.pathname;if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();if(!p.includes('/api/'))return route.continue();
 if(p==='/api/auth/me'){pending.push(route);return;}
 if(p==='/api/admin/session'){
  checks++;if(scenario==='pending-admin'){pending.push(route);return;}
  return route.fulfill({json:{authenticated:scenario!=='guest',user:scenario==='guest'?null:admin}});
 }
 let json={};if(p==='/api/healthz')json={status:'ok'};else if(p==='/api/server-status')json={enabled:false,allowed:true};
 else if(p==='/api/auth/login'){writes.push(p);json={authenticated:true,user:admin};}
 else if(p==='/api/admin/game-media'){json={media};}
 else if(p.startsWith('/api/admin/game-media/')&&req.method()==='PATCH'){const patch=req.postDataJSON();writes.push({path:p,patch});media=media.map(m=>p.endsWith(m.id)?{...m,...patch}:m);json={media:media.find(m=>p.endsWith(m.id))};}
 else if(p==='/api/admin/cards')json={cards:[]};else if(p==='/api/admin/champions')json={champions:[]};else if(p==='/api/admin/packs')json={packs:[]};
 await route.fulfill({json});});
 await page.goto(origin+(scenario==='music'?'/admin/media':'/admin'));
 if(scenario==='pending-admin'){
  await page.getByRole('textbox',{name:'이메일',exact:true}).waitFor({timeout:5000});assert.equal(checks,1);
  await page.getByRole('textbox',{name:'이메일',exact:true}).fill('local@admin.invalid');await page.getByLabel('비밀번호',{exact:true}).fill('Local12345!');await page.getByRole('button',{name:'로그인',exact:true}).last().click();
  await page.getByRole('heading',{name:'운영 개요',exact:true}).waitFor();assert.deepEqual(writes,['/api/auth/login']);
  // Late old session response must not undo the explicit successful login.
  for(const route of pending.filter(r=>new URL(r.request().url()).pathname==='/api/admin/session'))await route.fulfill({json:{authenticated:false,user:null}}).catch(()=>{});
  await page.waitForTimeout(200);await page.getByRole('heading',{name:'운영 개요',exact:true}).waitFor();
 }else if(scenario==='guest'){await page.getByRole('heading',{name:'관리자 권한이 필요합니다'}).waitFor();assert.equal(writes.length,0);}
 else if(scenario==='fast-admin'){await page.getByRole('heading',{name:'운영 개요',exact:true}).waitFor({timeout:5000});assert.equal(checks,1);assert.equal(writes.length,0);}
 else{
  await page.getByRole('tab',{name:'승리·패배 음악',exact:true}).click();const panel=page.getByRole('tabpanel').filter({has:page.getByRole('heading',{name:'승리 음악',exact:true})});
  await page.getByRole('heading',{name:'승리 음악',exact:true}).waitFor();await page.getByRole('heading',{name:'패배 음악',exact:true}).waitFor();
  assert.equal(await panel.locator('input[type=file]').count(),2);assert.equal(await panel.getByRole('button',{name:'미리듣기',exact:true}).count(),2);
  await panel.getByRole('checkbox',{name:'In-Game'}).first().click();await page.waitForFunction(()=>!document.querySelector('[data-admin-panel=admin-game-media-result] input[type=checkbox]').checked);assert.equal(writes.length,1);assert.deepEqual(writes[0].patch,{gameEnabled:false});
  const range=panel.locator('input[type=range]').last();await range.fill('40');await range.dispatchEvent('change');await page.waitForFunction(()=>document.body.textContent.includes('볼륨 40%'));assert.ok(writes.some(w=>w.patch?.volume===40));
  await page.screenshot({path:out+'/result-music-mobile.png',fullPage:true});
 }
 await page.screenshot({path:out+'/'+scenario+'.png',fullPage:true});results.push(scenario+' PASS');await ctx.close();
}assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));}finally{await browser.close();}
