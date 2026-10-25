import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {externalSound} from './external-assets';
test('bundled external assets exist and match pinned provenance hashes',()=>{
 const root=new URL('../../public/vendor/kenney/',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
 assert.ok(manifest.length>=30);
 for(const entry of manifest){
  assert.equal(entry.license,'CC0-1.0');
  assert.equal(createHash('sha256').update(readFileSync(new URL(entry.file,root))).digest('hex'),entry.sha256);
  assert.match(entry.url,/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\//);
 }
});
test('default cues use existing external files while admin uploads stay unchanged',()=>{
 for(const name of ['combat-movement','combat-hit-1-2','combat-hit-3-5','combat-hit-6-9','combat-hit-10-plus','combat-finisher','impact-light','impact-normal','impact-heavy','impact-very-heavy','impact-finisher','summon-bass-heavy','summon-bass-massive','champion-glass-shatter']){
  const resolved=externalSound('/game/sfx/'+name+'.wav?v=1');
  assert.ok(resolved.startsWith('/game/vendor/kenney/'));
  assert.ok(existsSync(new URL('../../public/'+resolved.slice('/game/'.length),import.meta.url)));
 }
 assert.equal(externalSound('/api/storage/objects/uploads/audio/custom.wav'),'/api/storage/objects/uploads/audio/custom.wav');
});

test('Effekseer sample textures and layered external audio retain provenance',()=>{
 const root=new URL('../../public/vendor/',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('effekseer/manifest.json',root),'utf8'));
 assert.match(readFileSync(new URL('effekseer/SAMPLE-LICENSE.txt',root),'utf8'),/CC-0/);
 for(const x of manifest.assets){assert.equal(createHash('sha256').update(readFileSync(new URL('effekseer/'+x.file,root))).digest('hex'),x.sha256);}
 const mixes=JSON.parse(readFileSync(new URL('impact-mixes/manifest.json',root),'utf8'));
 for(const mix of mixes){assert.ok(mix.sourceFiles.length>=3);assert.equal(createHash('sha256').update(readFileSync(new URL('impact-mixes/'+mix.file,root))).digest('hex'),mix.sha256);assert.ok(mix.decodedPeakDbFS<0);}
});
