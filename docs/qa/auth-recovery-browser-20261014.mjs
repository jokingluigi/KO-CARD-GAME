import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch({...(process.env.KO_QA_CHROME_EXECUTABLE?{executablePath:process.env.KO_QA_CHROME_EXECUTABLE}:{channel:process.env.KO_QA_CHROME_CHANNEL??'chromium'}),headless:true});
const user={id:'recovery-qa',email:'recovery@example.invalid',nickname:'RECOVERY_QA',role:'ADMIN',currency:0,currencyBalance:0,prismBalance:0,championPrismBalance:0,isTestAccount:false};
const results=[],errors=[];
try {
 for(const width of [390,1440])for(const mode of ['automatic','online']){
  const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();let authReads=0,available=false;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.**',route=>route.abort());
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   assert.equal(route.request().method(),'GET','session recovery must not submit a login or other write');
   if(path.endsWith('/auth/me')){authReads++;return available?route.fulfill({json:{authenticated:true,user}}):route.fulfill({status:503,json:{message:'temporary upstream failure'}});}
   return route.fulfill({json:{enabled:false,allowed:true,message:'',cards:[],champions:[],packs:[],packDefinitions:[],tags:[],seasons:[],relics:[],metadata:[],starters:[],presets:[],characters:[],scenes:[],stats:{}}});
  });
  await page.goto((process.env.KO_QA_ORIGIN??'http://127.0.0.1:5173')+'/admin');
  await page.locator('input[type=email]').waitFor({timeout:10000});
  await page.locator('input[type=email]').fill('preserve@example.invalid');
  await page.locator('input[type=password]').fill('fixture-password');
  await page.getByText('서버 응답을 기다리고 있어.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'다시 확인',exact:true}).click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('input[type=email]').inputValue(),'preserve@example.invalid');
  assert.equal(await page.locator('input[type=password]').inputValue(),'fixture-password');
  const failedReads=authReads;available=true;
  if(mode==='online')await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.getByRole('heading',{name:'운영 개요',exact:true}).waitFor({timeout:12000});
  assert.equal(await page.locator('input[type=email]').count(),0);
  assert.equal(authReads,failedReads+1,'restore through one fresh read; preserve the existing session without logging in');
  results.push({width,mode,passed:true,authReads});await context.close();
 }
 assert.deepEqual(errors,[]);
 fs.mkdirSync('.local/qa/auth-outage',{recursive:true});fs.writeFileSync('.local/qa/auth-outage/browser.json',JSON.stringify({results,errors},null,2)+'\n');console.log(JSON.stringify({results,errors}));
} finally {await browser.close();}
