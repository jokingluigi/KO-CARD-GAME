import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { generateCardInstance } from '../cards/generation';
import type { CardDefinition } from '../cards/types';
import { chooseBestAction } from './ai-evaluator';
import { executeAction, getLegalActions } from './engine-actions';

const body: CardDefinition = {id:'survival-body',name:'QA',cardType:'WRESTLER',cost:1,attack:1,health:1,rulesText:'',keywords:[],abilities:[]};
function setup() {
  const state=createInitialGameState();
  Object.assign(state,{status:'IN_PROGRESS',activePlayerId:'player-1',turn:5,events:[],cardPool:[body]});
  for(const player of state.players) {
    player.health=player.maxHealth=25;player.champion!.health=25;player.champion!.quest=null;
    player.personalTurn=5;player.currentGold=6;player.mulliganUsed=true;
    player.championAbilityUsedThisTurn=true;
    player.board=[null,null,null,null];player.hand=[];player.graveyard=[];
    player.deck=Array.from({length:6},(_,i)=>generateCardInstance(body,{instanceId:`${player.id}:deck:${i}`}));
  }
  return state;
}
test('turn-start stat expiry can end the game before the normal draw without crashing AI search',()=>{
  const state=setup();state.activePlayerId='player-2';
  state.players[0].health=state.players[0].champion!.health=1;
  const expiring:CardDefinition={...body,abilities:[{trigger:'SELF_RETIRE',effects:[{type:'STRUCTURED',action:'DAMAGE',target:{zone:'PLAYER',owner:'SELF',selection:'SELF'},values:{amount:2}}]}]};
  state.players[0].board[0]={...generateCardInstance(expiring,{instanceId:'expiring-body'}),boardSlot:0,enteredThisTurn:false,
    temporaryStatModifiers:[{stat:'health',amount:1,untilTurn:999,untilOwnerTurnStart:true}]};
  const result=executeAction(state,{type:'END_TURN',playerId:'player-2'});
  assert.ok(result.success);assert.equal(result.state.status,'FINISHED');assert.equal(result.state.winnerId,'player-2');
  assert.equal(result.state.players[0].hand.length,0);
  assert.ok(!result.state.events.some(e=>e.type==='CARD_DRAWN'));
});
for (const difficulty of ['EASY','NORMAL','HARD','BOSS'] as const) {
  test(`${difficulty}: does not kill its champion even when the opponent threatens lethal next turn`,()=>{
    const state=setup();state.players[0].health=state.players[0].champion!.health=2;
    const selfHarm:CardDefinition={...body,id:'self-harm',cardType:'TECHNIQUE',cost:0,abilities:[{trigger:'ACTIVE',effects:[{type:'STRUCTURED',action:'DAMAGE',target:{zone:'PLAYER',owner:'SELF',selection:'SELF'},values:{amount:3}}]}]};
    state.cardPool.push(selfHarm);
    state.players[0].hand=[generateCardInstance(selfHarm,{instanceId:'self-harm-hand'})];
    state.players[1].board[0]={...generateCardInstance({...body,attack:9,health:9},{instanceId:'enemy-lethal'}),boardSlot:0,enteredThisTurn:false};
    const actions=getLegalActions(state,'player-1');
    const harm=actions.find(a=>a.type==='PLAY_TECHNIQUE');assert.ok(harm);
    assert.equal(executeAction(state,harm).state.winnerId,'player-2');
    assert.equal(chooseBestAction(state,actions,'player-1',difficulty).type,'END_TURN');
  });
  test(`${difficulty}: saves a weak wrestler instead of feeding it into a healthy taunt`,()=>{
    const state=setup();
    state.players[0].board[0]={...generateCardInstance(body,{instanceId:'own-fragile'}),boardSlot:0,enteredThisTurn:false};
    state.players[1].board[0]={...generateCardInstance({...body,id:'wall',attack:3,health:30,keywords:['TAUNT']},{instanceId:'wall'}),boardSlot:0,enteredThisTurn:false};
    const actions=getLegalActions(state,'player-1');assert.ok(actions.some(a=>a.type==='ATTACK'));
    assert.equal(chooseBestAction(state,actions,'player-1',difficulty).type,'END_TURN');
  });
  test(`${difficulty}: still takes a mutually lethal trade that removes a large threat`,()=>{
    const state=setup();
    state.players[0].board[0]={...generateCardInstance({...body,attack:8},{instanceId:'own-trader'}),boardSlot:0,enteredThisTurn:false};
    state.players[1].board[0]={...generateCardInstance({...body,attack:12,health:8,keywords:['TAUNT']},{instanceId:'valuable-threat'}),boardSlot:0,enteredThisTurn:false};
    const chosen=chooseBestAction(state,getLegalActions(state,'player-1'),'player-1',difficulty);
    assert.equal(chosen.type,'ATTACK');
    const result=executeAction(state,chosen);assert.ok(result.success);
    assert.equal(result.state.players[0].board[0],null);
    assert.equal(result.state.players[1].board[0],null);
  });
  test(`${difficulty}: permits useful self-damage that does not kill the champion`,()=>{
    const state=setup();
    const summon:CardDefinition={...body,id:'strong-summon',cost:0,attack:15,health:15,abilities:[{trigger:'ENTER_FIELD',effects:[{type:'STRUCTURED',action:'DAMAGE',target:{zone:'PLAYER',owner:'SELF',selection:'SELF'},values:{amount:2}}]}]};
    state.cardPool.push(summon);state.players[0].hand=[generateCardInstance(summon,{instanceId:'useful-self-damage'})];
    const chosen=chooseBestAction(state,getLegalActions(state,'player-1'),'player-1',difficulty);
    assert.equal(chosen.type,'PLAY_WRESTLER');
    const result=executeAction(state,chosen);assert.ok(result.success);
    assert.equal(result.state.players[0].health,23);
  });
}
