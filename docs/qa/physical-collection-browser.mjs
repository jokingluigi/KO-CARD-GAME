import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const out='qa-results/physical-collection';await mkdir(out,{recursive:true});
const browser=await chromium.launch(),results=[];
try{for(const [width,height]of [[390,844],[1440,900]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 const cards=['NORMAL','EPIC','LEGENDARY'].map((rarity,i)=>({id:'p-card-'+i,name:['검증 선수','검증 기술','검증 전설'][i],status:'PUBLISHED',rarity,cardType:i===1?'TECHNIQUE':'WRESTLER',text:'검증',cost:i+1,attack:2,health:4,quantity:1,imageUrl:'/api/storage/objects/uploads/cosmetics/p-base.png',imageDisplayMode:'CONTAIN',imageScale:1,imagePositionX:50,imagePositionY:50,entranceAudioEnabled:false}));
 const champion={id:'p-hero',name:'검증 챔피언',imageUrl:cards[0].imageUrl};
 const skin={id:'p-skin',targetId:champion.id,type:'CHAMPION_SKIN',name:'비교 스킨',description:'검증',sortOrder:0,isActive:true,imageAssets:{art:'/api/storage/objects/uploads/cosmetics/p-skin.png'}};
 const pack={id:'p-pack',name:'검증 팩',description:'미리 정해진 QA 보상',cardsPerPack:3,normalRate:100,epicRate:0,legendaryRate:0,championRate:0,skinChance:0,imageUrl:null,quantity:1};
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let json={};
  if(path.includes('/storage/'))return route.fulfill({body:await readFile('qa-results/final-ten-sprites/fixtures/'+(path.endsWith('p-skin.png')?'victory':'default')+'.png'),contentType:'image/png'});
  if(req.method()!=='GET')writes.push({path,method:req.method()});
  if(path.endsWith('/auth/me'))json={authenticated:true,user:{id:'p-user',nickname:'QA',role:'USER',currencyBalance:0,isTestAccount:false}};
  else if(path.endsWith('/server-status'))json={enabled:false,allowed:true};
  else if(path==='/api/online-matches/ws-ticket')return route.fulfill({status:503,json:{message:'isolated QA'}});
  else if(path==='/api/cosmetics')json={owned:[{item:skin,acquiredAt:'2026-10-29'}],cards,champions:[champion],loadout:{skins:{},emotes:[],cardBack:null}};
  else if(path==='/api/collection')json={cards,craftableCards:cards,champions:[],prismBalance:1000,championPrismBalance:0,championPrismSetting:{configured:false},prismSettings:[{rarity:'NORMAL',configured:true,craftCost:1,disenchantReward:1}],isTestAccount:false};
  else if(path==='/api/prism/craft/p-card-0'){cards[0].quantity++;json={card:cards[0],quantity:cards[0].quantity,prismBalance:999};}
  else if(path==='/api/packs')json={packs:[pack]};
  else if(path==='/api/packs/p-pack/open'){pack.quantity=0;json={rewards:cards.map(c=>({rewardType:c.rarity+'_CARD',cardDefinitionId:c.id,card:c,alreadyOwned:true}))};}
  else if(path.includes('/cards'))json={cards};else if(path.includes('/champions'))json={champions:[champion]};
  return route.fulfill({json});
 });
 await page.goto('http://127.0.0.1:5186/cosmetics');await page.getByRole('button',{name:'비교 스킨 기본 외형과 비교',exact:true}).click();await page.getByLabel('비교 스킨 비교 위치').waitFor();
 await page.getByLabel('비교 스킨 비교 위치').fill('75');assert.equal(await page.locator('.ko-skin-comparison > div').nth(1).evaluate(n=>n.style.clipPath),'inset(0px 0px 0px 75%)');await page.screenshot({path:`${out}/compare-${width}.png`});
 await page.goto('http://127.0.0.1:5186/collection');await page.locator('[data-motion-key="p-card-0"]').waitFor();
 await page.getByLabel('카드 이름 검색',{exact:true}).fill('검증 선수');await page.waitForFunction(()=>document.querySelectorAll('[data-motion-key]').length===1);await page.getByLabel('검색어 지우기').click();await page.waitForFunction(()=>document.querySelectorAll('[data-motion-key]').length===3);
 await page.locator('[data-motion-key="p-card-0"] .ko-card-depth').click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'제작',exact:true}).click();await page.getByRole('dialog',{name:'카드 제작 확인'}).getByRole('button',{name:'제작',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-motion-key="p-card-0"]')?.textContent.includes('×2'));
 await page.locator('.collection-action').waitFor({state:'detached'});await page.screenshot({path:`${out}/collection-${width}.png`});
 await page.goto('http://127.0.0.1:5186/packs');await page.getByTestId('button-open-pack-p-pack').click();await page.getByTestId('button-unseal-pack').waitFor();assert.equal(await page.getByTestId('button-reveal-reward-0').count(),0);
 await page.getByTestId('button-unseal-pack').click();await page.getByTestId('button-reveal-reward-0').waitFor();await page.waitForTimeout(400);await page.getByTestId('button-reveal-reward-0').click();assert.equal(await page.getByTestId('button-reveal-reward-0').getAttribute('data-pack-revealed'),'true');
 await page.getByTestId('button-reveal-all').click();await page.getByTestId('button-close-pack-opening').waitFor();await page.waitForTimeout(650);assert.equal(await page.locator('[data-pack-revealed="true"]').count(),3);await page.screenshot({path:`${out}/pack-${width}.png`});await page.getByTestId('button-close-pack-opening').click();await page.getByTestId('button-close-pack-opening').waitFor({state:'detached'});
 assert.equal(writes.filter(x=>x.path==='/api/packs/p-pack/open').length,1);assert.equal(writes.filter(x=>x.path==='/api/prism/craft/p-card-0').length,1);assert.deepEqual(errors,[]);
 results.push({width,height,skinSlider:true,filterReflow:true,detailOpenClose:true,quantityCraft:true,seal:true,revealSkip:true,close:true,serverWrites:'mock only'});await page.close();
}await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
