import {test} from 'node:test';import assert from 'node:assert/strict';
import {championSpriteSkin,championSpriteCandidates,emptyCosmetics,defaultSpritePlacement as p,type BattleSprite,type CosmeticItem} from '@workspace/cosmetics';
const f=(name:string)=>({url:`https://example.invalid/${name}.png`,self:p,opponent:p});
const base:BattleSprite={version:1,frames:{default:f('base'),hurt:f('base-hurt')},reactions:{HIT:'hurt'}};
const sprite:BattleSprite={version:1,frames:{default:f('skin-a')},reactions:{},awakening:'REPLACE',awakened:{version:1,frames:{default:f('skin-a-awake')},reactions:{}}};
const item=(manifest?:BattleSprite):CosmeticItem=>({id:'skin-a',type:'CHAMPION_SKIN',targetId:'hero',name:'A',description:'',isActive:true,sortOrder:0,imageAssets:{art:'https://example.invalid/skin-a-art.png',...(manifest?{__battle:JSON.stringify(manifest)}:{})}});
const resolve=(i?:CosmeticItem,awake=false)=>championSpriteSkin({championId:'hero',base,normal:'https://example.invalid/base-art.png',awakenedPortrait:'https://example.invalid/base-awake.png',awakened:awake,loadout:{...emptyCosmetics(),skins:i?{'champion:hero':i}:{}}});
test('default appearance is its own skin; explicit selection never inherits base sprites or thresholds',()=>{
 assert.equal(resolve().id,'default:hero');assert.equal(resolve().config!.frames.default.url,base.frames.default.url);
 const selected=resolve(item());assert.equal(selected.id,'skin-a');assert.equal(selected.config,null);assert.equal(selected.illustrations[0],'https://example.invalid/skin-a-art.png');
 assert.equal(championSpriteCandidates(selected,{awakened:false,low:false,reaction:'HIT'})[0].frame,undefined);
});
test('partial selected skin and awakened sets never borrow champion or other skin expressions',()=>{
 for(const awakened of [false,true])for(const reaction of ['IDLE','HIT','ABILITY','AWAKEN'] as const){const skin=resolve(item(sprite),awakened);const c=championSpriteCandidates(skin,{awakened,low:true,reaction});assert.equal(c[0].url,`https://example.invalid/skin-a${awakened?'-awake':''}.png`);assert.ok(!c.some(c=>c.url.includes('base')));}
});
test('KEEP and no-sprite selected skins keep their own illustration even after awakening',()=>{
 const keep=resolve(item({...sprite,awakening:'KEEP'}),true);assert.equal(keep.illustrations[0],'https://example.invalid/skin-a-art.png');
 assert.equal(resolve(item(),true).illustrations[0],'https://example.invalid/skin-a-art.png');
});
test('frame failure order stays in selected set then selected illustration; target mismatch cannot select another champion skin',()=>{
 const config={...sprite,frames:{...sprite.frames,hurt:f('skin-hurt')},reactions:{HIT:'hurt'}};
 const c=championSpriteCandidates(resolve(item(config)),{awakened:false,low:false,reaction:'HIT'});assert.deepEqual(c.slice(0,3).map(c=>c.url),['https://example.invalid/skin-hurt.png','https://example.invalid/skin-a.png','https://example.invalid/skin-a-art.png']);
 assert.equal(resolve({...item(sprite),targetId:'other'}).id,'default:hero');
});

test('selected skin never borrows default champion art after all current-skin candidates fail',()=>{
 const selected=resolve(item(sprite),true);
 const candidates=championSpriteCandidates(selected,{awakened:true,low:true,reaction:'HEAVY_HIT'});
 assert.deepEqual(candidates.map(c=>c.url),['https://example.invalid/skin-a-awake.png','https://example.invalid/skin-a-art.png']);
 const missing=resolve({...item(),imageAssets:{}},true);
 assert.deepEqual(championSpriteCandidates(missing,{awakened:true,low:false,reaction:'HIT'}),[]);
});

test('selected skin inherits only champion motion defaults while keeping its own images',()=>{
 const appearance=championSpriteSkin({championId:'hero',base:{...base,motion:{preset:'HEAVY',speed:.8}},awakened:true,loadout:{...emptyCosmetics(),skins:{'champion:hero':item({...sprite,motion:{movement:.7},awakened:{...sprite.awakened!,motion:{preset:'AGILE'}}})}}});
 assert.deepEqual(appearance.motionDefaults,{preset:'HEAVY',speed:.8});
 assert.deepEqual(appearance.config!.motion,{movement:.7});
 assert.equal(appearance.config!.awakened!.motion!.preset,'AGILE');
 assert.ok(!championSpriteCandidates(appearance,{awakened:true,low:false,reaction:'HIT'}).some(c=>c.url.includes('base')));
});
