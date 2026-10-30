import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from './black-gold-playwright.mjs';
const browser=await chromium.launch(),results=[],out='qa-results/visual-attention';await mkdir(out,{recursive:true});
try{for(const [width,height]of [[390,844],[1440,900]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[],writes=[];let user='ux-deck-a';page.on('pageerror',e=>errors.push(e.message));
 const card={id:'ux-card',name:'검증 선수',cardType:'WRESTLER',cost:1,attack:2,health:3,text:'검증용',rarity:'NORMAL',quantity:3,status:'PUBLISHED',imageUrl:null,imageScale:1,imagePositionX:50,imagePositionY:50,imageDisplayMode:'CONTAIN'},champion={id:'ux-hero',name:'검증 챔피언',status:'PUBLISHED',maxHealth:20,abilityCost:1,description:'',abilityText:'검증'};let deck={id:'ux-deck',name:'저장된 덱',championDefinitionId:champion.id,champion,cardDefinitionIds:[card.id],cards:[card],isSelected:false,isValid:false,missingCardDefinitionIds:[],invalidReasons:['INVALID_CARD_COUNT'],validationReasons:[]};
 await page.route('**/api/**',async r=>{const q=r.request(),path=new URL(q.url()).pathname;let json={};if(q.method()!=='GET'&&path.includes('/decks/')){writes.push(q.postDataJSON());deck={...deck,...q.postDataJSON()};json={deck};}else if(path.endsWith('/auth/me'))json={authenticated:true,user:{id:user,nickname:'검증',role:'USER'}};else if(path.endsWith('/decks/options'))json={cards:[card],champions:[champion]};else if(path.endsWith('/decks'))json={decks:[deck]};else if(path.endsWith('/server-status'))json={enabled:false,allowed:true};else if(path.endsWith('/cards'))json={cards:[card]};else if(path.endsWith('/champions'))json={champions:[champion]};await r.fulfill({json});});
 const open=async()=>{await page.goto('http://127.0.0.1:5186/decks?edit=ux-deck');await page.getByTestId('input-deck-name').waitFor({state:'attached'});const expand=page.getByRole('button',{name:'덱 정보 펼치기 ▲',exact:true});if(await expand.count())await expand.click();await page.getByTestId('input-deck-name').waitFor();};
 await open();
 await page.getByTestId('button-add-card-action-ux-card').click();
 assert.equal(await page.getByTestId('row-selected-card-ux-card').getAttribute('data-edit-cue'),'add');
 assert.equal((await page.getByTestId('text-card-count-ux-card').textContent()).trim(),'×2');
 await page.screenshot({path:`${out}/deck-add-${width}.png`});
 await page.getByTestId('button-remove-card-ux-card').click();
 assert.equal(await page.getByTestId('row-selected-card-ux-card').getAttribute('data-edit-cue'),'remove');
 assert.equal((await page.getByTestId('text-card-count-ux-card').textContent()).trim(),'×1');
 await page.getByTestId('input-deck-name').fill('복구할 편집');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ko-deck-edit-draft:ux-deck-a')??'null')?.name==='복구할 편집');assert.equal(writes.length,0);
 page.once('dialog',d=>d.dismiss());await page.getByTestId('link-main-menu').click();assert.ok(page.url().includes('/decks'));
 page.once('dialog',d=>d.accept());await open();await page.getByRole('button',{name:'임시 편집 복구',exact:true}).click();assert.equal(await page.getByTestId('input-deck-name').inputValue(),'복구할 편집');assert.equal(writes.length,0);await page.screenshot({path:`${out}/deck-recovery-${width}.png`});await page.getByTestId('button-save-deck').click();await page.getByText('전략을 저장했습니다.').waitFor();assert.equal(writes.length,1);assert.equal(writes[0].name,'복구할 편집');assert.deepEqual(writes[0].cardDefinitionIds,[card.id]);assert.equal(await page.evaluate(()=>localStorage.getItem('ko-deck-edit-draft:ux-deck-a')),null);
 await page.getByTestId('input-deck-name').fill('다른 임시 편집');await page.waitForFunction(()=>localStorage.getItem('ko-deck-edit-draft:ux-deck-a')!==null);page.once('dialog',d=>d.accept());user='ux-deck-b';await open();assert.equal(await page.getByRole('button',{name:'임시 편집 복구',exact:true}).count(),0);assert.equal(await page.getByTestId('input-deck-name').inputValue(),'복구할 편집');assert.deepEqual(errors,[]);results.push({width,height,rowAddRemoveCue:true,explicitRecovery:true,noImplicitServerSave:true,leaveGuard:true,accountIsolation:true,saveClearsDraft:true,errors});await page.close();
}console.log(JSON.stringify(results));await writeFile(`${out}/deck-results.json`,JSON.stringify(results,null,2));}finally{await browser.close();}
