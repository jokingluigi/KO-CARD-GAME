import {chromium} from './black-gold-playwright.mjs';
import {auditSetup} from './ui-audit-fixture.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const out='qa-results/product-experience',b=await chromium.launch(),measurements=[];await mkdir(out,{recursive:true});
try{
 for(const [route,marker]of [['/decks','카드 찾기'],['/collection','내 컬렉션'],['/shop','상점'],['/settings','설정']]){
  const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await auditSetup(p);await p.goto('http://127.0.0.1:5186'+route);if(route==='/decks')await p.getByTestId('grid-card-collection').waitFor();else await p.getByRole('heading',{name:marker,exact:true}).first().waitFor();await p.waitForTimeout(300);await p.screenshot({path:out+'/default-'+route.slice(1)+'-390.png'});
  measurements.push({route,viewport:{width:390,height:844},...await p.evaluate(()=>{const card=document.querySelector('.ko-collection-item,.ko-decks__collection-card');return {scrollHeight:document.documentElement.scrollHeight,firstCardTop:card?.getBoundingClientRect().top??null};})});await p.close();
 }
 const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await auditSetup(p);await p.route('**/api/auth/me',r=>r.fulfill({json:{authenticated:false,user:null}}));await p.goto('http://127.0.0.1:5186/');await p.getByRole('link',{name:/로그인 없이 직접 배워보기/}).waitFor();await p.screenshot({path:out+'/public-entry-390.png'});await writeFile(out+'/default-measurements.json',JSON.stringify(measurements,null,2));
}finally{await b.close();}
