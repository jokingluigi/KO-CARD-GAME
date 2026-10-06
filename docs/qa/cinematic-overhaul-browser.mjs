import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch({...(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{}:{channel:'chrome'}),headless:true});
const results=[],failures=[],output=process.env.KO_QA_SCREENSHOTS;if(output)mkdirSync(output,{recursive:true});
for(const [name,width,height,reduced] of [['desktop',1280,800,false],['mobile',390,844,false],['small',320,568,false],['landscape',844,390,false],['slow-mobile',390,844,false],['reduced',390,844,true]]){
const context=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});
const page=await context.newPage();page.on('pageerror',e=>failures.push(name+': '+e.message));
if(name==='slow-mobile')await(await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate',{rate:4});
await page.goto((process.env.KO_QA_ORIGIN??'http://localhost:5173')+'/qa/overhaul.html'+(process.env.KO_QA_ART?'?art='+encodeURIComponent(process.env.KO_QA_ART):''));
await page.getByTestId('ATTACK').waitFor();
const observed=[];
for(const kind of ['ATTACK','SUMMON','ABILITY','BIG_SPELL','LEGENDARY','CHAMPION','AWAKENING','BOSS','HIDDEN_BOSS','FINISHER']){
await page.getByTestId(kind).click();
await page.locator('[data-cinematic-kind="'+kind+'"]').waitFor();
if(!reduced&&kind==='AWAKENING'){
await page.waitForTimeout(300);
const bounds=await page.locator('.ko-cinematic__panel').boundingBox();
if(!bounds||bounds.x<0||bounds.y<0||bounds.x+bounds.width>width+1||bounds.y+bounds.height>height+1)failures.push(name+': clipped cut-in');
if(output)await page.screenshot({path:output+'/'+name+'-awakening.png'});
}
observed.push({kind,level:await page.locator('.ko-cinematic').getAttribute('data-camera-level')});
await page.getByTestId('input').click();
await page.waitForFunction(()=>!document.querySelector('.ko-cinematic'),{},{timeout:6000});
const camera=await page.locator('.ko-game-stage').evaluate(e=>({translate:getComputedStyle(e).translate,scale:getComputedStyle(e).scale}));
if(camera.translate!=='none'||camera.scale!=='none')failures.push(name+': camera residue '+kind+JSON.stringify(camera));
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))failures.push(name+': overflow '+kind);
}
if(await page.getByTestId('counter').textContent()!=='10')failures.push(name+': cinematic blocked input');
await page.getByTestId('missing').click();await page.waitForFunction(()=>!document.querySelector('.ko-cinematic'),{},{timeout:5000});
await page.getByTestId('burst').click();await page.locator('[data-cinematic-kind="FINISHER"]').waitFor();
if(await page.locator('.ko-cinematic').count()!==1)failures.push(name+': major scenes overlap');
await page.waitForFunction(()=>!document.querySelector('.ko-cinematic'),{},{timeout:10000});
await page.getByTestId('AWAKENING').click();await page.getByTestId('reset').click();await page.waitForTimeout(80);
if(await page.locator('.ko-cinematic').count())failures.push(name+': reconnect failed reset');
await page.getByTestId('BOSS').click();await page.setViewportSize({width:width+1,height});await page.waitForTimeout(80);
if(await page.locator('.ko-cinematic').count())failures.push(name+': resize failed reset');
await page.getByTestId('fast').click();await page.getByTestId('ABILITY').click();const duration=await page.locator('.ko-cinematic').evaluate(e=>e.style.getPropertyValue('--cinematic-duration'));
if(duration!==(reduced?'160ms':'455ms'))failures.push(name+': fast duration '+duration);
await page.waitForFunction(()=>!document.querySelector('.ko-cinematic'));
results.push({name,observed,input:'PASS',reset:'PASS',missingArt:'PASS',burst:'PASS',fast:duration});
await context.close();
}
await browser.close();console.log(JSON.stringify({results,failures},null,2));if(failures.length)process.exitCode=1;
