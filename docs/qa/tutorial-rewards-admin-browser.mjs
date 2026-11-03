import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startTutorialFixture} from './tutorial-rewards-fixture.mjs';
import {chromium} from './black-gold-playwright.mjs';
import {auditSetup} from './ui-audit-fixture.mjs';
const fixture=await startTutorialFixture(),browser=await chromium.launch();
const origin=process.env.KO_UI_ORIGIN??'http://127.0.0.1:5186',out=process.env.KO_TUTORIAL_ADMIN_OUT??'qa-results/tutorial-rewards-admin';await mkdir(out,{recursive:true});
try{
 const p=await browser.newPage({viewport:{width:390,height:844},ignoreHTTPSErrors:true});await auditSetup(p);
 const adminSession=r=>r.fulfill({json:{authenticated:true,user:{id:'tutorial-user',role:'ADMIN',nickname:'검증 관리자',currencyBalance:0,prismBalance:0,championPrismBalance:0}}});
 await p.route('**/api/admin/session',adminSession);
 await p.route('**/api/auth/me',r=>r.fulfill({json:{authenticated:true,user:{id:'tutorial-user',role:'ADMIN',nickname:'검증 관리자',currencyBalance:0,prismBalance:0,championPrismBalance:0}}}));
 await p.route('**/api/tutorial/**',async r=>{const q=r.request(),response=await fetch(fixture.origin+new URL(q.url()).pathname,{method:q.method(),headers:{Cookie:fixture.cookie,'Content-Type':'application/json'},...(q.method()!=='GET'?{body:q.postData()}: {})});return r.fulfill({status:response.status,contentType:'application/json',body:await response.text()});});
 await p.route('**/api/admin/rewards',async r=>{const response=await fetch(fixture.origin+'/api/admin/rewards',{headers:{Cookie:fixture.cookie}});return r.fulfill({status:response.status,contentType:'application/json',body:await response.text()});});
 await p.goto(origin+'/admin/rewards');
 const panel=p.getByRole('region',{name:'튜토리얼 보상 설정'});await panel.waitFor();
 await p.getByRole('combobox',{name:'노멀팩 보상 연결'}).selectOption('normal-pack');
 await p.getByRole('combobox',{name:'확정 챔피언팩 보상 연결'}).selectOption('champion-pack');
 await panel.getByRole('button',{name:'튜토리얼 보상 저장'}).click();
 await panel.getByText('튜토리얼 보상 팩을 저장했어요.').waitFor();
 await p.reload();await panel.waitFor();
 await p.waitForFunction(()=>document.querySelector('select[aria-label="노멀팩 보상 연결"]')?.value==='normal-pack');
 assert.equal(await p.getByRole('combobox',{name:'확정 챔피언팩 보상 연결'}).inputValue(),'champion-pack');
 await panel.scrollIntoViewIfNeeded();await p.screenshot({path:out+'/admin-config-390.png'});
 await writeFile(out+'/results.json',JSON.stringify({actualAdminForm:true,isolatedServerSaveAndReentry:true,normalPack:'normal-pack',championPack:'champion-pack',productionWrites:0},null,2));
}finally{await browser.close();await fixture.close();}
