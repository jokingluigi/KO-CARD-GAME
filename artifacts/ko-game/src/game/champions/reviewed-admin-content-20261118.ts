import type {PublishedChampionRecord} from './published-champions';
const clean=(s:string|null|undefined)=>(s??'').replace(/\s/gu,'');
const rosie='완전히 무작위 카드를 비용/체력/공격력을 전부 1씩 깍아서 생성합니다.(비용과 체력은 1이 최소치)';
/** Keep saved presentation and finisher choices; repair only reviewed mechanical clauses. */
export function reviewedNovember18Champion(record:PublishedChampionRecord):PublishedChampionRecord{
 let r={...record};
 if(record.id==='champion-minion-a'&&[rosie,rosie.replace('최소치','최대치')].some(t=>clean(t)===clean(record.abilityText))){
  r={...r,abilityText:rosie,abilityEffects:{effects:[{action:'GENERATE',target:{zone:'HAND',owner:'SELF',selection:'RANDOM',randomScope:'FULL',count:1},values:{generatedModifiers:{cost:-1,attack:-1,health:-1},generatedMinimumCost:1}}]}};
 }
 if(record.id==='88d106cf-ee5a-4a22-ab0a-47b33589fcac'){
  if(clean(record.abilityText)===clean("선택한 상대 선수 카드에게 2 데미지를 줍니다. 이 효과로 상대 선수 카드가 리타이어했다면 아군 필드에 '로마니 마피아 따까리'를 소환합니다."))r={...r,abilityEffects:{effects:[{action:'BUFF',target:{zone:'BOARD',owner:'ENEMY',cardType:'WRESTLER',selection:'PLAYER_CHOICE',count:1},values:{balance:{operation:'DAMAGE_GENERATE_ON_RETIRE',amount:2,summonName:'로마니 마피아 신입'}}}]}};
  if(clean(record.questText)===clean('고유 능력으로 상대 선수 카드 5번 리타이어'))r={...r,questProgressRequired:5,questCondition:{...r.questCondition,event:'STATE_CONDITION',required:1,condition:{type:'EVENT',event:'CARD_RETIRED',owner:'ENEMY',sourceOwner:'SELF',sourceActionTypes:['USE_CHAMPION_ABILITY'],cardType:'WRESTLER',required:5}}};
 }
 if(record.id==='c52da37b-5e7a-4223-bcf3-73824c677534'){
  if(clean(record.questText)===clean('자신의 챔피언의 체력이 3 이하가 된다.'))r={...r,questProgressRequired:1,questCondition:{...r.questCondition,event:'STATE_CONDITION',required:1,condition:{type:'ALL',conditions:[{type:'HEALTH',owner:'SELF',op:'GTE',value:1},{type:'HEALTH',owner:'SELF',op:'LTE',value:3}]}}};
  if(clean(record.abilityText)===clean('필드에 있는 아군 선수 카드들 중 무작위로 하나의 공격력을 1 증가시키고, 챔피언의 체력을 2 회복한다.'))r={...r,abilityEffects:{effects:[{action:'BUFF',target:{zone:'BOARD',owner:'SELF',cardType:'WRESTLER',selection:'RANDOM',count:1},values:{attack:1}},{action:'HEAL',target:{zone:'PLAYER',owner:'SELF',selection:'SELF',count:1},values:{amount:2}}]}};
 }
 return r;
}
