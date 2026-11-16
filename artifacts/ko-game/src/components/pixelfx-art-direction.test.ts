import assert from 'node:assert/strict';
import test from 'node:test';
import {koEffectForArea,resolveKoEffect} from './pixelfx-art-direction';
import {readFileSync} from 'node:fs';
const atlas=JSON.parse(readFileSync(new URL('./pixelfx-ko-atlas.json',import.meta.url),'utf8'));
test('every event family has a shipped KO effect, including default champion and finisher previews',()=>{
 for(let area=1;area<=140;area++)assert.ok(atlas.effects[koEffectForArea(area)],String(area));
 assert.equal(koEffectForArea(68),'ko/critical');
});
test('event meaning overrides mismatched generic stock artwork',()=>{
 assert.equal(resolveKoEffect('holy/holy-pillar',26),'ko/summon');
 assert.equal(resolveKoEffect('shadow/void-orb',48),'ko/heal');
 assert.equal(resolveKoEffect('scifi/hologram',13),'ko/guard');
});
test('champion signatures preserve semantic families within the authored style',()=>{
 assert.equal(resolveKoEffect('shadow/dark-explosion',62),'ko/shadow');
 assert.equal(resolveKoEffect('holy/holy-pillar',68),'ko/summon');
 assert.equal(resolveKoEffect('nature/spore-burst',68),'ko/ember');
 assert.equal(resolveKoEffect('projectiles/bullet-tracer',62),'ko/critical');
});
