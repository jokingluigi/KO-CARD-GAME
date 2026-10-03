import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareAdminCardTest } from './admin-card-test';
import { createInitialGameState } from './create-initial-game-state';
import { cardRecordToDefinition, type PublishedCardRecord } from '../cards/published-cards';
import { generateCardInstance } from '../cards/generation';
import { executeAction } from '../actions/engine-actions';
import { enterField } from './enter-field';
import { endTurn } from './turn-system';
import { startGame } from './turn-system';
import { TEST_CARD_DEFINITIONS } from '../cards/test-cards';
import { TEST_CHAMPIONS } from '../champions/test-champions';
const records=JSON.parse(readFileSync(new URL('../qa/fixtures/cards-2026-10-04.json',import.meta.url),'utf8')) as PublishedCardRecord[];
const definitions=records.map(cardRecordToDefinition);
for (const definition of definitions.filter(card => card.isToken || card.isChampionToken)) test(`admin token initialization: ${definition.name}`, () => {
 const filler = TEST_CARD_DEFINITIONS[0]!;
 const initial = createInitialGameState(undefined, [definition, filler], TEST_CHAMPIONS.map(champion => ({...champion, quest:null})), [Array(25).fill(filler.id), Array(25).fill(filler.id)]);
 const started = prepareAdminCardTest(startGame(initial), definition);
 assert.equal(started.status, 'IN_PROGRESS');
 assert.equal(started.players[0]!.hand[0]!.definitionId, definition.id);
 assert.ok(started.players[0]!.deck.every(card => !card.isToken && !card.isChampionToken));
});
for(const definition of definitions)test(`admin scenario legal use: ${definition.name}`,()=>{
 const base=createInitialGameState();base.cardPool=definitions;base.status='IN_PROGRESS';base.activePlayerId='player-1';base.turn=3;
 let state=prepareAdminCardTest(base,definition);assert.equal(base.players[0].board.filter(Boolean).length,0);assert.ok(state.players[1].board.some(Boolean));
 const card=state.players[0].hand[0];const specs=[card.baseAttack,card.baseHealth,card.baseCost];assert.deepEqual(specs,[definition.attack,definition.health,definition.cost]);
 if(['DEATH','지뢰닷!!!'].includes(definition.contentRule??'')){const r=endTurn(state,'player-1');assert.ok(r.success);if(definition.contentRule==='DEATH')assert.equal(r.state.loserId,'player-1');else assert.equal(r.state.players[0].health,15);return;}
 if(definition.isChampionToken){state.players[0].hand=[];state=enterField(state,'player-1',card,0,undefined,undefined,'CHAMPION_DEPLOY');}
 else {const r=executeAction(state,definition.cardType==='TECHNIQUE'?{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:card.instanceId}:{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:card.instanceId,boardSlot:0});assert.ok(r.success,JSON.stringify(r));state=r.state;}
 for(let i=0;state.targetingState?.active;i++){assert.ok(i<30,'no soft lock');const t=state.targetingState;assert.ok(t.validTargetIds.length,'target exists');const r=executeAction(state,{type:'SELECT_EFFECT_TARGET',playerId:t.playerId,targetId:t.validTargetIds[0]!});assert.ok(r.success);state=r.state;}
 assert.ok(JSON.parse(JSON.stringify(state)));assert.deepEqual([definition.attack,definition.health,definition.cost],specs);
});
