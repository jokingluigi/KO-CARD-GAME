import {validFinisherChoices,validFinisherReward} from '../game/champions/finisher-config';
type RecordCopy={hasQuest:boolean;questText?:string|null;questRewardText?:string|null;questCondition?:unknown};
/** Linked finishers take precedence over legacy quest/upgrade prose in catalog views. */
export function championPreparationCopy(record:RecordCopy){
 const config=record.questCondition&&typeof record.questCondition==='object'?record.questCondition as Record<string,unknown>:{};
 if(record.hasQuest&&validFinisherChoices(config.finisherChoices)){
  const options=config.finisherChoices;
  return {condition:options.map(o=>`${o.name}: ${o.description}`).join('\n'),reward:options.map(o=>`${o.name}: ${o.delivery==='CAST'?'피니셔를 즉시 발동합니다.':'피니셔를 손패에 추가합니다.'}`).join('\n')+'\n먼저 조건을 완료한 피니셔 하나를 획득합니다. 동시에 완료하면 선택합니다.',linked:true};
 }
 if(record.hasQuest&&validFinisherReward(config.finisher))return {condition:record.questText||'준비 조건 정보가 없습니다.',reward:config.finisher.delivery==='CAST'?'연결한 피니셔를 기본 골드 비용 없이 즉시 발동합니다.':'연결한 피니셔를 손패에 추가합니다. 손패가 가득 차면 버릴 카드를 선택합니다.',linked:true};
 return {condition:record.questText||'준비 조건 정보가 없습니다.',reward:record.questRewardText??'',linked:false};
}
