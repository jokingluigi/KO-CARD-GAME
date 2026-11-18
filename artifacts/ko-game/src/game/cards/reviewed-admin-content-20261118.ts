import type {CardAbility, CardEffect, StructuredTarget} from '../effects/types';
import type {PublishedCardRecord} from './published-cards';
import {repairedLegacyCardAbilities} from './legacy-card-effect-repair';

const clean=(s:string)=>s.replace(/\s/gu,'');
const fx=(action:Extract<CardEffect,{type:'STRUCTURED'}>['action'],values:Extract<CardEffect,{type:'STRUCTURED'}>['values'],target?:StructuredTarget):CardEffect=>({type:'STRUCTURED',action,values,target});

/** Match reviewed administrator wording, never apply these rules to later revisions. */
export function reviewedNovember18Abilities(card:PublishedCardRecord):CardAbility[]|null{
 if(card.effectId)return null;
 if(card.id==='df532c95-0e4d-4b17-8200-a86e6a682341'&&clean(card.text)===clean("등장: 자신의 양 옆에 이 카드와 챔피언 토튼을 제외한 '디 어쏘리티' 카드들 중에서 무작위로 소환하고 자신을 제외한 생성한 그 선수 카드들에게 '기습'을 부여합니다.\n콤보:'디 어쏘리티' 태그를 가진 아군 선수 카드가 상대를 공격하면 그 카드와 이 카드에게 공격력을 +1 부여합니다. 이 카드는 아군 필드에 이 카드를 제외한 '디 어쏘리티' 태그가 있는 카드가 존재하는 동안 '무적'입니다.(이 카드는 '도발'을 보유 할 수 없습니다.)"))return [
  {trigger:'ENTER_FIELD',effects:[fx('BUFF',{balance:{operation:'SUMMON_RANDOM_ADJACENT',tag:'디 어쏘리티',excludeChampionRarity:true,excludeChampionTokens:true,keyword:'SURPRISE'}})]},
  {trigger:'OTHER_ALLY_ATTACK',effects:[fx('BUFF',{balance:{operation:'BUFF_TAG_ATTACK_PAIR',tag:'디 어쏘리티',attack:1}})]},
  {trigger:'SELF_ENTERED',effects:[],invulnerableWhileOtherAllyTag:'디 어쏘리티',forbiddenKeywords:['TAUNT']},
 ];
 if(card.id==='c651644e-de3b-4e28-b925-a4c9f9bcd29c'&&clean(card.text)===clean('등장:현재 손패에 있는 카드들을 전부 덱으로 보내고, 자신의 손패를 완전히 무작위 카드들로 채우고, 그 카드들의 비용/체력/공격력을 전부 1씩 깍습니다.(비용과 체력은 1이 최소치)'))return [
  {trigger:'ENTER_FIELD',effects:[fx('BUFF',{balance:{operation:'REFILL_RANDOM_HAND',costReduction:1,attackReduction:1,healthReduction:1,minimumCost:1,randomScope:'FULL'}})]},
 ];
 if(card.id==='b6b6247d-4e98-4cfb-8fa6-5479afec48f3'&&clean(card.text)===clean("턴 종료:선택한 아군 선수 카드를 리타이어시키고 그 카드의 체력과 공격력을 흡수하고 '회피'를 1 얻습니다.")){
  return repairedLegacyCardAbilities({...card,text:card.text.replace('턴 종료','턴 시작')})!.map(a=>({...a,trigger:'TURN_END'}));
 }
 if(card.id==='4ad681e3-6ed6-4651-8107-4b24adddd753'&&clean(card.text)===clean("핀폴:'늑대인간 판도라'로 변신합니다."))return [
  {trigger:'EXACT_ZERO_DAMAGE',effects:[fx('TRANSFORM_SOURCE',{definitionRef:{name:'늑대인간 판도라'}})]},
 ];
 return null;
}
