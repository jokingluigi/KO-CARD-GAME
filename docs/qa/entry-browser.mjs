// Production-entry regression guard. All API responses are isolated test routes.
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch({headless:true,...(process.env.KO_QA_CHROME_CHANNEL?{channel:process.env.KO_QA_CHROME_CHANNEL}:{})});
const guest={authenticated:false,user:null},allowed={enabled:false,allowed:true,message:''};
const account={id:'entry-qa',email:'entry@example.invalid',nickname:'ENTRY_QA',role:'USER',currency:0,currencyBalance:0,prismBalance:0,championPrismBalance:0,isTestAccount:false};
const results=[],failures=[];
for(const [name,width,height] of [['desktop',1280,800],['mobile',390,844]])for(const mode of ['pending','failed-status','maintenance','admin','login-race','restored-session','login-timeout']){
 console.log('entry scenario: '+name+'/'+mode);
 const context=await browser.newContext({viewport:{width,height}});
 await context.addInitScript(()=>{
  window.__koEntryRegressions=[];
  const observer=new MutationObserver(()=>{if(/서버\s*연결\s*중/.test(document.body?.innerText??''))window.__koEntryRegressions.push(true);});
  observer.observe(document,{childList:true,subtree:true,characterData:true});
 });
 const page=await context.newPage(),pending=[];let requests=0,checks=0,loginAttempts=0;
 page.on('pageerror',e=>failures.push(name+'/'+mode+': '+e.message));
 await page.route('https://fonts.**',r=>r.abort());
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/server-status')){
   checks++;
   if(mode==='pending'||mode==='login-race')return new Promise(resolve=>pending.push(async()=>{await route.fulfill({json:allowed});resolve();}));
   if(mode==='failed-status')return route.fulfill({status:503,json:{message:'temporary failure'}});
   return route.fulfill({json:mode==='maintenance'?{enabled:true,allowed:false,message:'QA scheduled maintenance'}:mode==='admin'?{enabled:true,allowed:true,message:'QA scheduled maintenance'}:allowed});
  }
  if(path.endsWith('/auth/me')){
   requests++;
   if(mode==='pending'||mode==='login-race')return new Promise(resolve=>pending.push(async()=>{await route.fulfill({json:guest});resolve();}));
   return route.fulfill({json:mode==='restored-session'||mode==='admin'?{authenticated:true,user:{...account,role:mode==='admin'?'ADMIN':'USER'}}:guest});
  }
  if(path.endsWith('/auth/login')){
   if(mode==='login-timeout'&&++loginAttempts===1)return new Promise(resolve=>pending.push(async()=>{try{await route.fulfill({json:guest});}catch{}resolve();}));
   return route.fulfill({json:{authenticated:true,user:account}});
  }
  if(path.endsWith('/main-content'))return route.fulfill({json:{notices:[],background:null,bgm:null}});
  if(path.endsWith('/availability'))return route.fulfill({json:{available:false}});
  if(path.endsWith('/cards'))return route.fulfill({json:{cards:[]}});
  if(path.endsWith('/champions'))return route.fulfill({json:{champions:[]}});
  return route.fulfill({json:{}});
 });
 try{
  await page.goto((process.env.KO_QA_ORIGIN??'http://localhost:5173')+'/',{waitUntil:'domcontentloaded'});
  if(mode==='maintenance'){
   await page.getByText('QA scheduled maintenance',{exact:true}).waitFor({timeout:5000});
   if(await page.locator('input[type="email"]').count())throw Error('normal form remains after confirmed maintenance denial');
  }else if(mode==='restored-session'||mode==='admin'){
   await page.getByText('ENTRY_QA',{exact:true}).waitFor({timeout:5000});
  }else{
   const email=page.locator('input[type="email"]');
   await email.waitFor({timeout:5000});
   await email.fill('entry@example.invalid');
   if(mode==='login-timeout'){
    await page.locator('input[type="password"]').fill('test-only-password');
    const submit=page.locator('button[type="submit"]');
    await submit.click();
    await page.getByText('서버 응답이 지연되고 있습니다. 잠시 후 다시 로그인해 주세요.',{exact:true}).waitFor({timeout:25000});
    if(await submit.isDisabled())throw Error('login form stayed disabled after timeout');
    await submit.click();
    await page.getByText('ENTRY_QA',{exact:true}).waitFor({timeout:5000});
   }
   if(mode==='login-race'){
    await page.locator('input[type="password"]').fill('test-only-password');
    await page.locator('button[type="submit"]').click();
    await page.getByText('ENTRY_QA',{exact:true}).waitFor({timeout:5000});
   }
   await Promise.all(pending.splice(0).map(release=>release()));
   await page.waitForTimeout(300);
   if(mode==='login-race'||mode==='login-timeout'){
    await page.getByText('ENTRY_QA',{exact:true}).waitFor();
    if(await email.count())throw Error('late guest response overwrote successful login');
   }else if(await email.inputValue()!=='entry@example.invalid')throw Error('status/auth response cleared the typed form');
  }
  await page.waitForTimeout(100);
  const flashes=await page.evaluate(()=>window.__koEntryRegressions.length);
  if(flashes)throw Error('server connection screen appeared '+flashes+' times');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('horizontal overflow');
  results.push({name,mode,requests,checks,flashes});
 }catch(e){failures.push(name+'/'+mode+': '+e.message);}
 await Promise.all(pending.splice(0).map(release=>release().catch(()=>{})));await context.close();
}
await browser.close();console.log(JSON.stringify({results,failures},null,2));if(failures.length)process.exitCode=1;
