import {mkdirSync} from 'node:fs';const {chromium}=await import(process.env.KO_QA_PLAYWRIGHT??'playwright');
const browser=await chromium.launch({...(process.env.KO_QA_CHROME_CHANNEL==='chromium'?{}:{channel:'chrome'}),headless:true});
const results=[],failures=[],output=process.env.KO_QA_SCREENSHOTS;if(output)mkdirSync(output,{recursive:true});
for(const [name,width,height,reduced] of [['desktop',1280,800,false],['mobile',390,844,false],['small',320,568,false],['landscape',844,390,false],['slow-mobile',390,844,false],['reduced',390,844,true]]){
 const mobile=name!=='desktop',context=await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile,reducedMotion:reduced?'reduce':'no-preference'});
 const page=await context.newPage();page.on('pageerror',e=>failures.push(name+': '+e.message));
 await page.addInitScript(()=>{window.__impactSounds=[];window.__impactHaptics=[];const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__impactSounds.push({src:this.src,time:performance.now()});return original.call(this);};Object.defineProperty(navigator,'vibrate',{value:n=>{window.__impactHaptics.push(n);return true;},configurable:true});});
 await page.route('**/api/card-frames',r=>r.fulfill({json:{frames:[]}}));
 if(name==='slow-mobile')await(await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate',{rate:4});
 await page.goto((process.env.KO_QA_ORIGIN??'http://localhost:5173')+'/qa/impact.html');await page.getByTestId('cost-1').waitFor();
 const samples=[];
 for(const [button,tier,landing,bass] of [['cost-1','LIGHT',187,null],['cost-2','LIGHT',202,null],['cost-3','MEDIUM',230,null],['cost-4','MEDIUM',252,null],['cost-5','HEAVY',286,'heavy'],['cost-6','MASSIVE',326,'massive'],['EPIC','MASSIVE',326,'massive'],['LEGENDARY','MASSIVE',639,'massive'],['CHAMPION','MASSIVE',558,'champion']]){
  console.log(name,button);await page.evaluate(()=>{window.__impactSounds=[];window.__impactHaptics=[];});await page.getByTestId(button).click();
  await page.waitForFunction(t=>document.querySelector('[data-screen-impact="'+t+'"]'),tier,{polling:'raf',timeout:4000});
  const start=await page.evaluate(()=>{const stage=document.querySelector('.ko-game-stage'),card=document.querySelector('.card-play-animation__card'),motion=card?.getAnimations().find(a=>a.effect?.target===card);return {amplitude:Number(stage.dataset.screenImpactAmplitude),time:Number(stage.dataset.screenImpactStarted),cardClock:Number(motion?.currentTime??-1),sounds:window.__impactSounds,haptics:window.__impactHaptics,wave:document.querySelector('.ko-screen-impact__wave')?.getBoundingClientRect().width};});
  if(!reduced&&start.cardClock>=0&&Math.abs(start.cardClock-landing)>(name==='slow-mobile'?120:70))failures.push(name+': landing drift '+button+' '+start.cardClock);
  const sound=start.sounds.find(s=>s.src.includes('/sfx/impact-'));
  if(!sound||Math.abs(sound.time-start.time)>35)failures.push(name+': sound and shake diverged '+button);
  const bassSound=start.sounds.find(s=>s.src.includes('/summon-bass-'));
  if(bass&&!bassSound?.src.includes('summon-bass-'+bass+'.wav'))failures.push(name+': bass missing '+button);
  if(!bass&&bassSound)failures.push(name+': low card got bass');
  if(bassSound&&Math.abs(bassSound.time-start.time)>35)failures.push(name+': bass out of sync '+button);
  if(reduced&&(start.amplitude!==0||start.haptics.length))failures.push(name+': reduced motion shook or vibrated');
  if(mobile&&!reduced&&['cost-5','cost-6','LEGENDARY','CHAMPION'].includes(button)&&start.haptics.length!==1)failures.push(name+': haptic not one shot '+button);
  const peak=await page.evaluate(()=>new Promise(resolve=>{let max=0,rot=0;const stage=document.querySelector('.ko-game-stage'),begin=performance.now();const tick=()=>{const style=getComputedStyle(stage);const nums=style.translate.split(' ').map(parseFloat);max=Math.max(max,Math.hypot(nums[0]||0,nums[1]||0));rot=Math.max(rot,Math.abs(parseFloat(style.rotate)||0));if(performance.now()-begin<350)requestAnimationFrame(tick);else resolve({max,rot});};tick();}));
  if(peak.max>22.1||peak.rot>.71)failures.push(name+': movement exceeded cap '+button+' '+JSON.stringify(peak));
  if(output&&button==='cost-6')await page.screenshot({path:output+'/'+name+'-cost6-settle.png'});
  samples.push({button,tier,amplitude:start.amplitude,peak:peak.max,bass:!!bassSound,clock:start.cardClock});
  await page.waitForFunction(()=>!document.querySelector('.card-play-animation,.ko-screen-impact'),{},{timeout:6000});
  const residue=await page.locator('.ko-game-stage').evaluate(e=>({translate:getComputedStyle(e).translate,rotate:getComputedStyle(e).rotate,scale:getComputedStyle(e).scale}));
  if(Object.values(residue).some(v=>v!=='none'))failures.push(name+': board failed return '+JSON.stringify(residue));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))failures.push(name+': horizontal overflow');
 }
 if(!reduced&&!(samples[5].amplitude>samples[0].amplitude*3&&samples[7].amplitude>samples[5].amplitude&&samples[8].amplitude>samples[7].amplitude))failures.push(name+': cost/rarity not distinct');
 for(const [button,tier] of [['damage-1','LIGHT'],['damage-3','MEDIUM'],['damage-6','HEAVY'],['damage-10','MASSIVE'],['lethal','FINISHER'],['awakening','MASSIVE'],['priority','FINISHER']]){
  console.log(name,button);await page.getByTestId(button).click();await page.waitForFunction(t=>document.querySelector('[data-screen-impact="'+t+'"]'),tier,{polling:'raf',timeout:4000});if(await page.locator('.ko-screen-impact').count()!==1)failures.push(name+': shake stacked');await page.waitForFunction(()=>!document.querySelector('.attack-animation,.ko-screen-impact'),{},{timeout:4000});
 }
 const select=page.getByRole('combobox');
 for(const [mode,multiplier] of [['REDUCED',.5],['OFF',0],['FULL',1]]){
  await select.selectOption(mode);await page.getByTestId('cost-6').click();await page.waitForFunction(()=>document.querySelector('[data-screen-impact="MASSIVE"]'),{},{polling:'raf',timeout:4000});
  const a=await page.locator('.ko-game-stage').getAttribute('data-screen-impact-amplitude');
  if(Math.abs(Number(a)-samples[5].amplitude*multiplier)>.001)failures.push(name+': '+mode+' incorrect '+a);
  await page.waitForFunction(()=>!document.querySelector('.card-play-animation,.ko-screen-impact'));
 }
 await select.selectOption('OFF');await page.reload();if(await select.inputValue()!=='OFF')failures.push(name+': preference not retained');await select.selectOption('FULL');
 await page.getByTestId('LEGENDARY').click();await page.getByTestId('cancel').click();await page.waitForTimeout(1100);if(await page.locator('.ko-screen-impact').count())failures.push(name+': cancelled summon had late impact');
 await page.getByTestId('cost-6').click();await page.waitForFunction(()=>document.querySelector('.ko-screen-impact'),{},{polling:'raf',timeout:4000});await page.setViewportSize({width:width+1,height});await page.waitForTimeout(60);if(await page.locator('.ko-screen-impact').count())failures.push(name+': resize left impact');
 results.push({name,samples,modes:'PASS',priority:'PASS',cancel:'PASS'});await context.close();
}
await browser.close();console.log(JSON.stringify({results,failures},null,2));if(failures.length)process.exitCode=1;
