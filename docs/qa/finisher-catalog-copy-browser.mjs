import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const data=JSON.parse(await readFile('docs/qa/snapshots/20261118-admin/finisher-regression.json','utf8'));
const out='qa-results/finisher-catalog-copy';await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[];
try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;let json={cards:[],champions:[],frames:[],bgms:[],backgrounds:[],favorites:[],enabled:false,allowed:true};
  if(path==='/api/auth/me')json={authenticated:true,user:{id:'finisher-copy-qa',nickname:'QA',role:'USER',isTestAccount:false}};
  else if(path==='/api/collection')json={cards:[],craftableCards:[],champions:data.champions.map(c=>({...c,owned:true})),prismBalance:0,championPrismBalance:0,championPrismSetting:{configured:false},prismSettings:[]};
  else if(path==='/api/cards')json={cards:data.cards};else if(path==='/api/champions')json={champions:data.champions};
  return route.fulfill({json});});
 await page.goto('http://127.0.0.1:5186/collection');await page.getByRole('button',{name:/^챔피언\s+2/}).click();
 for(const name of ['로지양','라 칼라베라']){
  await page.getByRole('button').filter({has:page.getByRole('heading',{name,exact:true})}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  if(name==='로지양'){await dialog.getByText(/어셈블: 카드 총 12회 생성/).waitFor();assert.match(await dialog.innerText(),/흉내내기: 레전더리 혹은 챔피언/);assert.match(await dialog.innerText(),/피니셔를 손패에 추가/);}
  else {await dialog.getByText(/연결한 피니셔를 손패에 추가/).waitFor();assert.match(await dialog.innerText(),/언데드.*8장/);}
  assert.doesNotMatch(await dialog.innerText(),/고유 능력이 강화됩니다|준비 조건 정보가 없습니다|다음 턴 골드 0/);await page.screenshot({path:`${out}/${width}-${name}.png`});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 }
 assert.deepEqual(errors,[]);results.push({width,rosieConditionsAndRewards:true,calaveraFinisherReward:true,legacyUpgradeHidden:true,scriptErrors:0});await context.close();
}await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
