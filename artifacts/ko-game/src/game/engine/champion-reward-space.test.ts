import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGameState } from './create-initial-game-state';
import { directDeployChampionToken } from './champion-token';
import { generateCardInstance } from '../cards/generation';
import { TEST_CHAMPION_TOKEN_DEFINITION } from '../cards/test-cards';
import { MAX_HAND_SIZE } from '../rules/constants';
import { executeAction, getLegalActions } from '../actions/engine-actions';
import { processChampionQuestEvents } from '../champions/quests';
import { runAITurn } from '../actions/ai-turn-scheduler';
import type { GameState } from '../types/game-state';
function setup(handCount=0): GameState {
  const s=createInitialGameState();s.status='IN_PROGRESS';s.turn=2;s.activePlayerId='player-2';
  s.cardPool=[TEST_CHAMPION_TOKEN_DEFINITION];
  const p=s.players[0];p.hand=Array.from({length:handCount},(_,i)=>({...p.deck[i%p.deck.length],instanceId:'hand-'+i}));
  p.board=[0,1,2,3].map(i=>({...p.deck[i],instanceId:'field-'+i,boardSlot:i,currentAttack:50,currentHealth:1,maxHealth:50})) as typeof p.board;
  return s;
}
const begin=(s:GameState)=>directDeployChampionToken(s,'player-1',s.players[0].champion!.id,TEST_CHAMPION_TOKEN_DEFINITION.id,'CHAMPION_QUEST_REWARD');
for(const count of [0,MAX_HAND_SIZE-1,MAX_HAND_SIZE])for(const slot of [0,1,2,3])test('quest full field replacement hand='+count+' slot='+slot,()=>{
  const before=setup(count);const victim=before.players[0].board[slot]!;
  const pending=begin(before);assert.equal(pending.players[0].board.length,4);assert.equal(pending.players[0].hand.length,count);
  assert.equal(pending.targetingState?.playerId,'player-1');assert.equal(pending.targetingState?.validTargetIds.length,4);
  assert.equal(getLegalActions(pending,'player-2').length,0);assert.equal(getLegalActions(pending,'player-1').length,4);
  const restored=JSON.parse(JSON.stringify(pending));
  const result=executeAction(restored,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:victim.instanceId});assert.ok(result.success);
  const n=result.state,p=n.players[0];assert.ok(p.board[slot]?.isChampionToken);assert.ok(!n.targetingState);assert.equal(n.activePlayerId,'player-2');
  assert.equal(p.graveyard.length,before.players[0].graveyard.length);assert.equal(n.events.some(e=>e.type==='CARD_RETIRED'||e.type==='CARD_DESTROYED'),false);
  assert.equal(p.hand.length,Math.min(count+1,MAX_HAND_SIZE));
  const moved=count<MAX_HAND_SIZE?p.hand.at(-1)!:p.deck[0];assert.equal(moved.instanceId,victim.instanceId);assert.equal(moved.boardSlot,null);assert.notEqual(moved.currentAttack,50);
  assert.equal(n.events.filter(e=>e.type==='CARD_GENERATED').length,1);assert.equal(n.events.filter(e=>e.type==='ENTER_FIELD').length,1);
  assert.equal(executeAction(n,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:victim.instanceId}).success,false);
});
test('quest replacement rejects enemy, forged ID, cancellation, and other player',()=>{const s=begin(setup());for(const id of ['unknown','player-2'])assert.equal(executeAction(s,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:id}).success,false);assert.equal(executeAction(s,{type:'SELECT_EFFECT_TARGET',playerId:'player-2',targetId:'field-0'}).success,false);assert.equal(executeAction(s,{type:'CANCEL_EFFECT_TARGET',playerId:'player-1'}).state,s);});
test('empty field quest deploy remains immediate',()=>{const s=setup();s.players[0].board[2]=null;const n=begin(s);assert.ok(n.players[0].board[2]?.isChampionToken);assert.ok(!n.targetingState);});
test('actual quest completes on opposing turn and event replay cannot generate twice',()=>{
 const s=setup();s.players[0].champion!.quest={id:'full-field-quest',name:'q',description:'q',trackedEvent:'DAMAGE_DEALT',requiredProgress:1,reward:{type:'DIRECT_DEPLOY_CHAMPION_TOKEN',cardDefinitionId:TEST_CHAMPION_TOKEN_DEFINITION.id}};
 const damaged={...s,events:[...s.events,{type:'DAMAGE_DEALT' as const,playerId:'player-1',amount:1}]};const n=processChampionQuestEvents(s,damaged);
 assert.ok(n.players[0].champion?.questCompleted);assert.ok(n.targetingState?.championRewardReplacement);
 const replay=processChampionQuestEvents(s,n);assert.equal(replay.events.filter(e=>e.type==='CARD_GENERATED').length,1);assert.deepEqual(replay.targetingState,n.targetingState);
});
test('AI resolves its quest choice on the human turn without taking the human turn',async()=>{const s=begin(setup());const n=await runAITurn(s,'player-1',{wait:async()=>{},waitForPresentationIdle:async()=>{},isCancelled:()=>false,onState:()=>{},actionDelayMs:0});assert.ok(!n.targetingState);assert.equal(n.activePlayerId,'player-2');assert.equal(n.players[0].board.filter(c=>c?.isChampionToken).length,1);});

for (const action of ['DEPLOY_CHAMPION_TOKEN', 'SUMMON'] as const) test('structured quest '+action+' preserves following reward effects and token stats',()=>{
 const s=setup();s.players[0].champion!.championTokenDefinitionId=TEST_CHAMPION_TOKEN_DEFINITION.id;
 s.players[0].champion!.quest={id:'structured-quest',name:'q',description:'q',trackedEvent:'DAMAGE_DEALT',requiredProgress:1,reward:{type:'STRUCTURED',effects:[{type:'STRUCTURED',action,values:{definition:TEST_CHAMPION_TOKEN_DEFINITION,count:1,generatedModifiers:{attack:2,health:3}}},{type:'STRUCTURED',action:'ADD_GOLD',values:{amount:2}}]}};
 const n=processChampionQuestEvents(s,{...s,events:[{type:'DAMAGE_DEALT',playerId:'player-1',amount:1}]});assert.ok(n.targetingState?.championRewardReplacement);
 const r=executeAction(n,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:'field-0'});assert.ok(r.success);assert.equal(r.state.players[0].currentGold,s.players[0].currentGold+2);assert.ok(!r.state.targetingState);
 if(action==='SUMMON')assert.equal(r.state.players[0].board[0]?.currentAttack,TEST_CHAMPION_TOKEN_DEFINITION.attack+2);
});
