import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { championRecordToDefinition } from "../champions/published-champions";
import { currentChampionAbility } from "../champions/types";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import { executeAction, getLegalActions } from "../actions/engine-actions";
const record=JSON.parse(readFileSync("docs/qa/snapshots/20261111-admin/champions.json","utf8")).find((c:any)=>c.id==="bcffab96-f61f-497e-b60b-de5a869837d3");
// Read back from the live public catalog on Nov 11, version 44. DB is not changed.
const current={...record,name:"판도라",version:44,abilityText:"자신이 선택한 선수 카드에게 1 데미지를 줍니다. 핀폴로 처치했다면 체력을 2 회복합니다."};
const unit={id:"pandora-single-unit",name:"격리 선수",cardType:"WRESTLER" as const,rarity:"NORMAL" as const,cost:1,attack:1,health:4,keywords:[],abilities:[],rulesText:""};
function setup(hp=1){
 const champion=championRecordToDefinition(current);
 const state=createInitialGameState([champion.id,champion.id],[unit],[champion]);
 Object.assign(state,{status:"IN_PROGRESS",turn:3,activePlayerId:"player-1",openingMulligan:false,events:[]});
 for(const p of state.players){p.hand=[];p.board=[null,null,null,null];p.currentGold=4;p.health=10;}
 for(let i=0;i<2;i++)state.players[1].board[i]={...generateCardInstance(unit,{instanceId:"enemy-"+i}),boardSlot:i,currentHealth:i?4:hp};
 return state;
}
test("latest Pandora text builds one board-card target, costs one gold and heals own exact kill",()=>{
 let state=setup();
 const ability=currentChampionAbility(state.players[0].champion)!;
 assert.equal(ability.cost,1);assert.match(ability.description,/선수 카드에게/);
 let result=executeAction(state,{type:"USE_CHAMPION_ABILITY",playerId:"player-1"});assert.ok(result.success);state=result.state;
 assert.equal(state.targetingState?.maxTargets,1);assert.equal(state.players[0].currentGold,3);
 result=executeAction(state,{type:"SELECT_EFFECT_TARGET",playerId:"player-1",targetId:"enemy-0"});assert.ok(result.success);state=result.state;
 assert.equal(state.targetingState,undefined);assert.equal(state.players[0].health,12);
 assert.equal(state.players[1].board[1]?.currentHealth,4);assert.equal(state.players[1].graveyard.length,1);
 assert.equal(executeAction(state,{type:"SELECT_EFFECT_TARGET",playerId:"player-1",targetId:"enemy-1"}).success,false);
 assert.equal(executeAction(state,{type:"USE_CHAMPION_ABILITY",playerId:"player-1"}).success,false);
});
test("damage without a pinfall does not heal and cannot target a champion",()=>{
 let result=executeAction(setup(2),{type:"USE_CHAMPION_ABILITY",playerId:"player-1"});assert.ok(result.success);
 assert.ok(!result.state.targetingState?.validTargetIds.includes("player-2"));
 result=executeAction(result.state,{type:"SELECT_EFFECT_TARGET",playerId:"player-1",targetId:"enemy-0"});assert.ok(result.success);
 assert.equal(result.state.players[0].health,10);assert.equal(result.state.players[1].board[0]?.currentHealth,1);
});
test("legacy saved multi-selection reopens as one choice and never resolves the older selected victim",()=>{
 const result=executeAction(setup(),{type:"USE_CHAMPION_ABILITY",playerId:"player-1"});assert.ok(result.success);
 const state=structuredClone(result.state),pending=state.targetingState!;
 pending.maxTargets=8;pending.selectedTargetIds=["enemy-1"];
 const effect=pending.effects[pending.effectIndex];if(effect.type==="STRUCTURED")effect.target={...effect.target!,count:8,minTargets:1,maxTargets:8};
 assert.ok(!getLegalActions(state,"player-1").some(a=>a.type==="SELECT_EFFECT_TARGET"&&a.targetId==="effect:confirm"));
 const selected=executeAction(state,{type:"SELECT_EFFECT_TARGET",playerId:"player-1",targetId:"enemy-0"});assert.ok(selected.success);
 assert.equal(selected.state.players[0].currentGold,3);assert.equal(selected.state.players[0].health,12);
 assert.equal(selected.state.players[1].board[1]?.currentHealth,4);assert.equal(selected.state.players[1].graveyard.length,1);
});
