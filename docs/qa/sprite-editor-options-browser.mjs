import assert from 'node:assert/strict';
import {chromium} from './black-gold-playwright.mjs';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',e=>console.log('PAGE_ERROR',e.message));
 await page.goto('http://127.0.0.1:5186/qa/black-gold-board.html');
 await page.evaluate(async()=>{
  const reactModule=await import('/node_modules/.vite/deps/react.js');
  const React=reactModule.default ?? reactModule;
  const dom=await import('/node_modules/.vite/deps/react-dom_client.js');
  const createRoot=dom.createRoot ?? dom.default.createRoot;
  const {BattleSpriteEditor}=await import('/src/components/battle-sprite-editor.tsx');
  const {SPRITE_EXPRESSIONS}=await import('/@fs/workspace/KO-CARD-GAME/lib/cosmetics/src/battle-sprite.ts');
  const p={scale:1,x:50,y:50,crop:false,flip:false};
  const frames=Object.fromEntries(Object.keys(SPRITE_EXPRESSIONS).map(k=>[k,{url:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><text y="30">${k}</text></svg>`),self:{...p},opponent:{...p}}]));
  frames.default.self.scale=3;
  function Host(){const [value,setValue]=React.useState({version:1,frames,reactions:{}});return React.createElement(BattleSpriteEditor,{workspace:true,value,onChange:v=>{window.__spriteOptions=v;setValue(v);}});}
  const host=document.createElement('div');document.body.replaceChildren(host);createRoot(host).render(React.createElement(Host));
 });
 assert.equal(await page.getByLabel('스프라이트 scale',{exact:true}).inputValue(),'2');
 assert.equal(await page.getByAltText('상태·반응 미리보기').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a),2);
 const slots=page.getByRole('group',{name:'등록할 표정 10개'});
 assert.equal(await slots.getByRole('button').count(),10);
 assert.equal(await page.locator('.ko-sprite-reaction-buttons button[data-expression]').count(),10);
 await slots.getByRole('button',{name:/저체력\s*등록됨/}).click();
 assert.equal(await page.getByLabel('스프라이트 표정',{exact:true}).inputValue(),'low');
 const fit=page.getByLabel('스프라이트 이미지 맞춤',{exact:true});
 await fit.selectOption('cover');
 assert.equal(await page.evaluate(()=>window.__spriteOptions.frames.low.self.crop),true);
 assert.equal(await page.getByAltText('상태·반응 미리보기').evaluate(n=>getComputedStyle(n).objectFit),'cover');
 await fit.selectOption('contain');
 assert.equal(await page.evaluate(()=>window.__spriteOptions.frames.low.self.crop),false);
 assert.equal(await page.locator('.ko-sprite-preview-figure').evaluate(n=>getComputedStyle(n).transform),'matrix(1, 0, 0, 1, 0, 0)');
 await page.getByLabel('스프라이트 배치 위치',{exact:true}).selectOption('opponent');
 assert.equal(await page.locator('.ko-sprite-preview-figure').evaluate(n=>getComputedStyle(n).transform),'matrix(-1, 0, 0, 1, 0, 0)');
 await page.getByRole('button',{name:'저체력 재생',exact:true}).click();
 assert.equal(await page.getByLabel('미리보기 체력').inputValue(),'5');
 assert.equal(await page.locator('.ko-sprite-preview-canvas').getAttribute('data-state'),'LOW');
 assert.ok((await page.getByAltText('상태·반응 미리보기').getAttribute('src')).includes('low'));
 await page.getByRole('button',{name:'안도 재생',exact:true}).click();
 assert.equal(await page.locator('.ko-sprite-preview-canvas').getAttribute('data-reaction'),'HEAL');
 await page.waitForTimeout(800);
 assert.equal(await page.locator('.ko-sprite-preview-canvas').getAttribute('data-state'),'LOW');
 await page.screenshot({path:'/tmp/sprite-editor-options-mobile.png',fullPage:true});
 console.log('PASS actual editor: 10 visible registration slots and previews; low slot upload selection; cover/contain saved per frame and displayed; low preview and heal return');
} finally {await browser.close();}
