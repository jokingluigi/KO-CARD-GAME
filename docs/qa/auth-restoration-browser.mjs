// Browser UI regression with mocked auth responses; real cookie persistence is covered by awakening-http.test.ts.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? 'playwright');
const browser=await chromium.launch({ ...(process.env.KO_QA_CHROME_EXECUTABLE ? { executablePath: process.env.KO_QA_CHROME_EXECUTABLE } : { channel: process.env.KO_QA_CHROME_CHANNEL ?? 'chromium' }), headless:true });
try {
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const user={id:'browser-auth-qa',email:'qa@example.invalid',nickname:'세션복원QA',role:'USER',currency:0,currencyBalance:0,prismBalance:0,championPrismBalance:0,isTestAccount:false};
 let authCalls=0,release;
 const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/auth/me'){authCalls++;await gate;return route.fulfill({json:{authenticated:true,user}});}
  if(url.pathname==='/api/server-status')return route.fulfill({json:{enabled:false,allowed:true,message:''}});
  if(url.pathname==='/api/main-content')return route.fulfill({json:{notices:[],background:null,bgm:null}});
  return route.fulfill({json:{cards:[],champions:[],decks:[],frames:[],items:[],media:[]}});
 });
 await page.goto(`${process.env.KO_QA_ORIGIN ?? 'http://127.0.0.1:5173'}/`);
 await page.locator('.ko-auth-loading').waitFor();
 assert.equal(await page.locator('input[type=email]').count(),0,'pending session restore must not show a logout/login form');
 release();await page.getByText(user.nickname,{exact:true}).waitFor();
 assert.equal(authCalls,1);
 const before=authCalls;
 await page.getByTestId('button-main-menu-덱 편집').click();
 await page.waitForURL('**/decks');await page.waitForTimeout(300);
 assert.equal(authCalls,before,'navigation should reuse a confirmed session');
 await page.reload();await page.waitForTimeout(300);
 assert.equal(authCalls,before+1,'reload verifies the session with the server');
 console.log('Session restore without login flash, navigation reuse, and reload verification passed');
}finally{await browser.close();}
