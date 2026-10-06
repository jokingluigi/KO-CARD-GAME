import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAction, getLegalActions } from '../actions/engine-actions';
import { chooseBestAction } from '../actions/ai-evaluator';
import { createInitialGameState } from './create-initial-game-state';
import { drawCard } from './draw-card';
import { enterField } from './enter-field';
import { advanceCountdown } from './countdown';
import { startGame } from './turn-system';
import { silenceCard } from './card-status';
import { applyEffect, selectEffectTarget } from '../effects/effect-engine';
import { generateCardInstance } from '../cards/generation';
import { abilitiesFor } from '../cards/published-cards';
import { grantCardText } from '../cards/granted-text';
import { resetCardAfterLeavingBoard, resetCardForGraveyard } from '../cards/zone-state';
import { getCardInspectorMetadata } from '../../components/alt-inspector-utils';
import type { CardDefinition } from '../cards/types';
import type { CardEffect } from '../effects/types';
import type { GameState } from '../types/game-state';

const unit:CardDefinition={id:'countdown-filler',name:'검사 선수',cardType:'WRESTLER',cost:1,attack:3,health:20,rulesText:'',keywords:[],abilities:[],isToken:false,isChampionToken:false};
const hit={trigger:'COUNTDOWN',action:'DAMAGE',target:{zone:'PLAYER',owner:'ENEMY',selection:'SELF',count:1},values:{amount:2}};
function definition(turns=3):CardDefinition {
  const config={countdownTurns:turns,effects:[hit]};
  return {...unit,id:'countdown-source',name:'카운트다운 검사',keywords:['COUNTDOWN'],rulesText:`카운트다운(${turns}): 상대 챔피언에게 피해를 2 줍니다.`,effectConfig:config,abilities:abilitiesFor('STRUCTURED_EFFECTS_V1',config)};
}
function setup(card=definition()):GameState {
  let state=createInitialGameState(undefined,[card,unit],undefined,[[card.id,...Array(24).fill(unit.id)],Array(25).fill(unit.id)]);
  state.status='IN_PROGRESS';state.turn=1;state.activePlayerId='player-1';
  for(const player of state.players){player.currentGold=100;player.mulliganUsed=true;}
  return JSON.parse(JSON.stringify(drawCard(state,'player-1')));
}
function play(state:GameState) {
  const result=executeAction(state,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:state.players[0].hand[0].instanceId,boardSlot:0});
  assert.ok(result.success,result.message);return result.state;
}
function end(state:GameState) {
  const result=executeAction(state,{type:'END_TURN',playerId:state.activePlayerId!});assert.ok(result.success,result.message);return result.state;
}
const self={zone:'BOARD' as const,owner:'SELF' as const,selection:'SELF' as const,count:1};

for(const turns of [1,2,3])test(`countdown ${turns} starts on the next owner turn, fires once, and preserves base stats`,()=>{
  let state=play(setup(definition(turns)));const id=state.players[0].board[0]!.instanceId,health=state.players[1].health;
  assert.equal(state.players[0].board[0]!.countdownRemaining,turns);
  assert.equal(advanceCountdown(state,'player-1',id),state);
  for(let remaining=turns-1;remaining>=0;remaining--){
    state=end(state);assert.equal(state.players[0].board[0]!.countdownRemaining,remaining+1);
    state=JSON.parse(JSON.stringify(end(state)));
    const card=state.players[0].board[0]!;
    assert.equal(card.countdownRemaining,remaining);assert.equal(Boolean(card.countdownResolved),remaining===0);
    assert.equal(state.players[1].health,health-(remaining===0?2:0));
    assert.deepEqual([card.baseCost,card.baseAttack,card.baseHealth],[1,3,20]);
    assert.equal(advanceCountdown(state,'player-1',id),state,'same turn cannot tick twice');
  }
  state=end(end(state));assert.equal(state.players[1].health,health-2);
});

test('ticking is immutable, only living owned board cards can advance',()=>{
  const original=play(setup()),id=original.players[0].board[0]!.instanceId;
  const later={...original,turn:3},snapshot=structuredClone(later);
  const next=advanceCountdown(later,'player-1',id);
  assert.equal(next.players[0].board[0]!.countdownRemaining,2);assert.deepEqual(later,snapshot);
  assert.equal(advanceCountdown({...later,activePlayerId:'player-2'},'player-1',id).players[0].board[0]!.countdownRemaining,3);
  const dead=structuredClone(later);dead.players[0].board[0]!.currentHealth=0;
  assert.equal(advanceCountdown(dead,'player-1',id),dead);
  const hand=structuredClone(later);hand.players[0].hand.push(hand.players[0].board[0]!);hand.players[0].board[0]=null;
  assert.equal(advanceCountdown(hand,'player-1',id),hand);
});

test('silence cancels countdown, seal pauses it, and stun does not pause it',()=>{
  for(const status of ['silence','seal','stun']){
    let state=play(setup(definition(1))),health=state.players[1].health;
    if(status==='silence') state=silenceCard(state,state.players[0].board[0]!.instanceId);
    else state.players[0].board[0]={...state.players[0].board[0]!,[status==='seal'?'isAbilityDisabled':'isStunned']:true};
    state=end(end(state));assert.equal(state.players[1].health,health-(status==='stun'?2:0));
    if(status==='silence')assert.equal(state.players[0].board[0]!.countdownRemaining,undefined);
    if(status==='seal')assert.equal(state.players[0].board[0]!.countdownRemaining,1);
  }
});

test('bounce and replay restart the full countdown rather than reusing a resolved clock',()=>{
  let state=end(end(play(setup(definition(1)))));const card=state.players[0].board[0]!,health=state.players[1].health;
  state=applyEffect(state,'player-1',card,{type:'STRUCTURED',action:'MOVE_TO_HAND',target:self});
  const returned=state.players[0].hand.find(c=>c.instanceId===card.instanceId)!;
  assert.equal(returned.countdownRemaining,undefined);assert.equal(returned.countdownResolved,undefined);
  state.players[0].currentGold=100;
  const result=executeAction(state,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:card.instanceId,boardSlot:0});assert.ok(result.success);
  state=result.state;assert.equal(state.players[0].board[0]!.countdownRemaining,1);
  state=end(end(state));assert.equal(state.players[1].health,health-2);
});

for(const reason of ['SUMMON','REVIVE'] as const)test(`${reason} during opponent turn starts the clock and ticks at next own turn`,()=>{
  let state=setup(definition(1));state=end(state);
  const card=state.players[0].hand[0];state.players[0].hand=[];
  state=enterField(state,'player-1',card,0,undefined,undefined,reason);
  const health=state.players[1].health;assert.equal(state.players[0].board[0]!.countdownRemaining,1);
  state=end(state);assert.equal(state.players[1].health,health-2);
});

test('a countdown source summoned during turn start does not tick in that same turn',()=>{
  const timer=definition(1),spawner={...unit,id:'spawner',abilities:abilitiesFor('STRUCTURED_EFFECTS_V1',{effects:[{trigger:'TURN_START',action:'SUMMON',values:{definitionRef:{id:timer.id},count:1}}]})};
  let state=setup(timer);state.cardPool=[unit,timer,spawner];state.players[0].board[0]={...generateCardInstance(spawner,{instanceId:'spawner'}),boardSlot:0};
  state=end(end(state));const spawned=state.players[0].board.find(c=>c?.definitionId===timer.id)!;
  assert.equal(spawned.countdownRemaining,1);assert.equal(spawned.countdownLastTickTurn,state.turn);
  const health=state.players[1].health;state=end(end(state));assert.equal(state.players[1].health,health-2);
});

test('multiple clocks progress separately and destroyed sources never fire',()=>{
  let state=play(setup(definition(1)));const killer=state.players[0].board[0]!;
  killer.abilities=[{trigger:'COUNTDOWN',effects:[{type:'STRUCTURED',action:'DESTROY',target:{zone:'BOARD',owner:'SELF',selection:'ALL',count:4,filter:{excludeSource:true}}}]}];
  state=enterField(state,'player-1',generateCardInstance(definition(1),{instanceId:'victim'}),1,undefined,undefined,'SUMMON');
  const health=state.players[1].health;state=end(end(state));
  assert.equal(state.players[0].board[1],null);assert.equal(state.players[1].health,health);
});

test('script countdown fires through the same clock and preserves actions',()=>{
  const script={version:'SCRIPT_V1',trigger:'COUNTDOWN',steps:[{type:'REPEAT',count:{kind:'CONSTANT',value:3},steps:[{type:'EFFECT',effect:{action:'DAMAGE',target:hit.target,values:{amount:1}}}]}]};
  const card={...definition(1),abilities:abilitiesFor('SCRIPT_V1',{scripts:[script],countdownTurns:1})};
  let state=play(setup(card));const health=state.players[1].health;
  state=end(end(state));assert.equal(state.players[1].health,health-3);
  state=end(end(state));assert.equal(state.players[1].health,health-3);
});

test('granted card text and new keyword grants start on the next turn; removal cancels the clock',()=>{
  let state=play(setup({...unit,id:'countdown-source'}));
  state.players[0].board[0]=grantCardText(state.players[0].board[0]!,definition(2),state.turn);
  let card=state.players[0].board[0]!;assert.equal(card.countdownRemaining,2);
  assert.equal(advanceCountdown(state,'player-1',card.instanceId),state);
  state=end(end(state));assert.equal(state.players[0].board[0]!.countdownRemaining,1);
  state=applyEffect(state,'player-1',state.players[0].board[0]!,{type:'STRUCTURED',action:'REMOVE_KEYWORD',target:self,values:{keyword:'COUNTDOWN'}});
  assert.equal(state.players[0].board[0]!.countdownRemaining,undefined);
  state=applyEffect(state,'player-1',state.players[0].board[0]!,{type:'STRUCTURED',action:'ADD_KEYWORD',target:self,values:{keyword:'COUNTDOWN'}});
  card=state.players[0].board[0]!;assert.equal(card.countdownRemaining,1);assert.equal(card.countdownLastTickTurn,state.turn);
});

test('transform starts a fresh clock and leaving-board normalization removes progress',()=>{
  const timer=definition(3);let state=play(setup(unit));state.cardPool=[unit,timer];
  state=applyEffect(state,'player-1',state.players[0].board[0]!,{type:'STRUCTURED',action:'TRANSFORM_SOURCE',values:{definitionRef:{id:timer.id}}});
  const card=state.players[0].board[0]!;
  assert.equal(card.countdownRemaining,3);assert.equal(card.countdownLastTickTurn,state.turn);
  assert.equal(resetCardForGraveyard(card).countdownRemaining,undefined);
  assert.equal(resetCardAfterLeavingBoard(card).countdownResolved,undefined);
});

test('counter metadata shows remaining count and completed state',()=>{
  let state=play(setup(definition(1)));
  assert.equal(getCardInspectorMetadata(state.players[0].board[0]!).keywords.find(k=>k.key==='COUNTDOWN')!.label,'카운트다운(1)');
  state=end(end(state));
  assert.equal(getCardInspectorMetadata(state.players[0].board[0]!).keywords.find(k=>k.key==='COUNTDOWN')!.label,'카운트다운 · 발동 완료');
});

test('countdown player-choice damage resolves once and normal turn-start effects continue',()=>{
  const timer=definition(1),damage:CardEffect={type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:4}};
  timer.abilities=[{trigger:'COUNTDOWN',effects:[damage]},{trigger:'TURN_START',effects:[{type:'GAIN_GOLD',amount:2}]}];
  let state=play(setup(timer));state.players[1].board[0]={...generateCardInstance({...unit,keywords:['ARMOR'],effectConfig:{armor:999}},{instanceId:'enemy'}),boardSlot:0};
  state=end(end(state));assert.ok(state.targetingState?.active);
  assert.equal(state.players[0].currentGold,state.players[0].personalTurn,'normal turn-start waits for countdown choice');
  assert.equal(state.players[0].board[0]!.countdownResolved,true);
  state=selectEffectTarget(JSON.parse(JSON.stringify(state)),'enemy');
  assert.equal(state.players[1].board[0]!.currentHealth,16);
  assert.equal(state.players[0].currentGold,state.players[0].personalTurn+2);assert.ok(!state.targetingState?.active);
});

test('two target choices resume in board order after serializing the pending clock',()=>{
  const timer=definition(1);timer.abilities=[{trigger:'COUNTDOWN',effects:[{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:2}}]}];
  let state=play(setup(timer));state=enterField(state,'player-1',generateCardInstance(timer,{instanceId:'second'}),1,undefined,undefined,'SUMMON');
  state.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),boardSlot:0};
  state=end(end(state));assert.notEqual(state.targetingState?.sourceInstanceId,'second');
  state=selectEffectTarget(JSON.parse(JSON.stringify(state)),'enemy');assert.equal(state.targetingState?.sourceInstanceId,'second');
  assert.equal(state.players[1].board[0]!.currentHealth,18);
  state=selectEffectTarget(JSON.parse(JSON.stringify(state)),'enemy');assert.equal(state.players[1].board[0]!.currentHealth,16);
  assert.equal(state.pendingCountdownTurnStart,undefined);assert.equal(state.targetingState,undefined);
  state=end(end(state));assert.equal(state.players[1].board[0]!.currentHealth,16);
});

test('a scripted countdown choice resumes subsequent turn-start abilities',()=>{
  const config={countdownTurns:1,scripts:[{version:'SCRIPT_V1',trigger:'COUNTDOWN',steps:[
    {type:'SELECT',id:'victim',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1}},
    {type:'EFFECT',effect:{action:'DAMAGE',target:{resultId:'victim',zone:'BOARD',owner:'ENEMY',cardType:'WRESTLER'},values:{amount:2}}},
  ]}]};
  const timer={...definition(1),abilities:[...abilitiesFor('SCRIPT_V1',config),{trigger:'TURN_START' as const,effects:[{type:'GAIN_GOLD' as const,amount:2}]}]};
  assert.ok(timer.abilities.length>1,'script must be valid before the runtime test');
  let state=play(setup(timer));state.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),boardSlot:0};
  state=end(end(state));assert.ok(state.targetingState?.scriptContinuation);
  state=selectEffectTarget(JSON.parse(JSON.stringify(state)),'enemy');assert.equal(state.players[1].board[0]!.currentHealth,18);
  assert.equal(state.players[0].currentGold,state.players[0].personalTurn+2);assert.equal(state.pendingCountdownTurnStart,undefined);
});

test('missing targets still consume the one-shot clock and do not block turn-start',()=>{
  const timer=definition(1);timer.abilities=[{trigger:'COUNTDOWN',effects:[{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:2}}]}];
  let state=end(end(play(setup(timer))));assert.equal(state.players[0].board[0]!.countdownResolved,true);
  assert.equal(state.targetingState,undefined);assert.equal(state.pendingCountdownTurnStart,undefined);
  state.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),boardSlot:0};
  state=end(end(state));assert.equal(state.players[1].board[0]!.currentHealth,20);
});

test('self destruction at countdown completion skips the source normal turn-start ability',()=>{
  const timer=definition(1);timer.abilities=[{trigger:'COUNTDOWN',effects:[{type:'STRUCTURED',action:'DESTROY',target:self}]},{trigger:'TURN_START',effects:[{type:'GAIN_GOLD',amount:99}]}];
  const state=end(end(play(setup(timer))));assert.equal(state.players[0].board[0],null);
  assert.equal(state.players[0].currentGold,state.players[0].personalTurn);assert.equal(state.pendingCountdownTurnStart,undefined);
});

test('a silenced timer retired and revived from an unregistered match catalog restarts its printed clock',()=>{
  let state=play(setup(definition(1)));const id=state.players[0].board[0]!.instanceId;
  state=silenceCard(state,id);
  const external=generateCardInstance(unit,{instanceId:'external'});
  state=applyEffect(state,'player-1',external,{type:'STRUCTURED',action:'RETIRE',target:{...self,selection:'ALL',count:4}});
  assert.equal(state.players[0].graveyard.find(c=>c.instanceId===id)!.countdownRemaining,undefined);
  state=applyEffect(state,'player-1',external,{type:'STRUCTURED',action:'REVIVE',target:{zone:'GRAVEYARD',owner:'SELF',selection:'ALL',count:4}});
  assert.equal(state.players[0].board[0]!.countdownRemaining,1);assert.equal(state.players[0].board[0]!.isSilenced,false);
  const health=state.players[1].health;state=end(end(state));assert.equal(state.players[1].health,health-2);
});

test('AI completes 20 deterministic matches containing countdown cards and target choices',()=>{
  const cards=[1,2,3].map(n=>({...definition(n),id:`ai-countdown-${n}`,cost:1,health:8,attack:2,
    abilities: n===2 ? [{trigger:'COUNTDOWN' as const,effects:[{type:'STRUCTURED' as const,action:'DAMAGE' as const,target:{zone:'BOARD' as const,owner:'ENEMY' as const,selection:'PLAYER_CHOICE' as const,count:1},values:{amount:2}}]}] : definition(n).abilities}));
  let resolvedSeen=0,choices=0;
  for(let match=0;match<20;match++) {
    let seed=20261006+match;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
    const decks=[0,1].map(offset=>Array.from({length:25},(_,i)=>cards[(i+offset)%3].id));
    let state=startGame(createInitialGameState(undefined,cards,undefined,decks),random);
    for(let actions=0;actions<400 && state.status!=='FINISHED';actions++) {
      const playerId=state.activePlayerId!,legal=getLegalActions(state,playerId);assert.ok(legal.length,'AI must not deadlock on a clock/target choice');
      const chosen=chooseBestAction(state,legal,playerId),before=JSON.stringify(state),result=executeAction(state,chosen);
      assert.ok(result.success,result.message);assert.equal(JSON.stringify(state),before,'countdown actions must not mutate input');
      state=result.state;if(chosen.type==='SELECT_EFFECT_TARGET')choices++;
      if(state.players.some(p=>p.board.some(c=>c?.countdownResolved)))resolvedSeen++;
    }
    assert.equal(state.status,'FINISHED',`countdown AI match ${match} must finish`);
  }
  assert.ok(resolvedSeen>0,'AI games must actually resolve countdowns');assert.ok(choices>0,'AI games must actually select countdown targets');
});
