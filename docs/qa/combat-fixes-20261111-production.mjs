/** Read-only live bundle/data checks. No production writes or match creation. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {championRecordToDefinition} from '../../artifacts/ko-game/src/game/champions/published-champions.ts';
const source=process.argv[2];assert.match(source,/^[0-9a-f]{40}$/);
const root='https://ko-card-game-vr69.onrender.com';
async function get(path){const r=await fetch(new URL(path,root),{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,path);return r;}
const html=await get('/?release='+source).then(r=>r.text());
const entry=html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i)?.[1];assert.ok(entry);
const js=await get(entry).then(r=>r.text());assert.ok(js.includes(source));
const modules=[...js.matchAll(/(?:assets\/|\.\/)([\w-]+\.js)/g)].map(m=>m[1]);
const chunks={};
for(const prefix of ['match-result-overlay-','home-','online-match-']){
 const name=modules.find(x=>new RegExp('^'+prefix+'[A-Za-z0-9_-]{8}\\.js$').test(x));assert.ok(name,prefix);
 const text=await get('/assets/'+name).then(r=>r.text());assert.ok(text.includes('attackerPlayerId'),prefix+' uses controller identity');
 if(prefix==='match-result-overlay-'){assert.ok(text.includes('targetPlayerId'));assert.ok(text.includes('cosmeticOwnerId'));}
 chunks[prefix]=name;
}
const records=await get('/api/champions').then(r=>r.json());const rosie=records.champions.find(c=>c.id==='champion-minion-a');assert.ok(rosie);
const description='레전더리 혹은 챔피언 등급 카드를 3장 이상 필드에 내기';
assert.ok(rosie.questCondition.finisherChoices.some(o=>o.description===description));
const mapped=championRecordToDefinition(rosie).quest.finisherChoices.find(o=>o.cardDefinitionId==='52528873-0704-4569-9bd8-2c4ff227ce51');
assert.deepEqual(mapped.condition,{type:'EVENT',event:'CARD_PLAYED',owner:'SELF',cardType:'WRESTLER',rarities:['LEGENDARY','CHAMPION'],required:3});
const result={checkedAtUTC:new Date().toISOString(),source,actualEntry:entry,chunks,skinControllerMetadataInLiveModules:true,currentRosieDescriptionPreserved:true,localSharedMapperOnLiveRecord: mapped.condition,productionDataWrites:0,productionMatchCreated:false};
await writeFile('docs/qa/20261111-combat-skins-and-conditions/production-feature-checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
