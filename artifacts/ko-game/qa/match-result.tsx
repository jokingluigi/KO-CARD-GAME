import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../src/index.css';
import '../src/battle-presentation.css';
import '../src/mobile-battle.css';
import {MatchResultOverlay} from '../src/components/match-result-overlay';
import {boardFixture,definitions} from './black-gold-fixture';
import {generateCardInstance,setRuntimeCardDefinitions} from '../src/game';
import {executeAction} from '../src/game/actions/engine-actions';
if(!import.meta.env.DEV)throw Error('Development QA only');
setRuntimeCardDefinitions(definitions);
type Options={outcome?:'victory'|'defeat'|'complete';rewardStatus?:'pending'|'success'|'error';questError?:string;empty?:boolean;continueLabel?:string;long?:boolean};
function finished(options:Options){
 const s=boardFixture();s.events=[];s.gameId=crypto.randomUUID();s.turn=12;s.cardPool=definitions;
 const plain=definitions.find(c=>c.name==='리버덩크')!;
 const winner=options.outcome==='defeat'?1:0,loser=1-winner;
 s.players.forEach((p,i)=>{p.hand=[];p.board=[null,null,null,null];p.champion!.presentationLines={BEFORE_QUEST:{VICTORY:'RESULT MUST NOT SPEAK WIN',DEFEAT:'RESULT MUST NOT SPEAK LOSE'}};p.health=i===loser?5:18;});
 s.players[winner]!.board[0]={...generateCardInstance(plain,{instanceId:'result-finisher'}),boardSlot:0,enteredThisTurn:false,attacksUsedThisTurn:0,currentAttack:8,currentHealth:6,maxHealth:6};
 s.events=[{type:"ENTER_FIELD",playerId:s.players[winner]!.id,cardInstanceId:"result-finisher"}];
 s.activePlayerId=s.players[winner]!.id;
 const r=executeAction(s,{type:'ATTACK',playerId:s.activePlayerId,attackerInstanceId:'result-finisher',target:{type:'PLAYER',playerId:s.players[loser]!.id}});
 if(!r.success)throw Error(r.message);
 if(options.empty){r.state.events=[];r.state.players.forEach(p=>{p.champion=null;p.board=[null,null,null,null];p.graveyard=[]});}
 if(options.outcome==='complete'){r.state.winnerId=null;r.state.loserId=null;}
 return r.state;
}
function Scene(){
 const [options,setOptions]=useState<Options>({outcome:'victory',rewardStatus:'success'}),[state,setState]=useState(()=>finished({})),[counts,setCounts]=useState({returns:0,rewards:0,quests:0});
 (window as any).showResult=(value:Options)=>{setOptions(value);setState(finished(value));};
 return <><output hidden data-testid="result-callbacks">{JSON.stringify(counts)}</output><MatchResultOverlay key={state.gameId} state={state} opponentNickname={options.long?'아주 긴 상대 닉네임과 챔피언 이름을 가진 플레이어':'상대 플레이어'} reward={options.rewardStatus==='success'?{amount:200,sourceType:'AI'}:null} rewardStatus={options.rewardStatus} rewardError="연결을 다시 확인해 주세요." questError={options.questError} continueLabel={options.continueLabel} onRetryReward={()=>setCounts(c=>({...c,rewards:c.rewards+1}))} onRetryQuest={()=>setCounts(c=>({...c,quests:c.quests+1}))} onReturnToMainMenu={()=>setCounts(c=>({...c,returns:c.returns+1}))}/></>;
}
createRoot(document.getElementById('root')!).render(<Scene/>);
