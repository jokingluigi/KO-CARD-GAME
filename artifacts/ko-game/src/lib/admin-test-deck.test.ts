import {startGame} from '../game/engine/turn-system';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createAdminTestDeckState,startAdminTestDeckGame} from './admin-test-deck';
import {TEST_CARD_DEFINITIONS} from '../game/cards/test-cards';
import {TEST_CHAMPIONS} from '../game/champions/test-champions';
test('admin test decks preserve chosen copies, include spells, reset quest and create independent player instances',()=>{
 const spell={...TEST_CARD_DEFINITIONS[0],id:'spell',cardType:'TECHNIQUE' as const};const cards=[...TEST_CARD_DEFINITIONS,spell];const ids:[string,string]=[TEST_CHAMPIONS[0].id,TEST_CHAMPIONS[1].id];
 const state=createAdminTestDeckState(cards,TEST_CHAMPIONS,ids,[[spell.id,spell.id,spell.id],[cards[0].id]]);
 assert.deepEqual(state.players[0].deck.map(c=>c.definitionId),['spell','spell','spell']);assert.equal(new Set(state.players[0].deck.map(c=>c.instanceId)).size,3);assert.equal(state.players[1].deck.length,1);assert.equal(state.players[0].champion?.questProgress,0);assert.equal(state.status,'NOT_STARTED');
 assert.throws(()=>createAdminTestDeckState(cards,TEST_CHAMPIONS,ids,[[],[cards[0].id]]));assert.throws(()=>createAdminTestDeckState(cards,TEST_CHAMPIONS,ids,[Array(61).fill(spell.id),[cards[0].id]]));
 const token={...spell,id:'token',isToken:true};assert.throws(()=>createAdminTestDeckState([...cards,token],TEST_CHAMPIONS,ids,[['token'],[cards[0].id]]));
});

test('admin starts both 26-card and 60-card decks while ordinary matches keep their size rule',()=>{
 const ids:[string,string]=[TEST_CHAMPIONS[0].id,TEST_CHAMPIONS[1].id];
 for(const count of [1,26,60]){const decks:[string[],string[]]=[Array(count).fill(TEST_CARD_DEFINITIONS[0].id),Array(count).fill(TEST_CARD_DEFINITIONS[1].id)];const state=startAdminTestDeckGame(TEST_CARD_DEFINITIONS,TEST_CHAMPIONS,ids,decks);assert.equal(state.status,'IN_PROGRESS');for(const p of state.players)assert.equal(p.deck.length+p.hand.length,count);}
 const ordinary=createAdminTestDeckState(TEST_CARD_DEFINITIONS,TEST_CHAMPIONS,ids,[Array(26).fill(TEST_CARD_DEFINITIONS[0].id),Array(26).fill(TEST_CARD_DEFINITIONS[1].id)]);
 assert.throws(()=>startGame(ordinary),/정확히/);
});
