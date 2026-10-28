import {chromium} from './black-gold-playwright.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qa-results/readable-hand';await mkdir(out,{recursive:true});
const b=await chromium.launch();const results=[];
try{
 for(const [width,height] of [[360,640],[360,740],[390,844],[412,915],[740,360],[1440,900],[1920,1080]]){
  const p=await b.newPage({viewport:{width,height}});
  await p.route('**/api/**',r=>r.fulfill({json:{cards:[],frames:[]}}));
  await p.goto('http://127.0.0.1:5186/qa/black-gold-board.html');await p.locator('.ko-game-shell').waitFor();
  await p.locator('[data-preview-tools]').evaluate(n=>n.style.display='none');
  const card=p.locator('.ko-hand-card').first();const normal=await card.boundingBox();
  await p.screenshot({path:`${out}/${width}x${height}-normal.png`});
  await card.click({position:{x:10,y:normal.height-15}});await p.waitForTimeout(250);
  const selected=await card.boundingBox(),hand=await p.locator('.ko-player-hand').boundingBox();
  assert.ok(selected.height>normal.height*1.06,'focus must enlarge');
  assert.ok(selected.y>=hand.y-1,JSON.stringify({width,height,selected,hand}));
  assert.ok(selected.y+selected.height<=hand.y+hand.height+1,JSON.stringify({width,height,selected,hand}));
  if(width===390)assert.ok(normal.width>=130&&normal.height>=180);
  if(width===1440)assert.ok(normal.width>=159&&normal.height>=223);
  await p.screenshot({path:`${out}/${width}x${height}-selected.png`});
  results.push({width,height,normal,selected,hand});await p.close();
 }
 await writeFile(out+'/results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(x=>({width:x.width,height:x.height,normal:[Math.round(x.normal.width),Math.round(x.normal.height)],selected:[Math.round(x.selected.width),Math.round(x.selected.height)],notClipped:true}))));
}finally{await b.close();}
