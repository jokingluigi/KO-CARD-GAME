import {LESSONS,createTutorialLesson,tutorialGoal,tutorialActionAllowed,executeAction,type LessonId,type TutorialCatalog,type GameAction} from '@workspace/game-engine';
export type TutorialProof={lessonId:LessonId;gameId:string;actions:GameAction[]};
/** Rebuild from server-owned definitions. A browser completion flag is never proof. */
export function replayTutorial(value:unknown,catalog:TutorialCatalog):TutorialProof {
 const p=value as Partial<TutorialProof>|null;
 if(!p||!LESSONS.some(l=>l.id===p.lessonId)||typeof p.gameId!=='string'||!/^tutorial:[a-zA-Z0-9:_-]{1,100}$/.test(p.gameId)||!Array.isArray(p.actions)||!p.actions.length||p.actions.length>80)throw Error('실습 완료 기록을 확인할 수 없어요.');
 const lessonId=p.lessonId as LessonId;
 let state=createTutorialLesson(catalog,lessonId,p.gameId),cancelled=false;
 for(const raw of p.actions){
  if(!raw||typeof raw!=='object'||raw.playerId!==state.players[0].id||!tutorialActionAllowed(lessonId,tutorialGoal(lessonId,state,catalog,cancelled),raw,cancelled))throw Error('실습 순서를 다시 확인해 주세요.');
  const wasPrecommit=state.targetingState?.phase==='PRE_COMMIT';
  const result=executeAction(state,raw);
  if(!result.success)throw Error('실습 행동을 확인하지 못했어요.');
  state=result.state;
  if(raw.type==='CANCEL_EFFECT_TARGET'&&wasPrecommit&&!state.targetingState?.active)cancelled=true;
  if(raw.type==='END_TURN'&&state.status==='IN_PROGRESS'){
   const pass=executeAction(state,{type:'END_TURN',playerId:state.players[1].id});
   if(!pass.success)throw Error('실습 턴을 확인하지 못했어요.');state=pass.state;
  }
 }
 if(!tutorialGoal(lessonId,state,catalog,cancelled).complete)throw Error('실습 목표를 완료한 뒤 보상을 받을 수 있어요.');
 return p as TutorialProof;
}
