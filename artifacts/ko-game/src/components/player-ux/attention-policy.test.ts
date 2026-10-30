import test from 'node:test';
import assert from 'node:assert/strict';
import {attentionPlans,paidCardId} from './attention-policy';
import type {GameState} from '@/game';
function fixture(){return {gameId:'a',status:'IN_PROGRESS',events:[],players:[{id:'me',currentGold:6,champion:{questProgress:1,questCompleted:false}},{id:'opp',currentGold:6,champion:{questProgress:1,questCompleted:false}}]} as unknown as GameState;}
test('confirmed spending only: reset, reward, selection and a changed number are not a paid action',()=>{
 const a=fixture(),b=structuredClone(a);b.players[0].currentGold=0;assert.deepEqual(attentionPlans(a,b),[]);
 for(const reason of ['TURN_ENDED','TURN_REFRESH','CHAMPION_QUEST_REWARD']){b.events=[{type:'GOLD_CHANGED',playerId:'me',amount:-6,reason}];assert.deepEqual(attentionPlans(a,b),[]);}
 b.events=[{type:'GOLD_CHANGED',playerId:'me',amount:-2,reason:'CARD_COST'},{type:'GOLD_CHANGED',playerId:'me',amount:-1,reason:'CHAMPION_ABILITY_COST'}];assert.deepEqual(attentionPlans(a,b),[{playerId:'me',spent:-3,quest:false}]);
});
test('quest progress needs both committed event and progress increase; completion uses existing major presentation',()=>{
 const a=fixture(),b=structuredClone(a);b.players[1].champion!.questProgress=2;
 assert.deepEqual(attentionPlans(a,b),[]);b.events=[{type:'CHAMPION_QUEST_PROGRESS',playerId:'opp',amount:1}];assert.deepEqual(attentionPlans(a,b),[{playerId:'opp',spent:0,quest:true}]);b.players[1].champion!.questCompleted=true;assert.deepEqual(attentionPlans(a,b),[]);
});
test('reconnect/new game/end do not replay old emphasis or mutate state',()=>{
 const a=fixture(),b=structuredClone(a);b.events=[{type:'GOLD_CHANGED',playerId:'me',amount:-1,reason:'CARD_COST'}];const original=JSON.stringify(b);attentionPlans(a,b);assert.equal(JSON.stringify(b),original);assert.deepEqual(attentionPlans(b,b),[]);b.gameId='b';assert.deepEqual(attentionPlans(a,b),[]);b.gameId='a';b.status='FINISHED';assert.deepEqual(attentionPlans(a,b),[]);assert.deepEqual(attentionPlans(b,a),[]);
});
test('a payment links to its exact source or unique resolution, never an arbitrary first card',()=>{
 const events:GameState['events']=[{type:'CARD_PLAYED',playerId:'me',cardInstanceId:'first',presentationResolutionId:'r1'},{type:'CARD_PLAYED',playerId:'me',cardInstanceId:'second',presentationResolutionId:'r2'}];
 const cost:GameState['events'][number]={type:'GOLD_CHANGED',playerId:'me',reason:'CARD_COST',amount:-1};assert.equal(paidCardId(cost,events),undefined);assert.equal(paidCardId({...cost,presentationResolutionId:'r2'},events),'second');assert.equal(paidCardId({...cost,source:{type:'CARD',cardInstanceId:'exact'}},events),'exact');assert.equal(paidCardId(cost,events.slice(0,1)),'first');assert.equal(paidCardId({...cost,reason:'TURN_ENDED'},events),undefined);
});
