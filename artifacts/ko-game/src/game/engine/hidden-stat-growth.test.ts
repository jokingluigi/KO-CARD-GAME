import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCardInstance } from '../cards/generation';
import type { CardDefinition, CardInstance } from '../cards/types';
import { createInitialGameState } from './create-initial-game-state';
import { applyEffect } from '../effects/effect-engine';

const base: CardDefinition = {id:'growth',name:'Growth fixture',cardType:'WRESTLER',cost:1,attack:2,health:4,rulesText:'',rarity:'NORMAL',isToken:false,isChampionToken:false,keywords:[],abilities:[]};
for (const zone of ['HAND','DECK','BOARD'] as const) {
 for (const stat of ['attack','health'] as const) {
  test(`${zone} ${stat} gain invokes self bonus once in the same zone`,()=>{
   const s=createInitialGameState();s.status='IN_PROGRESS';s.activePlayerId=s.players[0].id;
   s.players=s.players.map(p=>({...p,hand:[],deck:[],graveyard:[],board:[null,null,null,null]}));
   const definition:CardDefinition={...base,abilities:[{trigger:'STAT_CHANGED',condition:{type:stat==='attack'?'ATTACK_GAIN':'HEALTH_GAIN'},effects:[{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{[stat]:2}}]}]};
   const c=generateCardInstance(definition,{instanceId:'growth'});s.cardPool=[definition];
   if(zone==='BOARD')s.players[0].board[0]={...c,boardSlot:0};else s.players[0][zone==='HAND'?'hand':'deck']=[c];
   const buff=(state:typeof s,amount:number)=>applyEffect(state,s.players[0].id,c,{type:'STRUCTURED',action:'BUFF',target:{zone,owner:'SELF',selection:'SELF',count:1},values:{[stat]:amount}});
   const read=(state:typeof s):CardInstance => (zone==='BOARD'?state.players[0].board[0]:state.players[0][zone==='HAND'?'hand':'deck'][0])!;
   const first=buff(s,1);assert.equal(stat==='attack'?read(first).currentAttack:read(first).maxHealth,(stat==='attack'?2:4)+3);
   const second=buff(first,1);assert.equal(stat==='attack'?read(second).currentAttack:read(second).maxHealth,(stat==='attack'?2:4)+6);
   const unchanged=buff(second,0);assert.equal(stat==='attack'?read(unchanged).currentAttack:read(unchanged).maxHealth,(stat==='attack'?2:4)+6);
   const reduced=buff(unchanged,-1);assert.equal(stat==='attack'?read(reduced).currentAttack:read(reduced).maxHealth,(stat==='attack'?2:4)+5);
   assert.equal(first.players[0].board.filter(Boolean).length,zone==='BOARD'?1:0);
   assert.equal(s.players[0].hand.length,zone==='HAND'?1:0);assert.equal(read(s).currentAttack,2);
  });
 }
}
test('both stats increase together triggers a generic passive once; graveyard and disabled abilities do not trigger',()=>{
 for(const location of ['hand','deck','graveyard'] as const)for(const disabled of [false,true]){
  const s=createInitialGameState();s.players=s.players.map(p=>({...p,hand:[],deck:[],graveyard:[],board:[null,null,null,null],currentGold:0}));
  const c={...generateCardInstance({...base,abilities:[{trigger:'STAT_CHANGED',effects:[{type:'GAIN_GOLD',amount:1}]}]},{instanceId:'growth'}),isAbilityDisabled:disabled};s.players[0][location]=[c];
  const n=applyEffect(s,s.players[0].id,c,{type:'STRUCTURED',action:'BUFF',target:{zone:location==='hand'?'HAND':location==='deck'?'DECK':'GRAVEYARD',owner:'SELF',selection:'SELF',count:1},values:{attack:1,health:1}});
  assert.equal(n.players[0].currentGold,location==='graveyard'||disabled?0:1);
 }
});
test('legacy HAND+BOARD self effects follow deck instance without mutating definitions',()=>{
 const s=createInitialGameState();s.players=s.players.map(p=>({...p,hand:[],deck:[],board:[null,null,null,null]}));
 const definition:CardDefinition={...base,abilities:[{trigger:'STAT_CHANGED',sourceZones:['HAND','BOARD'],condition:{type:'HEALTH_GAIN'},effects:[{type:'STRUCTURED',action:'BUFF',target:{zones:['HAND','BOARD'],owner:'SELF',selection:'SELF',count:1},values:{health:2}}]}]};
 const c=generateCardInstance(definition,{instanceId:'growth'});s.players[0].deck=[c];
 const n=applyEffect(s,s.players[0].id,c,{type:'STRUCTURED',action:'BUFF',target:{zone:'DECK',owner:'SELF',selection:'ALL',count:25},values:{health:1}});
 assert.equal(n.players[0].deck[0].maxHealth,7);assert.deepEqual(definition.abilities[0].effects[0],{type:'STRUCTURED',action:'BUFF',target:{zones:['HAND','BOARD'],owner:'SELF',selection:'SELF',count:1},values:{health:2}});
});

// Real published definitions: preserve their BOARD / HAND+BOARD authored targets.
const {readFileSync}=await import('node:fs');
const {cardRecordToDefinition}=await import('../cards/published-cards');
const published=JSON.parse(readFileSync(process.env.KO_STAT_GROWTH_CATALOG ?? 'docs/qa/snapshots/20261014-admin/cards.json','utf8')).map(cardRecordToDefinition) as CardDefinition[];
for(const [name,stat] of [['만드릴쿤','attack'],['프랑켄슈타인 만드릴쿤','health']] as const)for(const zone of ['HAND','DECK'] as const){
 test(`published ${name}: ${zone} gain adds exactly +2 each time`,()=>{
  const def=published.find(d=>d.name===name);assert.ok(def);
  const s=createInitialGameState();s.cardPool=published;s.players=s.players.map(p=>({...p,hand:[],deck:[],board:[null,null,null,null]}));
  const c=generateCardInstance(def,{instanceId:'real-growth'});const key=zone==='HAND'?'hand':'deck';s.players[0][key]=[c];
  const next=applyEffect(s,s.players[0].id,c,{type:'STRUCTURED',action:'BUFF',target:{zone,owner:'SELF',selection:'ALL',count:25},values:{[stat]:1}});
  assert.equal(stat==='attack'?next.players[0][key][0].currentAttack:next.players[0][key][0].maxHealth,(stat==='attack'?c.currentAttack:c.maxHealth)+3);
 });
}
