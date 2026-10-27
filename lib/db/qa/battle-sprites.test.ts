import assert from 'node:assert/strict';import {test} from 'node:test';
import {database,api,registered,uploaded} from './cosmetics.test';
import {championsTable} from '../src/schema';import {eq} from 'drizzle-orm';
import {defaultSpritePlacement as p,parseBattleSprite} from '../../cosmetics/src/index';
test('real champion/skin admin APIs preserve sprites through save and load, reject invalid mappings and external storage',async()=>{
 const config={version:1,frames:{default:{url:uploaded,self:p,opponent:{...p,flip:true}}},reactions:{HIT:'default'}};
 const [champion]=await database.select().from(championsTable).where(eq(championsTable.id,'cosmetic-hero'));
 const saved=await api('/admin/champions/cosmetic-hero','admin','PATCH',{...champion,presentationLines:{...champion!.presentationLines,BATTLE_SPRITE:config}});assert.equal(saved.status,200,JSON.stringify(saved.body));
 const [stored]=await database.select().from(championsTable).where(eq(championsTable.id,'cosmetic-hero'));assert.deepEqual((stored!.presentationLines as any).BATTLE_SPRITE,config);
 const skin=registered.CHAMPION_SKIN;
 const result=await api('/admin/cosmetics/items/'+skin.id,'admin','PATCH',{...skin,imageAssets:{...skin.imageAssets,__battle:JSON.stringify(config)}});assert.equal(result.status,200,JSON.stringify(result.body));
 const {loadCosmetics}=await import('../../../artifacts/api-server/src/lib/cosmetics');const loadout=await loadCosmetics('player-a');assert.deepEqual(parseBattleSprite(loadout.skins['champion:cosmetic-hero']!.imageAssets.__battle),config);
 assert.equal((await api('/admin/cosmetics/items/'+skin.id,'admin','PATCH',{...skin,imageAssets:{...skin.imageAssets,__battle:JSON.stringify({...config,reactions:{HIT:'missing'}})}})).status,400);
 const external={...config,frames:{default:{...config.frames.default,url:'https://example.invalid/not-uploaded.png'}}};
 assert.equal((await api('/admin/champions/cosmetic-hero','admin','PATCH',{...stored,presentationLines:{BATTLE_SPRITE:external}})).status,400);
 assert.equal((await api('/admin/champions/cosmetic-hero','player-a','PATCH',{...stored})).status,403);
 const removed=await api('/admin/champions/cosmetic-hero','admin','PATCH',{...stored,presentationLines:{BATTLE_SPRITE:{version:1,frames:{},reactions:{}}}});assert.equal(removed.status,200);
});
