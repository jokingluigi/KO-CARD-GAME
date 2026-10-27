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
