import assert from 'node:assert/strict';
import test from 'node:test';
import {createAdminTestDeckState} from './admin-test-deck';
import {TEST_CARD_DEFINITIONS} from '../game/cards/test-cards';
import {TEST_CHAMPIONS} from '../game/champions/test-champions';
test('admin test decks preserve chosen copies, include spells, reset quest and create independent player instances',()=>{
 const spell={...TEST_CARD_DEFINITIONS[0],id:'spell',cardType:'TECHNIQUE' as const};const cards=[...TEST_CARD_DEFINITIONS,spell];const ids:[string,string]=[TEST_CHAMPIONS[0].id,TEST_CHAMPIONS[1].id];
 const state=createAdminTestDeckState(cards,TEST_CHAMPIONS,ids,[[spell.id,spell.id,spell.id],[cards[0].id]]);
 assert.deepEqual(state.players[0].deck.map(c=>c.definitionId),['spell','spell','spell']);assert.equal(new Set(state.players[0].deck.map(c=>c.instanceId)).size,3);assert.equal(state.players[1].deck.length,1);assert.equal(state.players[0].champion?.questProgress,0);assert.equal(state.status,'NOT_STARTED');
 assert.throws(()=>createAdminTestDeckState(cards,TEST_CHAMPIONS,ids,[[],[cards[0].id]]));assert.throws(()=>createAdminTestDeckState(cards,TEST_CHAMPIONS,ids,[Array(61).fill(spell.id),[cards[0].id]]));
 const token={...spell,id:'token',isToken:true};assert.throws(()=>createAdminTestDeckState([...cards,token],TEST_CHAMPIONS,ids,[['token'],[cards[0].id]]));
});
