import assert from 'node:assert/strict';
import {chromium} from '../black-gold-playwright.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qa-results/game-experience-overhaul';await mkdir(out,{recursive:true});const b=await chromium.launch({headless:true});const results=[];
try{for(const [width,height]of[[360,740],[375,812],[390,844],[412,915],[768,1024],[1440,900]]){
 const p=await b.newPage({viewport:{width,height},reducedMotion:'reduce'});
 await p.route('**/api/**',r=>r.fulfill({json:{cards:[],champions:[],frames:[]}}));
 await p.goto('http://127.0.0.1:5186/qa/champion-features.html');await p.getByTestId('board-check').waitFor();await p.getByTestId('board-check').evaluate(e=>e.parentElement.style.display='none');
 const cards=p.locator('.ko-player-board-row .ko-board-slot');const box=await cards.first().boundingBox();
 await cards.first().click();await p.getByTestId('battle-command-strip').getByRole('button',{name:'선택 취소'}).click();
 assert.equal(await p.getByTestId('battle-command-strip').getByRole('button',{name:'선택 취소'}).count(),0,'attack selection actually cleared');
 await p.getByRole('button',{name:'턴 종료',exact:true}).click();await p.getByTestId('battle-command-strip').getByRole('button',{name:'계속 플레이'}).click();
 await p.getByRole('button',{name:'설정 열기',exact:true}).click();await p.getByRole('button',{name:'설정 닫기',exact:true}).click();
 const after=await cards.first().boundingBox();assert.equal(after.width,box.width);assert.equal(after.height,box.height);
 const command=await p.getByTestId('battle-command-strip').boundingBox();const field=await p.locator('.ko-player-board-row').boundingBox();assert.ok(command.y+command.height<=field.y,'command does not cover field');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await p.screenshot({path:`${out}/battle-${width}.png`,fullPage:true});results.push({width,height,attackSelectionCancel:true,endTurnContinue:true,settings:true,cardSizeStable:true,noFieldOverlap:true});await p.close();
}await writeFile(out+'/battle.json',JSON.stringify(results,null,2));console.log(results);}finally{await b.close();}
