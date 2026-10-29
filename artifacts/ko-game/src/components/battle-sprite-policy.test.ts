import assert from 'node:assert/strict';import {test} from 'node:test';
import {parseBattleSprite,reactSprite,defaultSpritePlacement as p} from '@workspace/cosmetics';
const frame={url:'https://example.invalid/sprite.png',self:p,opponent:{...p,flip:true}};
test('default-only sprites, explicit side flipping and optional reaction mappings validate',()=>{
 const c={version:1,frames:{default:frame},reactions:{HIT:'default'}};
 assert.ok(parseBattleSprite(JSON.stringify(c)));assert.equal(parseBattleSprite(c)!.frames.default.opponent.flip,true);
 for(const invalid of [{...c,frames:{hurt:frame}}, {...c,reactions:{HIT:'missing'}},{...c,frames:{default:{...frame,url:'javascript:alert(1)'}}},{...c,frames:{default:{...frame,self:{...p,scale:100}}}}])assert.equal(parseBattleSprite(invalid),null);
});
test('important reactions cannot be overwritten by minor events and no backlog is queued',()=>{
 const major=reactSprite({event:'IDLE',until:0},'AWAKEN',100);assert.equal(reactSprite(major,'SUMMON',200),major);assert.equal(reactSprite(major,'HIT',2000).event,'HIT');assert.equal(reactSprite(major,'DEFEAT',300).event,'DEFEAT');
});

import {selectSpriteFrame} from '@workspace/cosmetics';
test('reaction completion returns to low state; replaced set cannot leak normal expressions',()=>{
 const normal={url:'https://example.invalid/normal.png',self:p,opponent:p};const low={...normal,url:'https://example.invalid/low.png'};const awake={...normal,url:'https://example.invalid/awake.png'};
 const config={version:1 as const,frames:{default:normal,low,hit:normal},reactions:{HIT:'hit'},states:{LOW:'low'},awakening:'REPLACE' as const,awakened:{version:1 as const,frames:{default:awake},reactions:{}}};
 assert.ok(parseBattleSprite(config));assert.equal(selectSpriteFrame(config,{awakened:false,low:true,reaction:'IDLE'})!.url,low.url);
 assert.equal(selectSpriteFrame(config,{awakened:true,low:true,reaction:'HIT'})!.url,awake.url);
 assert.equal(selectSpriteFrame(config,{awakened:true,low:true,reaction:'IDLE'})!.url,awake.url);
 assert.equal(parseBattleSprite({...config,awakened:undefined}),null);
});
test('final damage bands ignore legacy self damage artwork override; disabled reactions and timing remain deterministic',()=>{
 const normal={url:'https://example.invalid/normal.png',self:p,opponent:p};const laugh={...normal,url:'https://example.invalid/laugh.png'};
 const config={version:1 as const,frames:{default:normal,laugh},reactions:{HIT:'default'},selfDamage:'laugh',disabled:['ATTACK' as const],timing:{HIT:650}};
 assert.equal(selectSpriteFrame(config,{awakened:false,low:false,reaction:'HIT',selfDamage:true})!.url,normal.url);
 assert.equal(selectSpriteFrame(config,{awakened:false,low:false,reaction:'ATTACK'})!.url,normal.url);
 assert.equal(reactSprite({event:'IDLE',until:0},'HIT',100,config).until,750);
 assert.equal(reactSprite({event:'DEFEAT',until:10000},'AWAKEN',100).event,'DEFEAT');
});

import {spriteAwakeningDelay,finalSpriteSet,withSpriteFrame} from '@workspace/cosmetics';
test('quest expression replaces KEEP idle, including missing reaction and low-state fallback',()=>{
 const f=(name:string)=>({...frame,url:`https://example.invalid/${name}.png`});
 const config={version:1 as const,frames:{default:f('base'),awaken:f('quest'),hurt:f('hurt'),low:f('low')},reactions:{},awakening:'KEEP' as const};
 const select=(reaction:'IDLE'|'HIT'|'HEAL'|'AWAKEN',awakened=true,low=false)=>selectSpriteFrame(config,{awakened,low,reaction})!.url;
 assert.match(select('IDLE',false),/base.png$/);
 assert.match(select('AWAKEN',false,true),/quest.png$/);
 assert.match(select('IDLE'),/quest.png$/);
 assert.match(select('HIT'),/hurt.png$/);
 assert.match(select('HEAL'),/quest.png$/);
 assert.match(select('IDLE',true,true),/low.png$/);
 assert.match(selectSpriteFrame({...config,frames:{default:config.frames.default,awaken:config.frames.awaken}},{awakened:true,low:true,reaction:'IDLE'})!.url,/quest.png$/);
});
test('REPLACE holds normal quest expression then only uses the replacement set',()=>{
 const f=(name:string)=>({...frame,url:`https://example.invalid/${name}.png`});
 const config={version:1 as const,frames:{default:f('base'),awaken:f('quest'),hurt:f('old-hurt')},reactions:{},awakening:'REPLACE' as const,awakened:{version:1 as const,frames:{default:f('new')},reactions:{}}};
 assert.match(selectSpriteFrame(config,{awakened:false,low:false,reaction:'AWAKEN'})!.url,/quest.png$/);
 for(const reaction of ['IDLE','AWAKEN','HIT'] as const)assert.match(selectSpriteFrame(config,{awakened:true,low:true,reaction})!.url,/new.png$/);
 assert.equal(spriteAwakeningDelay(config),1500);
 assert.equal(spriteAwakeningDelay(config,true),1500);
 for(const [ms,expected]of [[100,1000],[1800,1800],[3000,2000]]){
  const c={...config,timing:{AWAKEN:ms}};
  assert.equal(spriteAwakeningDelay(c),expected);
  assert.equal(reactSprite({event:'IDLE',until:0},'AWAKEN',50,c).until,50+expected);
 }
});
test('optional quest artwork survives editor projection and is subordinate to outcomes',()=>{
 const config=withSpriteFrame({version:1,frames:{default:frame},reactions:{}},'awaken',{...frame,url:'https://example.invalid/quest.png'});
 const projected=finalSpriteSet(config);
 assert.ok(parseBattleSprite(JSON.stringify(projected)));
 assert.equal(projected.frames.awaken.url,config.frames.awaken.url);
 assert.equal(projected.reactions.AWAKEN,'awaken');
 assert.equal(selectSpriteFrame(projected,{awakened:false,low:false,reaction:'AWAKEN',outcome:'DEFEAT'}),projected.frames.default);
 assert.equal(spriteAwakeningDelay({version:1,frames:{default:frame},reactions:{}}),220);
});
