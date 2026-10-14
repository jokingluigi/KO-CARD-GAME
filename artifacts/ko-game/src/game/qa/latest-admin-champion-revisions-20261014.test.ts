import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {championRecordToDefinition,type PublishedChampionRecord} from '../champions/published-champions';
import {cardRecordToDefinition,type PublishedCardRecord} from '../cards/published-cards';
import {createInitialGameState} from '../engine/create-initial-game-state';
import {generateCardInstance} from '../cards/generation';
import {executeAction} from '../actions/engine-actions';
import {processChampionQuestEvents} from '../champions/quests';
import {applyEffect} from '../effects/effect-engine';
import type {GameState} from '../types/game-state';
import type {CardDefinition} from '../cards/types';
const champs:PublishedChampionRecord[]=JSON.parse(readFileSync('docs/qa/snapshots/20261014-admin/champions.json','utf8'));
const cards:PublishedCardRecord[]=JSON.parse(readFileSync('docs/qa/snapshots/20261014-admin/cards.json','utf8'));
const definitions=cards.map(cardRecordToDefinition), champions=champs.map(championRecordToDefinition);
const champion=champions.find(c=>c.id==='f7b087d8-3148-43d5-a634-a81d15c81721')!;
const unit:CardDefinition={id:'belmort-target',name:'표적',cardType:'WRESTLER',cost:1,attack:0,health:3,status:'PUBLISHED',rulesText:'',keywords:[],abilities:[]};
function setup(){const state=createInitialGameState([champion.id,champions.find(c=>c.id!==champion.id)!.id],[...definitions,unit],champions);if(process.env.KO_QA_TOWER_MODE==='1')state.tower={playerId:'player-1',relics:[]};state.status='IN_PROGRESS';state.turn=5;state.activePlayerId='player-1';state.events=[];for(const p of state.players){p.currentGold=6;p.hand=[];p.board=[null,null,null,null];p.deck=Array.from({length:30},(_,i)=>generateCardInstance(unit,{instanceId:p.id+'-deck-'+i}));}state.players[1].champion!.quest=null;return state;}
function victim(state:GameState,health:number,id='victim'){state.players[1].board[0]={...generateCardInstance({...unit,health},{instanceId:id}),boardSlot:0};}
function settle(state:GameState){while(state.targetingState?.active){const frame=state.targetingState;const result=executeAction(JSON.parse(JSON.stringify(state)),{type:frame.phase==='PRE_COMMIT'?'CONFIRM_PRECOMMIT_TARGET':'SELECT_EFFECT_TARGET',playerId:frame.playerId,targetId:frame.validTargetIds[0]!});assert.ok(result.success);state=result.state;}return state;}
function cast(state:GameState){const result=executeAction(state,{type:'USE_CHAMPION_ABILITY',playerId:'player-1'});assert.ok(result.success);return settle(result.state);}
function end(state:GameState){const result=executeAction(state,{type:'END_TURN',playerId:state.activePlayerId!});assert.ok(result.success);return settle(result.state);}
for(const upgraded of [false,true])for(const health of [1,2,3])test(`Belmort ${upgraded?'upgraded':'basic'} ability versus health ${health}: only its lethal damage becomes destruction`,()=>{
 const state=setup();victim(state,health);state.players[0].champion!.questCompleted=upgraded;const beforeGold=state.players[0].currentGold;const n=cast(state);assert.equal(n.players[0].currentGold,beforeGold-1);const lethal=health<=(upgraded?2:1);assert.equal(n.events.filter(e=>e.type==='CARD_DESTROYED'&&e.cardInstanceId==='victim').length,lethal?1:0);assert.equal(n.events.filter(e=>e.type==='CARD_RETIRED').length,0);assert.equal(n.players[1].graveyard.length,0);assert.equal(n.players[1].board[0]?.currentHealth??null,lethal?null:health-(upgraded?2:1));if(!upgraded)assert.equal(n.players[0].champion!.questProgress,lethal?1:0);
});
test('Belmort nonlethal damage never replaces a later unrelated retirement',()=>{let n=setup();victim(n,3);n=cast(n);n=applyEffect(n,'player-1',generateCardInstance(unit,{instanceId:'other-source'}),{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'ALL',count:4},values:{amount:2}});assert.equal(n.players[1].graveyard.length,1);assert.equal(n.events.filter(e=>e.type==='CARD_DESTROYED').length,0);assert.equal(n.players[0].champion!.questProgress,0);});
test('Belmort completes ten actual destruction events once, deploys the linked token and really upgrades the next ability',()=>{
 let n=setup();for(let i=0;i<10;i++){victim(n,1,'victim-'+i);n=cast(n);assert.equal(n.players[0].champion!.questProgress,i+1);if(i<9)n=end(end(n));}
 assert.equal(n.players[0].champion!.questCompleted,true);assert.equal(n.events.filter(e=>e.type==='CHAMPION_QUEST_COMPLETED').length,1);const tokenId=champs.find(c=>c.id===champion.id)!.championTokenDefinitionId!;assert.ok(n.players[0].board.some(c=>c?.definitionId===tokenId));
 n=end(end(n));victim(n,3,'upgraded-victim');n=cast(n);assert.equal(n.players[1].board[0]!.currentHealth,1);assert.equal(n.events.filter(e=>e.type==='CHAMPION_QUEST_COMPLETED').length,1);
});

test('Belmort quest counts owner-caused destruction of either side; ignores opponent destruction, retirement and replay',()=>{
 let n=setup();victim(n,3);n.players[0].board[0]={...generateCardInstance(unit,{instanceId:'allied-victim'}),boardSlot:0};
 const cause=generateCardInstance(unit,{instanceId:'effect-source'});const destroy=(playerId:string,owner:'SELF'|'ENEMY',targetId:string)=>{const previous=n;n=applyEffect(n,playerId,cause,{type:'STRUCTURED',action:'DESTROY',target:{zone:'BOARD',owner,selection:'PLAYER_CHOICE',count:1}},[targetId]);n=processChampionQuestEvents(previous,n);};
 destroy('player-2','SELF','victim');assert.equal(n.players[0].champion!.questProgress,0);destroy('player-1','SELF','allied-victim');assert.equal(n.players[0].champion!.questProgress,1);
 const replay=processChampionQuestEvents(n,JSON.parse(JSON.stringify(n)));assert.equal(replay.players[0].champion!.questProgress,1);
});
