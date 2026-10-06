import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch({...(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{}:{channel:'chrome'}),headless:true});
const failures=[],results=[];
const output=process.env.KO_QA_SCREENSHOTS;if(output)mkdirSync(output,{recursive:true});
for(const [name,width,height,reduced] of [['desktop',1280,800,false],['mobile',390,844,false],['small',320,568,false],['mobile-throttled',390,844,false],['reduced',390,844,true]]){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});
 const page=await context.newPage();if(name==='mobile-throttled'){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}page.on('pageerror',e=>failures.push(name+': '+e.message));
 await page.route('**/api/card-frames',r=>r.fulfill({json:{frames:[]}}));
 await page.goto((process.env.KO_QA_ORIGIN??'http://localhost:5173')+'/qa/master.html');
 await page.getByTestId('state-check').waitFor();
 const observed=[];
 for(const action of ['draw','damage','buff','silence','retire','reset','destroy','reset','attack','turn','restore','burst']){
  await page.getByTestId(action).click();
  await page.waitForTimeout(60);
  if(['damage','silence','attack'].includes(action))observed.push([action,await page.locator('.presentation-feedback').getAttribute('class').catch(()=>null)]);
  await page.waitForFunction(()=>!document.querySelector('.presentation-feedback,.card-leave-animation,.card-play-animation,.quest-presentation,.ko-draw-flight'),{},{timeout:12000});
  await page.waitForTimeout(450);
  const check=await page.getByTestId('state-check').textContent();
  if(!check?.startsWith('UNCHANGED busy:false'))failures.push(name+': '+action+' '+check);
  const geometry=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,animations:document.getAnimations().filter(a=>a.playState==='running').length}));
  if(geometry.width>width+1)failures.push(name+': overflow '+action+' '+JSON.stringify(geometry));
 }
 if(output)await page.screenshot({path:output+'/'+name+'-master.png'});
 results.push({name,observed,check:await page.getByTestId('state-check').textContent()});
 await context.close();
}
await browser.close();console.log(JSON.stringify({results,failures},null,2));if(failures.length)process.exitCode=1;
