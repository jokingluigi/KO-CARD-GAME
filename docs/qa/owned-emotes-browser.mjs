/** Actual isolated HTTP/database + two PvP clients. No production calls. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const fixture=JSON.parse(await readFile('qa-results/cosmetics/fixture.json','utf8')),origin=process.env.KO_COSMETICS_FRONTEND;
assert.equal(new URL(origin).hostname,'127.0.0.1');
const out='qa-results/owned-emotes';await mkdir(out,{recursive:true});const browser=await chromium.launch(),results=[],errors=[];
async function client(id,width,height){const c=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<600});const [name,...value]=fixture.cookies[id].split('=');await c.addCookies([{name,value:value.join('='),url:origin}]);const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return{c,p};}
try{
const admin=await client('admin',1440,900);
const catalog=await admin.c.request.get(origin+'/api/admin/cosmetics').then(r=>r.json());
const art=catalog.items.find(i=>i.type==='IMAGE_EMOTE'&&i.isActive).imageAssets.art;
async function create(name,defaults=false){const r=await admin.c.request.post(origin+'/api/admin/cosmetics/items',{data:{type:'IMAGE_EMOTE',name,description:'',targetId:null,imageAssets:{art,...(defaults?{__defaultGrant:'true'}:{})},isActive:true,sortOrder:500}});assert.equal(r.status(),201,await r.text());return(await r.json()).item;}
const shared=await create('새 기본 지급',true),privateItem=await create('미장착 보유 전송');
const extras=[];for(let i=0;i<8;i++)extras.push(await create('추가 보유 '+i));
for(const item of [privateItem,...extras]){const r=await admin.c.request.post(origin+'/api/admin/cosmetics/users/player-a/grants',{data:{cosmeticId:item.id,action:'GRANT'}});assert.equal(r.status(),200);}
for(const [width,height] of [[390,844],[1440,900]]){
 const a=await client('player-a',width,height),b=await client('player-b',width,height);
 const inventory=await a.c.request.get(origin+'/api/cosmetics').then(r=>r.json());assert.ok(!inventory.loadout.emotes.some(i=>i?.id===privateItem.id));
 await Promise.all([a.p.goto(origin+'/online/match/'+fixture.matchId),b.p.goto(origin+'/online/match/'+fixture.matchId)]);
 await a.p.getByRole('button',{name:'이미지 이모티콘',exact:true}).click();
 const panel=a.p.getByRole('dialog',{name:'보유 이모티콘'});await panel.getByRole('button',{name:privateItem.name,exact:true}).waitFor();
 assert.ok(await panel.locator('.cosmetic-owned-emotes button').count()>4);
 let rect=await panel.boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width+1&&rect.y+rect.height<=height+1,JSON.stringify(rect));
 await panel.getByLabel('보유 이모티콘 검색').fill(privateItem.name);
 await a.p.screenshot({path:`${out}/picker-${width}.png`});
 await panel.getByRole('button',{name:privateItem.name,exact:true}).click();
 for(const p of [a.p,b.p])await p.locator('.cosmetic-emote-overlay img').filter({visible:true}).first().waitFor();
 await b.p.screenshot({path:`${out}/opponent-${width}.png`});
 await b.p.getByRole('button',{name:'이미지 이모티콘',exact:true}).click();const bp=b.p.getByRole('dialog',{name:'보유 이모티콘'});
 await bp.getByRole('button',{name:shared.name,exact:true}).waitFor();assert.equal(await bp.getByRole('button',{name:privateItem.name,exact:true}).count(),0);
 await bp.getByRole('button',{name:'닫기',exact:true}).click();
 await a.p.getByRole('button',{name:'이미지 이모티콘',exact:true}).click();await panel.getByRole('button',{name:privateItem.name,exact:true}).waitFor();
 await a.p.setViewportSize({width:844,height:390});rect=await panel.boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=845&&rect.y+rect.height<=391,JSON.stringify(rect));
 await a.p.goto(origin+'/cosmetics');await a.p.getByRole('button',{name:'이모티콘',exact:true}).click();
 await a.p.getByRole('button',{name:privateItem.name+' 자세히 보기',exact:true}).click();
 await a.p.getByText('대전에서 바로 사용 가능',{exact:true}).first().waitFor();assert.equal(await a.p.getByRole('button',{name:/장착 · 슬롯/}).count(),0);
 const after=await a.c.request.get(origin+'/api/cosmetics').then(r=>r.json());assert.deepEqual(after.loadout,inventory.loadout);
 results.push({width,height,moreThanFourUnequipped:true,bothPvpClientsReceived:true,privateOwnershipPreserved:true,defaultImmediatelyAvailable:true,rotationFits:true,noEquipmentMutation:true});await a.c.close();await b.c.close();
}
assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify(results));await admin.c.close();
}finally{await browser.close();}
