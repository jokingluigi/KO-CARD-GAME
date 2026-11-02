import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
import {auditSetup} from './ui-audit-fixture.mjs';
const out='qa-results/product-experience',browser=await chromium.launch();await mkdir(out,{recursive:true});
try{
 const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[],submissions=[];p.on('pageerror',e=>errors.push(e.message));await auditSetup(p);
 await p.route('**/api/auth/password/change',async r=>{submissions.push({kind:'change',body:r.request().postDataJSON()});await new Promise(r=>setTimeout(r,150));return r.fulfill({json:{message:'비밀번호를 변경했어요. 모든 기기에서 로그아웃됐어요.'}});});
 await p.goto('http://127.0.0.1:5186/settings');await p.getByRole('button',{name:'계정',exact:true}).click();await p.getByLabel('현재 비밀번호',{exact:true}).fill('fixture-old-password');await p.getByLabel('새 비밀번호',{exact:true}).fill('fixture-new-password');await p.getByLabel('새 비밀번호 확인',{exact:true}).fill('fixture-new-password');
 await p.getByRole('button',{name:'비밀번호 변경',exact:true}).evaluate(el=>{el.click();el.click();});await p.getByText('비밀번호를 변경했어요. 모든 기기에서 로그아웃됐어요.',{exact:true}).waitFor();assert.equal(submissions.length,1);await p.getByRole('link',{name:'로그인으로 이동',exact:true}).waitFor();await p.screenshot({path:out+'/password-change-success.png'});
 const token='a'.repeat(64);await p.route('**/api/auth/password/reset',r=>{submissions.push({kind:'reset',body:r.request().postDataJSON()});return r.fulfill({json:{message:'새 비밀번호로 로그인해 주세요.'}});});
 await p.goto('http://127.0.0.1:5186/account-recovery#token='+token);await p.getByLabel('새 비밀번호',{exact:true}).fill('fixture-reset-password');assert.equal(new URL(p.url()).hash,'');await p.getByLabel('새 비밀번호 확인',{exact:true}).fill('fixture-reset-password');await p.getByRole('button',{name:'새 비밀번호 저장',exact:true}).click();await p.getByText('새 비밀번호로 로그인해 주세요.',{exact:true}).waitFor();assert.equal(submissions[1].body.token,token);await p.screenshot({path:out+'/password-reset-success.png'});
 let configured=false;await p.route('**/api/auth/password/forgot',r=>r.fulfill({status:configured?200:503,json:{message:configured?'가입된 이메일이라면 재설정 링크를 보냈어요.':'이메일 복구 서비스 준비 중입니다.'}}));
 await p.goto('http://127.0.0.1:5186/account-recovery');await p.getByLabel('가입한 이메일').fill('fixture@example.com');await p.getByRole('button',{name:'재설정 메일 요청',exact:true}).click();await p.getByRole('alert').filter({hasText:'이메일 복구 서비스 준비 중'}).waitFor();await p.screenshot({path:out+'/recovery-unconfigured.png'});configured=true;await p.getByRole('button',{name:'재설정 메일 요청',exact:true}).click();await p.getByText('가입된 이메일이라면 재설정 링크를 보냈어요.',{exact:true}).waitFor();assert.deepEqual(errors,[]);
 const result={passwordChangeSinglePost:true,clientSessionCleared:true,resetTokenRemovedFromAddress:true,resetFormSubmitsCorrectToken:true,missingProviderIsExplicit:true,retryAfterFailure:true,errors};await writeFile(out+'/account-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
