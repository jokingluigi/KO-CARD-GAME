import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeAction, getLegalActions } from '../actions/engine-actions';
import { createInitialGameState } from './create-initial-game-state';
import { drawCard } from './draw-card';
import { enterField } from './enter-field';
import { canUseActiveAbility } from './card-status';
import { applyEffect } from '../effects/effect-engine';
import { cardRecordToDefinition, type PublishedCardRecord } from '../cards/published-cards';
import { generateCardInstance } from '../cards/generation';
import { lunaSelfSilenceRecord, LUNA_ID, LUNA_RULES_TEXT } from '../cards/luna';
import { matchTurnNumber } from '../../../../../lib/game-engine/src/rules';
import { evaluateChampionQuestCondition } from '../../../../../lib/game-engine/src/champion-quest-conditions';
import type { CardDefinition } from '../cards/types';
import type { CardEffect } from '../effects/types';
import type { GameState } from '../types/game-state';

const unit: CardDefinition = {id:'mechanic-unit',name:'검사 선수',cardType:'WRESTLER',cost:1,attack:3,health:20,
  rulesText:'',keywords:[],abilities:[],isToken:false,isChampionToken:false};
const active: CardDefinition = {...unit,id:'mechanic-active',keywords:['RUSH'],
  abilities:[{trigger:'ACTIVE',effects:[{type:'GAIN_GOLD',amount:2}]}]};
const damage: CardEffect = {type:'STRUCTURED',action:'DAMAGE',values:{amount:4},
  target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1}};
const fixture: PublishedCardRecord[] = JSON.parse(readFileSync(new URL('../qa/fixtures/card-audit-2026-10-05.json',import.meta.url),'utf8')).cards;
const lunaRecord = fixture.find(c=>c.id===LUNA_ID)!;
const luna = cardRecordToDefinition(lunaRecord);

function setup(definition: CardDefinition = active) {
  // Owned-deck generation, draw and online-style serialization must keep the entry markers.
  let state = createInitialGameState(undefined,[definition,unit],undefined,
    [[definition.id,...Array(24).fill(unit.id)],Array(25).fill(unit.id)]);
  state.status='IN_PROGRESS';state.turn=1;state.activePlayerId='player-1';
  for(const player of state.players){player.currentGold=100;player.mulliganUsed=true;}
  state=JSON.parse(JSON.stringify(drawCard(state,'player-1')));
  return state;
}
function play(state:GameState){
  const result=executeAction(state,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:state.players[0].hand[0].instanceId,boardSlot:0});
  assert.ok(result.success);return result.state;
}
function end(state:GameState){
  const result=executeAction(state,{type:'END_TURN',playerId:state.activePlayerId!});
  assert.ok(result.success);return result.state;
}
function enemy(state:GameState,definition:CardDefinition=unit){
  state.players[1].board[0]={...generateCardInstance(definition,{instanceId:'enemy'}),boardSlot:0};
  return state.players[1].board[0]!;
}

test('armor reduces attack and retaliation independently, never effect damage',()=>{
  const armored={...unit,id:'armored',keywords:['ARMOR' as const],effectConfig:{armor:2}};
  let state=setup(armored);
  state.players[0].board[0]={...generateCardInstance(armored,{instanceId:'ally'}),boardSlot:0};
  state.players[0].hand=[];enemy(state,armored);
  const hit=executeAction(state,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'ally',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});
  assert.ok(hit.success);
  assert.equal(hit.state.players[0].board[0]!.currentHealth,19);
  assert.equal(hit.state.players[1].board[0]!.currentHealth,19);
  const effect=applyEffect(state,'player-1',state.players[0].board[0]!,damage,['enemy']);
  assert.equal(effect.players[1].board[0]!.currentHealth,16);
});

test('armor bypass does not bypass defense or consume dodge while defense blocks the effect',()=>{
  const state=play(setup());
  const target=enemy(state,{...unit,keywords:['ARMOR','DEFENSE','DODGE'],effectConfig:{armor:99,dodgeCharges:1}});
  target.entryDefenseActive=true;
  let result=applyEffect(state,'player-1',state.players[0].board[0]!,damage,['enemy']);
  assert.equal(result.players[1].board[0]!.currentHealth,20);
  assert.equal(result.players[1].board[0]!.dodgeCharges,1);
  result.players[1].board[0]!.entryDefenseActive=false;
  result=applyEffect(result,'player-1',result.players[0].board[0]!,damage,['enemy']);
  assert.equal(result.players[1].board[0]!.currentHealth,20);
  assert.equal(result.players[1].board[0]!.dodgeCharges,0);
  result=applyEffect(result,'player-1',result.players[0].board[0]!,damage,['enemy']);
  assert.equal(result.players[1].board[0]!.currentHealth,16);
});

test('a played Rush card cannot activate until its next own turn, then only once that turn',()=>{
  let state=play(setup());const id=state.players[0].board[0]!.instanceId;
  const action={type:'USE_ACTIVE' as const,playerId:'player-1',cardInstanceId:id};
  const before=structuredClone(state),blocked=executeAction(state,action);
  assert.equal(blocked.success,false);assert.equal(blocked.errorCode,'SUMMONED_THIS_TURN');
  assert.deepEqual(blocked.state,before);
  assert.equal(canUseActiveAbility(state,'player-1',id),false);
  assert.ok(!getLegalActions(state,'player-1').some(a=>a.type==='USE_ACTIVE'));
  state=end(state);assert.equal(canUseActiveAbility(state,'player-1',id),false);
  state=end(state);assert.equal(canUseActiveAbility(state,'player-1',id),true);
  assert.ok(getLegalActions(state,'player-1').some(a=>a.type==='USE_ACTIVE'));
  const gold=state.players[0].currentGold,result=executeAction(state,action);
  assert.ok(result.success);assert.equal(result.state.players[0].currentGold,gold+2);
  assert.equal(executeAction(result.state,action).success,false);
});

test('target precommit cannot bypass entry cooldown and becomes available next own turn',()=>{
  let state=play(setup({...active,abilities:[{trigger:'ACTIVE',effects:[damage]}]}));enemy(state);
  const id=state.players[0].board[0]!.instanceId;
  const action={type:'BEGIN_TARGETED_ACTION' as const,playerId:'player-1',action:{type:'USE_ACTIVE' as const,cardInstanceId:id}};
  const before=structuredClone(state),blocked=executeAction(state,action);
  assert.equal(blocked.success,false);assert.deepEqual(blocked.state,before);
  state=end(end(state));const available=executeAction(state,action);
  assert.ok(available.success);assert.equal(available.state.targetingState?.phase,'PRE_COMMIT');
  const confirmed=executeAction(available.state,{type:'CONFIRM_PRECOMMIT_TARGET',playerId:'player-1',targetId:'enemy'});
  assert.ok(confirmed.success);assert.equal(confirmed.state.players[1].board[0]!.currentHealth,16);
});

test('summoned cards wait until next own turn; opponent-turn summon is ready at the following own turn',()=>{
  for(const opponentTurn of [false,true]){
    let state=setup();if(opponentTurn)state.activePlayerId='player-2';
    const card=state.players[0].hand[0];state.players[0].hand=[];
    state=enterField(state,'player-1',card,0,undefined,undefined,'SUMMON');
    assert.equal(canUseActiveAbility(state,'player-1',card.instanceId),false);
    state=end(state);if(!opponentTurn)state=end(state);
    assert.equal(canUseActiveAbility(state,'player-1',card.instanceId),true);
  }
});

test('returning and replaying a ready card restarts its entry cooldown',()=>{
  let state=end(end(play(setup())));const id=state.players[0].board[0]!.instanceId;
  assert.equal(canUseActiveAbility(state,'player-1',id),true);
  state=applyEffect(state,'player-1',state.players[0].board[0]!,{type:'STRUCTURED',action:'MOVE_TO_HAND',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1}});
  state.players[0].currentGold=100;
  const replay=executeAction(state,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:id,boardSlot:0});
  assert.ok(replay.success);assert.equal(canUseActiveAbility(replay.state,'player-1',id),false);
});

test('Luna silences the first attacker and herself after combat, removing keywords and buffs',()=>{
  let state=play(setup(luna));
  const target=state.players[0].board[0]!;
  target.currentAttack=9;target.maxHealth=10;target.currentHealth=5;
  enemy(state,{...unit,keywords:['REGEN']});
  state=end(state);
  const hit=executeAction(state,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'enemy',target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:target.instanceId}});
  assert.ok(hit.success);
  const after=hit.state.players[0].board[0]!,attacker=hit.state.players[1].board[0]!;
  assert.equal(after.isSilenced,true);assert.equal(attacker.isSilenced,true);
  assert.deepEqual(after.keywords,[]);assert.deepEqual(attacker.keywords,[]);
  assert.equal(Boolean(after.isAbilityDisabled),false);
  assert.deepEqual([after.currentAttack,after.maxHealth,after.currentHealth],[luna.attack,luna.health,3]);
  assert.equal(attacker.currentHealth,11,'combat uses pre-silence attack');
  assert.equal(luna.rulesText,LUNA_RULES_TEXT);
});

test('Luna self-silence never revives her after lethal combat',()=>{
  let state=play(setup(luna));const id=state.players[0].board[0]!.instanceId;
  state.players[0].board[0]!.currentHealth=1;enemy(state);state=end(state);
  const hit=executeAction(state,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'enemy',target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:id}});
  assert.ok(hit.success);assert.equal(hit.state.players[0].board[0],null);
  assert.equal(hit.state.players[1].board[0]!.isSilenced,true);
});

test('Luna compatibility repair preserves printed stats and later administrator edits',()=>{
  const before=structuredClone(lunaRecord),repaired=lunaSelfSilenceRecord(lunaRecord);
  assert.deepEqual(lunaRecord,before);
  assert.deepEqual([repaired.cost,repaired.attack,repaired.health],[before.cost,before.attack,before.health]);
  assert.equal(repaired.text,LUNA_RULES_TEXT);
  assert.deepEqual(lunaSelfSilenceRecord(repaired),repaired);
  const custom={...before,text:'관리자가 변경한 설명'};
  assert.equal(lunaSelfSilenceRecord(custom),custom);
});

test('both players share the displayed turn and fifth-turn conditions unlock on action turns nine and ten',()=>{
  let state=setup();const displays=[];
  for(let i=1;i<=10;i++){
    assert.equal(state.turn,i);displays.push(matchTurnNumber(state.turn));
    for(const player of state.players)assert.equal(evaluateChampionQuestCondition({type:'TURN',turn:5},state,player.id,[]).completed,i>=9);
    if(i<10)state=end(state);
  }
  assert.deepEqual(displays,[1,1,2,2,3,3,4,4,5,5]);
});
