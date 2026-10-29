import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const out='qa-results/player-pack-goals';await mkdir(out,{recursive:true});
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

 await page.goto('http://127.0.0.1:5186/packs');await page.getByTestId('button-open-pack-p-pack').waitFor();await page.evaluate(async()=>{const {changeShelf}=await import('/src/components/player-tools/shelf.ts');changeShelf('p-user',s=>({...s,wishes:[{id:'p-card-2',kind:'card',name:'검증 전설'}]}));});await page.getByTestId('button-open-pack-p-pack').click();await page.getByTestId('button-unseal-pack').click();await page.getByTestId('button-reveal-all').click();await page.getByTestId('button-close-pack-opening').waitFor();await page.waitForTimeout(650);await page.getByTestId('button-close-pack-opening').click();await page.getByText('수집 목표 달성: 검증 전설',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ko-player-shelf:p-user')).wishes[0].acquired),true);assert.equal(writes.filter(x=>x.path==='/api/packs/p-pack/open').length,1);assert.deepEqual(errors,[]);await page.screenshot({path:`${out}/goal-${width}.png`});results.push({width,height,confirmedRewardMarksGoal:true,onePackRequest:true,errors});await page.close();}await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
