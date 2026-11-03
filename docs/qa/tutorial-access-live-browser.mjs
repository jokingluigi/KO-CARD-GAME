/** Public deployed rules only; fresh anonymous contexts and no production writes. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const origin=process.env.KO_UI_ORIGIN??'https://ko-card-game-vr69.onrender.com';
const out=process.env.KO_TUTORIAL_ACCESS_OUT??'qa-results/tutorial-access-live';
await mkdir(out,{recursive:true});const b=await chromium.launch();const results=[];
try{
 for(const [width,height] of [[390,844],[844,390],[1440,900]]){
  const p=await b.newPage({viewport:{width,height},ignoreHTTPSErrors:true});const writes=[],errors=[];
  await p.route('**/api/**',route=>{if(route.request().method()!=='GET'){writes.push(new URL(route.request().url()).pathname);return route.abort();}return route.continue();});
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/guide',{waitUntil:'domcontentloaded',timeout:60000});
  await p.getByRole('heading',{name:'게임 규칙',exact:true}).waitFor();
  await p.locator('.ko-guide-chapter h2').first().waitFor();assert.equal(await p.locator('.ko-guide-chapter h2').count(),5);
  await p.getByRole('button',{name:'챔피언·토큰',exact:true}).click();assert.equal(await p.locator('.ko-guide details').count(),7);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:`${out}/public-rules-${width}x${height}.png`,fullPage:false});
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  results.push({width,height,livePublicRules:true,chapters:5,championTokenQuestions:7,noHorizontalOverflow:true,productionWrites:0,errors});await p.context().close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await b.close();}
