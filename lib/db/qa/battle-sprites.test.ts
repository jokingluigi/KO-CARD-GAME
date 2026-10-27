import assert from 'node:assert/strict';import {test} from 'node:test';
import {database,api,registered,uploaded,cards,deck} from './cosmetics.test';
import {championsTable,cardsTable,decksTable,userCardCollectionsTable,userChampionCollectionsTable} from '../src/schema';import {eq} from 'drizzle-orm';
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

import {championSpriteSkin,championSpriteCandidates} from '../../cosmetics/src/index';
test('actual PvP snapshots preserve distinct selected skin sets for both viewers and server recovery',async()=>{
 const aConfig={version:1,frames:{default:{url:uploaded,self:p,opponent:p}},reactions:{},awakening:'REPLACE',awakened:{version:1,frames:{default:{url:uploaded,self:{...p,scale:2},opponent:{...p,scale:2}}},reactions:{}}};
 const a=registered.CHAMPION_SKIN;
 const updated=await api('/admin/cosmetics/items/'+a.id,'admin','PATCH',{...a,imageAssets:{...a.imageAssets,__battle:JSON.stringify(aConfig)}});assert.equal(updated.status,200);
 const bConfig={version:1,frames:{default:{url:uploaded,self:{...p,scale:.8},opponent:{...p,scale:.8}}},reactions:{},awakening:'KEEP'};
 const created=await api('/admin/cosmetics/items','admin','POST',{...a,id:undefined,name:'독립 B 스킨',imageAssets:{art:uploaded,__battle:JSON.stringify(bConfig)}});assert.equal(created.status,201);const b=created.body.item;
 const {equipCosmetic}=await import('../../../artifacts/api-server/src/lib/cosmetics');
 for(const [user,id]of [['player-a',a.id],['player-b',b.id]]){assert.equal((await api('/admin/cosmetics/users/'+user+'/grants','admin','POST',{cosmeticId:id,action:'GRANT'})).status,200);await equipCosmetic(user,'champion:cosmetic-hero',id);}
 // Earlier inventory/pack regressions intentionally alter the fixture; restore only local test accounts.
 await database.update(championsTable).set({status:'PUBLISHED'}).where(eq(championsTable.id,'cosmetic-hero'));
 for(const card of cards)await database.update(cardsTable).set({status:'PUBLISHED'}).where(eq(cardsTable.id,card.id));
 for(const userId of ['player-a','player-b']){
  await database.update(decksTable).set({championDefinitionId:'cosmetic-hero',cardDefinitionIds:deck}).where(eq(decksTable.id,'deck-'+userId));
  for(const card of cards)await database.insert(userCardCollectionsTable).values({userId,cardDefinitionId:card.id,quantity:3}).onConflictDoUpdate({target:[userCardCollectionsTable.userId,userCardCollectionsTable.cardDefinitionId],set:{quantity:3}});
  await database.insert(userChampionCollectionsTable).values({userId,championDefinitionId:'cosmetic-hero',owned:true}).onConflictDoUpdate({target:[userChampionCollectionsTable.userId,userChampionCollectionsTable.championDefinitionId],set:{owned:true}});
 }
 const {startOnlineMatch,snapshotMessage,cleanupMatchRuntime,getRuntime}=await import('../../../artifacts/api-server/src/online/service');
 let runtime=await startOnlineMatch('player-a','deck-player-a','player-b','deck-player-b');const frozen=structuredClone(runtime.snapshot.cosmetics);
 for(const user of ['player-a','player-b']){const message:any=snapshotMessage(runtime,user);assert.deepEqual(message.cosmetics,frozen);for(const [id,skinId,scale]of [['PLAYER_ONE',a.id,2],['PLAYER_TWO',b.id,.8]] as const){const selected=championSpriteSkin({championId:'cosmetic-hero',loadout:message.cosmetics[id],base:{version:1,frames:{},reactions:{}},normal:'base.png',awakened:true});assert.equal(selected.id,skinId);const c=championSpriteCandidates(selected,{awakened:true,low:true,reaction:'HIT'});assert.equal(c[0].frame!.self.scale,scale);}}
 await equipCosmetic('player-a','champion:cosmetic-hero',null);assert.deepEqual(runtime.snapshot.cosmetics,frozen);
 const id=runtime.matchId;cleanupMatchRuntime(id);runtime.state.status='FINISHED';runtime=await getRuntime(id);assert.deepEqual(runtime.snapshot.cosmetics,frozen);runtime.state.status='FINISHED';cleanupMatchRuntime(id);
});
