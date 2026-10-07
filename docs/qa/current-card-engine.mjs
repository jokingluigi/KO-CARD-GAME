import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
// These pre-existing suites require historical catalog definitions/expectations.
// Keep them available for explicit live auditing; do not label them passing here.
const liveOnly = new Set(['published-catalog-qa.test.ts','published-champion-abilities-smoke.test.ts','published-effects-qa2.test.ts','targeted-card-fixes.test.ts']);
function tests(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?tests(join(dir,e.name)):e.name.endsWith('.test.ts')&&!liveOnly.has(e.name)?[join(dir,e.name)]:[]); }
const result=spawnSync(process.execPath,['--import','./docs/qa/checkpoints/20261006/qa-loader.mjs','--test','--test-isolation=none',...tests('artifacts/ko-game/src/game')],{stdio:'inherit',env:{...process.env,KO_QA_CURRENT_FIXTURE:'1',KO_AI_QA_REPORT:process.env.KO_AI_QA_REPORT??'qa-results/current-card-ai-100.md'}});
if(result.error) throw result.error;
process.exit(result.status??1);
