import { AdminTagManager } from "../src/components/admin-tag-manager";
// Development-only: real shared engine and battle view; never included in production.
import { AdminChampionManager } from '../src/components/admin-champion-manager';
import { AdminCardManager } from '../src/components/admin-card-manager';
import { directDeployChampionToken } from '../src/game/engine/champion-token';
import { TEST_CHAMPION_TOKEN_DEFINITION } from '../src/game/cards/test-cards';
import { MAX_HAND_SIZE } from '../src/game/rules/constants';
import React, { useState } from 'react';
import {createRoot} from 'react-dom/client';
import '../src/index.css';
import '../src/battle-presentation.css';
import {GameStatePreview} from '../src/components/game-state-preview';
import {createInitialGameState, generateCardInstance,setRuntimeCardDefinitions,type CardDefinition,type GameState} from '../src/game';
import {emptyGameMediaCatalog} from '../src/game/media';
import {applyEffect} from '../src/game/effects/effect-engine';
import {drawCard} from '../src/game/engine/draw-card';
import {silenceCard} from '../src/game/engine/card-status';
import {destroyCard} from '../src/game/engine/destroy-card';
import {executeAction} from '../src/game/actions/engine-actions';
const def:CardDefinition={id:'master-qa',name:'연출 검증 선수',cardType:'WRESTLER',cost:1,attack:4,health:20,summonLine:'등장 대사',retireLine:'리타이어 대사',destroyLine:'파괴 대사',rulesText:'아머 2.',keywords:['ARMOR'],effectConfig:{armor:2},abilities:[],rarity:'COMMON'};
setRuntimeCardDefinitions([def, TEST_CHAMPION_TOKEN_DEFINITION]);
function initial(){
 const s=createInitialGameState(undefined,[def]);s.status='IN_PROGRESS';s.turn=2;s.activePlayerId='player-1';s.events=[];
 for(const p of s.players){p.currentGold=10;p.hand=[];p.board=[null,null,null,null];p.champion!.quest=null;
  p.deck=Array.from({length:12},(_,i)=>generateCardInstance(def,{instanceId:p.id+'-deck-'+i}));
  for(let i=0;i<2;i++)p.board[i]={...generateCardInstance(def,{instanceId:p.id+'-board-'+i}),boardSlot:i as 0|1,enteredThisTurn:false,hasAttackedThisTurn:false};
 }
 for(let i=0;i<4;i++)s.players[0].hand.push(generateCardInstance(def,{instanceId:'hand-'+i}));
 return s;
}
const noop=()=>{};
function Scene(){
 const [state,setState]=useState(initial),[selected,setSelected]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[failure,setFailure]=useState('');
 const [expected,setExpected]=useState(()=>JSON.stringify(state));
 const update=(s:GameState)=>{setExpected(JSON.stringify(s));setState(s);};
 const run=(kind:string)=>{
  let next=state;const p=next.players[0],enemy=next.players[1],source=p.board.find(Boolean)!;
  if(kind==='reward'||kind==='reward-full'){next=initial();next.activePlayerId='player-2';next.cardPool=[def,TEST_CHAMPION_TOKEN_DEFINITION];for(const i of [0,1,2,3] as const)next.players[0].board[i]={...generateCardInstance(def,{instanceId:'replace-'+i}),boardSlot:i};if(kind==='reward-full')next.players[0].hand=Array.from({length:MAX_HAND_SIZE},(_,i)=>generateCardInstance(def,{instanceId:'hand-'+i}));next=directDeployChampionToken(next,'player-1',next.players[0].champion!.id,TEST_CHAMPION_TOKEN_DEFINITION.id,'CHAMPION_QUEST_REWARD');update(next);return;}
  if(kind==='reset'){update(initial());return;}
  if(kind==='draw'){for(let i=0;i<3;i++)next=drawCard(next,p.id);}
  if(kind==='damage')next=applyEffect(next,p.id,source,{type:'DAMAGE_OPPONENT_CHAMPION',amount:6});
  if(kind==='buff')next=applyEffect(next,p.id,source,{type:'MODIFY_SELF_ATTACK',amount:3});
  if(kind==='silence')next=silenceCard(next,source.instanceId);
  if(kind==='destroy')next=destroyCard(next,p.id,source.instanceId).state;
  if(kind==='retire')next=applyEffect(next,p.id,source,{type:'STRUCTURED',action:'RETIRE',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1}});
  if(kind==='attack'){
   const result=executeAction(next,{type:'ATTACK',playerId:p.id,attackerInstanceId:source.instanceId,target:{type:'WRESTLER',playerId:enemy.id,cardInstanceId:enemy.board.find(Boolean)!.instanceId}});
   if(!result.success)setFailure(result.message);next=result.state;
  }
  if(kind==='turn')next=executeAction(next,{type:'END_TURN',playerId:next.activePlayerId!}).state;
  if(kind==='restore')next=JSON.parse(JSON.stringify(next));
  if(kind==='burst')for(let i=0;i<32;i++)next=applyEffect(next,p.id,source,{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{attack:1}});
  update(next);
 };
 return <>
 <div style={{position:'fixed',top:0,left:0,zIndex:1000,background:'#121212',padding:4,fontSize:10,color:'white'}}>
 {['reset','reward','reward-full','destroy','retire','restore'].map(k=><button data-testid={k} key={k} onClick={()=>run(k)} style={{padding:4}}>{k}</button>)}
 <output data-testid="board-check">tokens:{state.players[0].board.filter(c=>c?.isChampionToken).length} decktop:{state.players[0].deck[0]?.instanceId} selected:{String(Boolean(state.targetingState))}</output>
 <output data-testid="state-check">{JSON.stringify(state)===expected?'UNCHANGED':'MUTATED'} busy:{String(busy)} events:{state.events.length} hand:{state.players[0].hand.length} {failure}</output>
 </div>
 <GameStatePreview state={state} mediaCatalog={emptyGameMediaCatalog} selectedCardId={selected} selectedAttackerId={null} playError={null} turnSecondsRemaining={60}
  bgmMuted={true} bgmVolume={0} onBgmMutedChange={noop} onBgmVolumeChange={noop} onSurrender={noop} onSelectCard={setSelected}
  onEndTurn={()=>run('turn')} onSelectSlot={noop} onUseTechnique={noop} playAnimation={null} onPlayAnimationComplete={noop}
  attackAnimation={null} attackImpactTriggered={false} onAttackImpact={noop} onAttackAnimationComplete={noop}
  onSelectAttacker={id=>{if(state.targetingState)update(executeAction(state,{type:'SELECT_EFFECT_TARGET',playerId:state.targetingState.playerId,targetId:id}).state);}} onAttackWrestler={noop} onAttackPlayer={noop} onUseActive={noop} onUseChampionAbility={noop}
  onCancelEffectTargeting={noop} onEffectTarget={id=>update(executeAction(state,{type:'SELECT_EFFECT_TARGET',playerId:state.targetingState!.playerId,targetId:id}).state)} onPresentationBusyChange={setBusy} />
 </>;
}
const admin=new URLSearchParams(location.search).get('admin');
createRoot(document.getElementById('root')!).render(admin ? <main className="bg-black p-3 text-white">{admin==='tags'?<AdminTagManager onUnauthorized={()=>{throw Error('unauthorized')}}/>:admin==='champion'?<AdminChampionManager onUnauthorized={()=>{throw Error('unauthorized')}}/>:<AdminCardManager onUnauthorized={()=>{throw Error('unauthorized')}}/>}</main>:<Scene/>);
