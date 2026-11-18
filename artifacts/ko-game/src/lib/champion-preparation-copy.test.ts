import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {championPreparationCopy} from './champion-preparation-copy';
import {championQuestRewardText} from '../components/champion-quest-reward-text';
import {championRecordToDefinition} from '../game/champions/published-champions';
import {cardRecordToDefinition} from '../game/cards/published-cards';
import {generateCardInstance} from '../game/cards/generation';
import {createInitialGameState} from '../game/engine/create-initial-game-state';
import {processChampionQuestEvents} from '../game/champions/quests';
import type {ChampionState} from '../game/champions/types';
const data=JSON.parse(readFileSync('docs/qa/snapshots/20261118-admin/finisher-regression.json','utf8'));
const rosie=data.champions.find((c:any)=>c.id==='champion-minion-a');
const cal=data.champions.find((c:any)=>c.id==='5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c');
for(const record of data.champions)test(`${record.name}: catalog and runtime both expose configured finishers rather than old upgrades`,()=>{
 const copy=championPreparationCopy(record);assert.equal(copy.linked,true);assert.ok(copy.reward.includes('피니셔'));assert.doesNotMatch(copy.reward,/강화|보상 없음|골드 0/);assert.ok(copy.condition&&!copy.condition.includes('정보가 없습니다'));
 const definition=championRecordToDefinition(record);assert.ok(definition.quest);const q=record.questCondition;
 if(q.finisher){assert.deepEqual(definition.quest.finisher,q.finisher);assert.match(championQuestRewardText(definition as ChampionState),/피니셔/);assert.ok(data.cards.some((c:any)=>c.id===q.finisher.cardDefinitionId));}
 else {assert.equal(definition.quest.finisherChoices?.length,q.finisherChoices.length);for(const option of q.finisherChoices)assert.ok(data.cards.some((c:any)=>c.id===option.cardDefinitionId));}
});
function setup(record:any){const s=createInitialGameState();s.status='IN_PROGRESS';s.openingMulligan=undefined;s.events=[];s.turn=5;s.activePlayerId='player-1';s.cardPool=data.cards.map(cardRecordToDefinition);for(const p of s.players){p.hand=[];p.deck=[];p.board=[null,null,null,null];p.graveyard=[];p.champion!.quest=null;}s.players[0].champion={...s.players[0].champion!,...championRecordToDefinition(record),health:20,questProgress:0,questCompleted:false};return s;}
test('Rosie catalog shows both branch conditions/rewards instead of empty legacy quest fields',()=>{assert.equal(rosie.questText,null);const copy=championPreparationCopy(rosie);assert.match(copy.condition,/12회 생성/);assert.match(copy.condition,/3장 이상/);assert.match(copy.reward,/어셈블/);assert.match(copy.reward,/흉내내기/);assert.equal(copy.linked,true);assert.doesNotMatch(copy.reward,/골드|강화|보상 없음/);});
test('Calavera catalog prioritizes linked finisher over saved legacy upgrade prose',()=>{assert.match(cal.questRewardText,/고유 능력.*강화/);const copy=championPreparationCopy(cal);assert.match(copy.condition,/언데드.*8장/);assert.match(copy.reward,/피니셔.*손패/);assert.doesNotMatch(copy.reward,/강화/);assert.equal(copy.linked,true);});
test('branch reward banner never presents the internal zero-gold placeholder as the reward',()=>{const c=championRecordToDefinition(rosie) as ChampionState;assert.equal(c.quest!.reward.type,'GAIN_GOLD');const text=championQuestRewardText(c);assert.match(text,/어셈블/);assert.match(text,/흉내내기/);assert.doesNotMatch(text,/골드|없음/);});
test('unlinked legacy rewards keep their own descriptions',()=>{const copy=championPreparationCopy({hasQuest:true,questText:'기존 조건',questRewardText:'고유 능력 강화'});assert.deepEqual(copy,{condition:'기존 조건',reward:'고유 능력 강화',linked:false});});
test('Rosie awards Assemble exactly once after twelve generations, not before',()=>{
 let s=setup(rosie);
 for(let i=0;i<12;i++){const before=s;s=processChampionQuestEvents(before,{...s,events:[...s.events,{type:'CARD_GENERATED',playerId:'player-1',cardInstanceId:'generated:'+i}]});assert.equal(Boolean(s.players[0].champion!.questCompleted),i===11);}
 const id='0785ff4f-ce7c-4ab0-83e7-197249767543';assert.equal(s.players[0].hand.filter(c=>c.definitionId===id).length,1);assert.equal(s.players[0].champion!.selectedFinisherId,'option-1');assert.match(championQuestRewardText(s.players[0].champion!),/어셈블/);assert.doesNotMatch(championQuestRewardText(s.players[0].champion!),/흉내내기/);s=processChampionQuestEvents(s,s);assert.equal(s.players[0].hand.filter(c=>c.definitionId===id).length,1);
});
test('Calavera awards the saved Ultimate Undead finisher at eight undead in graveyard and never substitutes ability upgrade',()=>{
 let s=setup(cal);const body={...s.cardPool![0],id:'undead-fixture',cardType:'WRESTLER' as const,isChampionToken:false,isToken:false,tags:['언데드'],cost:1,attack:1,health:1};
 const originalAbility=s.players[0].champion!.ability;
 for(let i=0;i<8;i++){const before=s;s=processChampionQuestEvents(before,{...s,players:s.players.map((p,n)=>n? p:{...p,graveyard:[...p.graveyard,generateCardInstance(body,{instanceId:'grave:'+i})]})});assert.equal(Boolean(s.players[0].champion!.questCompleted),i===7);}
 assert.equal(s.players[0].hand.filter(c=>c.definitionId==='2f47b929-7035-4bb9-abea-0af6a6f9c72d').length,1);assert.deepEqual(s.players[0].champion!.ability,originalAbility);s=processChampionQuestEvents(s,s);assert.equal(s.players[0].hand.length,1);
});
