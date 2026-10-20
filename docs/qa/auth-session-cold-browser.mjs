/** Restore a real existing-session-shaped response after a cold start, without a login POST. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch({headless:true,...(process.env.KO_QA_CHROME_EXECUTABLE?{executablePath:process.env.KO_QA_CHROME_EXECUTABLE}:{channel:process.env.KO_QA_CHROME_CHANNEL??'chromium'})});
const origin=process.env.KO_QA_ORIGIN??'http://127.0.0.1:5181';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const user={id:'cold-session-fixture',email:'cold@example.invalid',nickname:'COLD',role:'USER',currency:0,currencyBalance:0,prismBalance:0,championPrismBalance:0,isTestAccount:false};
const results=[];
try{
 for(const [width,delay] of [[390,25000],[1440,9000]]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  let reads=0,writes=0;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   if(route.request().method()!=='GET'){writes++;return route.fulfill({status:500,json:{}});}
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/auth/me'){
    reads++;await new Promise(resolve=>setTimeout(resolve,delay));
    return route.fulfill({json:{authenticated:true,user}});
   }
   if(path==='/api/server-status')return route.fulfill({json:{enabled:false,allowed:true,message:''}});
   if(path==='/api/main-content')return route.fulfill({json:{background:null,bgm:null,notices:[]}});
   return route.fulfill({json:{cards:[],champions:[],decks:[],frames:[],items:[],media:[]}});
  });
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  const email=page.locator('input[type=email]');await email.waitFor({timeout:5000});
  await email.fill('input-preserved@example.invalid');
  await page.waitForTimeout(delay-4000);
  assert.equal(await email.inputValue(),'input-preserved@example.invalid');
  assert.equal(await page.getByRole('heading',{name:'로그인 연결이 지연되고 있어',exact:true}).count(),0);
  await page.locator('.ko-main-menu').waitFor({timeout:10000});
  assert.equal(reads,1,'keep the initial session GET alive across the old eight-second cutoff');
  assert.equal(writes,0,'restore the existing session without passwords, new login or logout');
  assert.deepEqual(errors,[]);
  results.push({width,delayMs:delay,sessionReads:reads,writes,passed:true});await context.close();
 }
 await mkdir('qa-results/auth-startup',{recursive:true});
 await writeFile('qa-results/auth-startup/cold-session.json',JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify(results));
}finally{await browser.close();}
