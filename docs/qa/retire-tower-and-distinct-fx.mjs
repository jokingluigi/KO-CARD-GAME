import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const out='qa-results/retire-tower';await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[];
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:1}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/'))requests.push(new URL(r.url()).pathname);});
  await page.route('**/api/**',r=>r.fulfill({json:{authenticated:true,user:{id:'local-qa',role:'ADMIN',nickname:'QA',email:'qa@local.invalid'},cards:[],champions:[],packs:[],cosmetics:[],frames:[],notices:[],backgrounds:[],bgms:[],enabled:false,availableCount:0}}));
  await page.goto('http://127.0.0.1:5186/tower');await page.getByRole('heading',{name:'이 화면을 찾을 수 없어요'}).waitFor();
  await page.goto('http://127.0.0.1:5186/admin');await page.getByRole('button',{name:/카드 편집/}).first().waitFor();assert.equal(await page.getByText(/타워/).count(),0);
  assert.ok(requests.every(path=>!path.includes('/tower')),requests.filter(path=>path.includes('/tower')).join(','));
  assert.deepEqual(errors,[]);results.push({mobile,retiredRoute404:true,adminRemoved:true,mainMenuRemoved:true,noRetiredApiRequests:true});await context.close();
 }
 await writeFile(out+'/browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(r=>({mobile:r.mobile,removed:true}))));
}finally{await browser.close();}
