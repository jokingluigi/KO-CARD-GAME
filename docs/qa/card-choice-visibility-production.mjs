/** Read-only frontend release verification; never edits production data. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {render,SERVICES} from '../../scripts/deploy/release.mjs';
const commit=process.argv[2];
assert.match(commit,/^[0-9a-f]{40}$/);
const root='https://ko-card-game-vr69.onrender.com';
async function get(path){const r=await fetch(new URL(path,root),{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,path);return r;}
const entries=await render('services/'+SERVICES.front+'/deploys?limit=5');
const live=entries.find(x=>x.deploy.status==='live')?.deploy;
assert.equal(live?.commit?.id,commit);
const config=await render('services/'+SERVICES.front);
assert.equal(config.branch,'production');assert.equal(config.autoDeploy,'no');
assert.ok((config.serviceDetails.buildCommand??'').includes(commit));
const version=await get('/version.json?release='+commit).then(r=>r.json());assert.equal(version.revision,commit);
const response=await get('/?release='+commit);assert.match(response.headers.get('cache-control')??'',/no-store/);
const html=await response.text();
const entry=html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i)?.[1];assert.ok(entry);
const js=await get(entry).then(r=>r.text());assert.ok(js.includes(commit),'actual entry revision');
const modules=[...js.matchAll(/(?:assets\/|\.\/)([\w-]+\.js)/g)].map(m=>m[1]);
const battle=modules.find(x=>x.startsWith('match-result-overlay-'));assert.ok(battle);
const battleJS=await get('/assets/'+battle).then(r=>r.text());
assert.ok(battleJS.includes('ko-card-choice-backdrop'));assert.ok(battleJS.includes('ko-battle-card-choice'));assert.ok(battleJS.includes('z-[201]'));
const api=await fetch('https://ko-card-game.onrender.com/api/healthz',{cache:'no-store',signal:AbortSignal.timeout(20000)}).then(r=>r.json());assert.equal(api.status,'ok');assert.equal(api.revision,'42196db64c75259ff5f96de39af12fb09d13aa0a');
const result={checkedAtUTC:new Date().toISOString(),frontend:{commit,deployId:live.id,status:live.status,actualEntry:entry,battleModule:battle,newChoiceLayersDelivered:true},api:{revision:api.revision,status:api.status,unchangedForFrontendOnlyFix:true},mainMerged:false,productionDataWrites:0,productionMatchCreated:false};
await writeFile('docs/qa/20261111-card-choice-visibility/production-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
