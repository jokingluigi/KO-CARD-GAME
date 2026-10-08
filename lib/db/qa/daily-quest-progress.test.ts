import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { dailyQuestDefinitionsTable, dailyQuestAssignmentsTable } from '../src/schema/rewards';
import { createInitialGameState } from '../../../artifacts/ko-game/src/game/engine/create-initial-game-state';
import { claimDailyQuest, dailyDate, processMatchEventsForDailyQuests } from '../../../artifacts/api-server/src/lib/daily-quest-service';

test('reward quests progress from match events, ignore opponents/retries and pay only once',async()=>{
 const pg=new PGlite();const db=drizzle(pg);
 try{
  await pg.exec(`CREATE TABLE users(id text PRIMARY KEY,email text,nickname text,password_hash text,role text,currency integer DEFAULT 0,currency_balance integer DEFAULT 0,shop_currency_starter_granted_at timestamptz,prism_balance integer DEFAULT 0,champion_prism_balance integer DEFAULT 0,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
   INSERT INTO users(id,email)VALUES('quest-user','qa@example.test');
   CREATE TABLE currency_transactions(id text PRIMARY KEY,user_id text,related_listing_id text,amount integer,balance_after integer,currency_type text,type text,metadata jsonb,created_at timestamptz DEFAULT now());`);
  for(const file of ['0017_rewards_daily_quests_attendance.sql','0018_reward_targets.sql','0023_daily_quest_condition_v2.sql','0050_daily_season_quest_platform.sql'])await pg.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const definitions=[
   {id:'play',objectiveType:'PLAY_MATCH',targetValue:1},
   {id:'win',objectiveType:'WIN_MATCH',targetValue:1},
   {id:'spell',objectiveType:'TECHNIQUE_PLAYED',targetValue:2},
  ].map(d=>({...d,title:d.id,description:d.id,rewardType:'CURRENCY',rewardAmount:25,enabled:true}));
  await db.insert(dailyQuestDefinitionsTable).values(definitions);
  const state=createInitialGameState();state.status='FINISHED';state.winnerId='player-1';
  state.events=[{type:'CARD_PLAYED',playerId:'player-1',cardType:'TECHNIQUE'},
   {type:'CARD_PLAYED',playerId:'player-2',cardType:'TECHNIQUE'},
   {type:'CARD_PLAYED',playerId:'player-1',cardType:'TECHNIQUE'}];
  for(let retry=0;retry<2;retry++)await db.transaction(tx=>processMatchEventsForDailyQuests('quest-user','player-1','match-1',state,0,tx as any));
  const assignments=await db.select().from(dailyQuestAssignmentsTable);
  assert.equal(assignments.length,3);assert.ok(assignments.every(a=>a.status==='COMPLETED'));
  assert.deepEqual(assignments.map(a=>[a.objectiveType,a.progress]).sort(),[['PLAY_MATCH',1],['TECHNIQUE_PLAYED',2],['WIN_MATCH',1]].sort());
  assert.ok(assignments.every(a=>a.assignmentDate===dailyDate()));
  await assert.rejects(()=>claimDailyQuest('different-user',assignments[0].id,db as any));
  for(const a of assignments){const first=await claimDailyQuest('quest-user',a.id,db as any);assert.equal(first.alreadyClaimed,false);const repeat=await claimDailyQuest('quest-user',a.id,db as any);assert.equal(repeat.alreadyClaimed,true);}
  assert.equal((await pg.query<any>('SELECT currency_balance FROM users')).rows[0].currency_balance,75);
  assert.equal((await pg.query('SELECT * FROM reward_grants')).rows.length,3);
  await db.transaction(tx=>processMatchEventsForDailyQuests('quest-user','player-1','match-2',state,0,tx as any));
  assert.ok((await db.select().from(dailyQuestAssignmentsTable)).every(a=>a.status==='CLAIMED'));
 }finally{await pg.close();}
});
