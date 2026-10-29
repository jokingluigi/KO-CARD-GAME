import assert from 'node:assert/strict';
import test from 'node:test';
import {generateCardInstance,type GameState,type CardDefinition} from '../game';
import {zoneVisualPlans,effectWavePlans,arrivalStatParts} from './battle-zone-visual-policy';
const def:CardDefinition={id:'visual',name:'QA',cardType:'WRESTLER',cost:2,attack:3,health:5,rulesText:'',rarity:'NORMAL',keywords:[],abilities:[]};
const card=generateCardInstance(def,{instanceId:'same-id'});
function state():GameState{return {gameId:'match',events:[],cardPool:[def],players:[{id:'me',board:[card],hand:[],deck:[],graveyard:[],removedFromGame:[]},{id:'other',board:[],hand:[],deck:[],graveyard:[],removedFromGame:[]}]} as unknown as GameState;}
test('exact field-to-hand and hand-to-deck identities, never disappearance or death',()=>{
 const before=state(),after=structuredClone(before);after.players[0].board=[];after.players[0].hand=[card];
 assert.equal(zoneVisualPlans(before,after,'me')[0]?.kind,'RETURN_HAND');
 const deck=structuredClone(after);deck.players[0].hand=[];deck.players[0].deck=[card];assert.equal(zoneVisualPlans(after,deck,'me')[0]?.kind,'RETURN_DECK');
 after.events=[{type:'CARD_RETIRED',cardInstanceId:card.instanceId}];assert.deepEqual(zoneVisualPlans(before,after,'me'),[]);
 after.events=[];after.players[0].hand=[];assert.deepEqual(zoneVisualPlans(before,after,'me'),[]);
 after.gameId='new';assert.deepEqual(zoneVisualPlans(before,after,'me'),[]);
});
test('generation requires confirmed event, deduplicates, conceals opponent identity',()=>{
 const before=state(),after=structuredClone(before);after.players[1].hand=[{...card,instanceId:'generated'}];after.events=[{type:'CARD_GENERATED',playerId:'other',cardInstanceId:'generated'},{type:'CARD_GENERATED',playerId:'other',cardInstanceId:'generated'}];
 const plans=zoneVisualPlans(before,after,'me');assert.equal(plans.length,1);assert.equal(plans[0].card,undefined);
 after.events=[{type:'CARD_DRAWN',playerId:'other',cardInstanceId:'generated'}];assert.deepEqual(zoneVisualPlans(before,after,'me'),[]);
});
test('AoE needs actual shared provenance and separate targets, excludes combat and zero damage',()=>{
 const before=state(),after=structuredClone(before);
 const event={type:'DAMAGE_DEALT' as const,amount:2,reason:'EFFECT',source:{type:'CARD' as const,cardInstanceId:card.instanceId},sourceContext:{causationId:'effect1'}};
 after.events=[{...event,target:{type:'PLAYER',playerId:'me'}},{...event,target:{type:'PLAYER',playerId:'other'}}];assert.equal(effectWavePlans(before,after).length,1);
 after.events[1].sourceContext={causationId:'different'};assert.deepEqual(effectWavePlans(before,after),[]);
 after.events=after.events.map(e=>({...e,sourceContext:{causationId:'effect1'},reason:'COMBAT'}));assert.deepEqual(effectWavePlans(before,after),[]);
 after.events=after.events.map(e=>({...e,reason:'EFFECT',amount:0}));assert.deepEqual(effectWavePlans(before,after),[]);
});
test('arrival marks only actual modified numeric fields',()=>{
 assert.deepEqual(arrivalStatParts(card),[]);assert.deepEqual(arrivalStatParts({...card,currentAttack:7,currentCost:1}),['cost','attack']);
});
test('verified AoE source reunites recursive child IDs only inside committed update',()=>{
 const before=state(),after=structuredClone(before);
 after.cardPool=[{...def,abilities:[{trigger:'ON_PLAY',effects:[{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'ALL',count:4},values:{amount:1}}]}]}];
 after.events=['a','b'].map((id,i)=>({type:'DAMAGE_DEALT',amount:1,source:{type:'CARD',cardInstanceId:card.instanceId},target:{type:'CARD',cardInstanceId:id},sourceContext:{sourcePlayerId:'me',sourceActionType:'CARD_EFFECT',causationId:'child'+i}}));
 assert.equal(effectWavePlans(before,after).length,1);
});
