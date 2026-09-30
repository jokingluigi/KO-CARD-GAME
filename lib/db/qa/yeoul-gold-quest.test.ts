import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { championsTable, cardsTable } from '../src/schema';
import { championRecordToDefinition, type PublishedChampionRecord } from '../../../artifacts/ko-game/src/game/champions/published-champions';
import { cardRecordToDefinition } from '../../../artifacts/ko-game/src/game/cards/published-cards';
import { createInitialGameState } from '../../../artifacts/ko-game/src/game/engine/create-initial-game-state';
import { useChampionAbility } from '../../../artifacts/ko-game/src/game/engine/champion-system';
import { processChampionQuestEvents } from '../../../artifacts/ko-game/src/game/champions/quests';
import { playTechniqueFromHand } from '../../../artifacts/ko-game/src/game/engine/play-technique';
import { generateCardInstance } from '../../../artifacts/ko-game/src/game/cards/generation';
import { applyEffect } from '../../../artifacts/ko-game/src/game/effects/effect-engine';
import { isStructuredEffects } from '../../../artifacts/api-server/src/lib/structured-effects';

test('stored Yeoul counts actual spending, upgrades once and summons the existing bodyguard', async () => {
 const pg = new PGlite(); const db = drizzle(pg);
 try {
  for (const ddl of await generateMigration(generateDrizzleJson({}), generateDrizzleJson({championsTable,cardsTable}))) await pg.exec(ddl);
  const base = {effects:[{trigger:'ACTIVE',action:'ADD_NEXT_TURN_GOLD',values:{amount:1}}]};
  await db.insert(championsTable).values([{id:'yeoul',name:'챔피언 여울',abilityName:'지원',abilityCost:2,abilityEffects:base,status:'PUBLISHED',imageUrl:'keep'},{id:'other',name:'다른 챔피언',abilityName:'none',abilityEffects:{}}]);
  await db.insert(cardsTable).values({id:'bodyguard',name:'여울의 보디가드',cardType:'WRESTLER',cost:99,attack:1,health:4,text:'기존 효과',rarity:'CHAMPION',isChampionToken:true,status:'DRAFT'});
  const migration = await readFile(new URL('../migrations/0031_yeoul_gold_quest.sql',import.meta.url),'utf8');
  await pg.exec(migration); await pg.exec(migration);
  const records = await db.select().from(championsTable); const record = records.find(c=>c.id==='yeoul')!;
  const [token] = await db.select().from(cardsTable);
  assert.deepEqual(record.abilityEffects,base); assert.equal(record.abilityCost,2); assert.equal(record.upgradedAbilityCost,2); assert.equal(record.imageUrl,'keep'); assert.equal(record.version,2);
  assert.equal(token.status,'PUBLISHED'); assert.equal(token.attack,1); assert.equal(token.health,4); assert.equal(token.cost,99); assert.equal(token.version,2);
  assert.ok(isStructuredEffects(record.upgradedAbilityEffects));
  let state = createInitialGameState(['yeoul','other'],[cardRecordToDefinition(token)],records.map(r=>championRecordToDefinition(r as PublishedChampionRecord)));
  state.status='IN_PROGRESS'; state.activePlayerId='player-1';
  const spell = generateCardInstance({...cardRecordToDefinition(token),id:'spell',name:'주문',cardType:'TECHNIQUE',cost:3,isChampionToken:false,abilities:[]},{instanceId:'spell'});
  state.players[0].hand=[spell]; state.players[0].currentGold=2;
  const failed=playTechniqueFromHand(state,'player-1','spell'); assert.equal(failed.success,false); assert.equal(failed.state.players[0].champion?.questProgress,0);
  state.players[0].currentGold=3;
  const cast=playTechniqueFromHand(state,'player-1','spell'); assert.ok(cast.success); state=cast.state; assert.equal(state.players[0].champion?.questProgress,3);
  state.players[0].currentGold=2;
  const source=generateCardInstance(cardRecordToDefinition(token),{instanceId:'spender'}); source.boardSlot=0; state.players[0].board[0]=source;
  const preSpend=state;
  state=applyEffect(state,'player-1',source,{type:'STRUCTURED',action:'SPEND_GOLD_BUFF_SELF'});
  state=processChampionQuestEvents(preSpend,state); assert.equal(state.players[0].champion?.questProgress,5);
  state.players[0].board[0]=null;
  const before = structuredClone(state);
  state.events.push(...[
   {type:'GOLD_CHANGED' as const,playerId:'player-1',amount:-4,reason:'CARD_COST'},
   {type:'GOLD_CHANGED' as const,playerId:'player-1',amount:-3,reason:'CARD_EFFECT_COST'},
   {type:'GOLD_CHANGED' as const,playerId:'player-1',amount:-6,reason:'TURN_ENDED'},
   {type:'GOLD_CHANGED' as const,playerId:'player-1',amount:-5,reason:'CARD_EFFECT'},
   {type:'GOLD_CHANGED' as const,playerId:'player-2',amount:-10,reason:'CARD_COST'},
   {type:'GOLD_CHANGED' as const,playerId:'player-1',amount:6,reason:'TURN_STARTED'},
   {type:'GOLD_CHANGED' as const,playerId:'player-1',amount:0,reason:'CARD_COST'},
  ]);
  state=processChampionQuestEvents(before,state); assert.equal(state.players[0].champion?.questProgress,12);
  state=processChampionQuestEvents(before,state); assert.equal(state.players[0].champion?.questProgress,12);
  for(let i=0;i<9;i++) {
   state.players[0].currentGold=2; state.players[0].championAbilityUsedThisTurn=false;
   const result=useChampionAbility(state,'player-1'); assert.ok(result.success); state=result.state;
   assert.equal(state.players[0].champion?.questProgress,Math.min(30,14+i*2));
  }
  assert.equal(state.players[0].champion?.questCompleted,true);
  assert.equal(state.events.filter(e=>e.type==='CHAMPION_QUEST_COMPLETED').length,1);
  state.players[0].currentGold=2; state.players[0].championAbilityUsedThisTurn=false;
  const bonusBefore=state.players[0].nextTurnGoldBonus;
  const upgraded=useChampionAbility(state,'player-1'); assert.ok(upgraded.success); state=upgraded.state;
  assert.equal(state.players[0].currentGold,0); assert.equal(state.players[0].nextTurnGoldBonus,bonusBefore+1);
  const summoned=state.players[0].board.find(c=>c?.definitionId==='bodyguard'); assert.ok(summoned); assert.equal(summoned.currentAttack,1); assert.equal(summoned.currentHealth,4);
  await pg.exec("UPDATE champions SET quest_text='later edit' WHERE id='yeoul'"); await pg.exec(migration);
  assert.equal((await db.select().from(championsTable)).find(c=>c.id==='yeoul')?.questText,'later edit');
 } finally {await pg.close();}
});
