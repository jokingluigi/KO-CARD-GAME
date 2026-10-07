import type { CardAbility, CardEffect, StructuredTarget } from '../effects/types';
import type { PublishedCardRecord } from './published-cards';

const self: StructuredTarget = {zone:'BOARD',owner:'SELF',selection:'SELF',count:1};
const board = (owner: StructuredTarget['owner'], selection: StructuredTarget['selection']='ALL'): StructuredTarget => ({zone:'BOARD',owner,cardType:'WRESTLER',selection,count:selection==='ALL'?20:1});
const fx = (action: Extract<CardEffect,{type:'STRUCTURED'}>['action'], target?: StructuredTarget, values?: Extract<CardEffect,{type:'STRUCTURED'}>['values']): CardEffect => ({type:'STRUCTURED',action,target,values});
const ability = (trigger: CardAbility['trigger'], effects: CardEffect[]): CardAbility => ({trigger,effects} as CardAbility);

/** Repairs effect-less text using reusable clauses; explicitly authored DSL takes precedence. */
export function textCardAbilities(card: PublishedCardRecord): CardAbility[] | null {
  if (card.effectId || !card.text.trim()) return null;
  const text=card.text.replace(/\s+/g,' ');
  const result: CardAbility[]=[];
  const fusion=/이 카드가 합체\s*(?:하면|되면|시|할 때)/u.test(text);
  if(fusion){
    const n=Number(text.match(/(?:카드\s*(\d+)\s*장|(\d+)\s*데미지|비용을\s*(\d+)|추가로\s*(\d+))/u)?.slice(1).find(Boolean)??1);
    if(/드로우/u.test(text))result.push(ability('ON_FUSION',[fx('DRAW',undefined,{amount:n})]));
    else if(/다음\s*턴.*골드/u.test(text))result.push(ability('ON_FUSION',[fx('ADD_NEXT_TURN_GOLD',undefined,{amount:n})]));
    else if(/손.*무작위.*비용.*감소/u.test(text))result.push(ability('ON_FUSION',[fx('REDUCE_COST',{zone:'HAND',owner:'SELF',selection:'RANDOM',randomScope:'STANDARD',count:1},{amount:n,minimum:0})]));
    else if(/상대 선수.*무작위.*데미지/u.test(text))result.push(ability('ON_FUSION',[fx('DAMAGE',{...board('ENEMY','RANDOM'),randomScope:'STANDARD'},{amount:n})]));
    else if(/합체된 카드.*치유.*부여/u.test(text))result.push(ability('ON_FUSION',[fx('ADD_KEYWORD',board('SELF','FUSION_TARGET'),{keyword:'REGEN'})]));
    else if(/합체된 카드.*흡혈.*부여/u.test(text))result.push(ability('ON_FUSION',[fx('ADD_KEYWORD',board('SELF','FUSION_TARGET'),{keyword:'LIFESTEAL'})]));
  }
  const growth=text.match(/이 카드는 합체\s*할 때\s*마다\s*\+(\d+)\s*\/\s*\+(\d+)/u);
  if(growth)result.push(ability('ON_FUSION',[fx('BUFF',self,{attack:Number(growth[1]),health:Number(growth[2])})]));
  const transform=text.match(/액티브\s*:\s*['‘]([^'’]+)['’]\s*(?:으로|로) 변신/u);
  if(transform&&!/기록된 카운트/u.test(text))result.push(ability('ACTIVE',[fx('TRANSFORM_SOURCE',undefined,{definitionRef:{name:transform[1]}})]));
  const combo=text.match(/콤보\s*:\s*([^.\n]+)/u)?.[1];
  if(combo){
    const n=Number(combo.match(/(\d+)\s*(?:증가|더)/u)?.[1]??0);
    if(n>0){
      const effects:CardEffect[]=[];
      const values=/공격력/u.test(combo)?{attack:n,health:0}:{attack:0,health:n};
      if(/공격한 아군/u.test(combo))effects.push(fx('BUFF',board('SELF','LAST_ATTACKER'),values));
      effects.push(fx('BUFF',self,values));
      if(/챔피언/u.test(combo))effects.push(fx('BUFF',{zone:'PLAYER',owner:'SELF',selection:'SELF',count:1},values));
      result.push(ability('OTHER_ALLY_ATTACK',effects));
    }
  }
  if(/턴 종료\s*:\s*내 덱.*맨 위.*선수.*이 카드의 공격력.*공격력.*증가/u.test(text))result.push(ability('TURN_END',[fx('BUFF',{zone:'DECK',owner:'SELF',cardType:'WRESTLER',selection:'TOP',count:1},{reference:'SOURCE',referenceStat:'CURRENT_ATTACK'})]));
  if(card.cardType==='TECHNIQUE'&&/현재 공격력이\s*(\d+)\s*이하인 모든 선수.*파괴/u.test(text)){
    const n=Number(text.match(/공격력이\s*(\d+)/u)![1]);
    result.push(ability('ACTIVE',[fx('DESTROY',{...board('ALL'),filter:{attack:{compare:'LTE',value:n}}})]));
  }
  if(/카운트다운\s*\((\d+)\).*최대 체력.*공격력.*증가/u.test(text)&&/도발.*무시.*챔피언.*공격/u.test(text)){
    result.push(ability('COUNTDOWN',[
      fx('REMOVE_KEYWORD',self,{keyword:'CANNOT_ATTACK'}),
      fx('BUFF',self,{attackReference:'SOURCE_MAX_HEALTH',ignoreTauntToChampion:true}),
      fx('ADD_KEYWORD',self,{keyword:'RUSH'})
    ]));
  }
  const fusionTag=text.match(/필드에 있는 모든 ['‘]([^'’]+)['’] 카드.*이 카드에 합체/u)?.[1];
  if(fusionTag && /카운트다운\s*\((\d+)\)/u.test(text))result.push(ability('COUNTDOWN',[
    fx('REMOVE_KEYWORD',self,{keyword:'CANNOT_ATTACK'}),
    fx('FUSION',{...board('ALL'),filter:{tagsAny:[fusionTag],excludeSource:true}},{fusionIntoSource:true}),
    fx('ADD_KEYWORD',self,{keyword:'RUSH'}),
    ...(/도발.*무시.*챔피언.*공격/u.test(text)?[fx('BUFF',self,{ignoreTauntToChampion:true})]:[])
  ]));
  if(/데미지를 입을때마다 카운트.*기록/u.test(text)&&/카운트다운\s*\((\d+)\)/u.test(text)){
    const damage=Number(text.match(/(\d+)\s*데미지/u)?.[1]??0);
    if(damage>0)result.push(ability('COUNTDOWN',[fx('DAMAGE',board('ENEMY'),{amount:damage})]));
    const form=text.match(/액티브\s*:\s*['‘]([^'’]+)['’]/u)?.[1];
    if(form)result.push(ability('ACTIVE',[fx('TRANSFORM_SOURCE',undefined,{definitionRef:{name:form},attackReference:'SOURCE_DAMAGE_HIT_COUNT'})]));
  }
  if(/액티브.*이 카드를 리타이어.*이 카드의 공격력만큼 모든 선수.*체력을 초과한 데미지/u.test(text)){
    result.push(ability('ACTIVE',[
      fx('RETIRE',self,{captureStats:true}),
      fx('DAMAGE',board('ALL'),{amountReference:'LAST_CAPTURED_ATTACK',spillExcessToEnemyChampion:true})
    ]));
  }
  if(card.effectConfig.awakeningStage){
    if(/직접 타격.*추가로\s*(\d+)\s*데미지/u.test(text)){
      const n=Number(text.match(/추가로\s*(\d+)\s*데미지/u)![1]);
      result.push(ability('FIRST_ATTACKED',[fx('DAMAGE',board('ENEMY','LAST_ATTACKER'),{amount:n})]));
    }
    if(/턴 종료.*모든 아군 선수.*체력을\s*(\d+)\s*회복/u.test(text)){
      const n=Number(text.match(/체력을\s*(\d+)\s*회복/u)![1]);
      result.push(ability('TURN_END',[fx('HEAL',{zone:'CHARACTER',owner:'SELF',selection:'ALL',count:20},{amount:n})]));
    }
    if(/소환되면.*리타이어하거나 파괴.*수만큼 공격력/u.test(text))result.push(ability('SELF_ENTERED',[fx('BUFF',self,{attackReference:'ALLIED_REMOVED_WRESTLER_COUNT'})]));
    const next=text.match(/퇴장\s*:\s*['‘]([^'’]+)['’].*소환/u);
    if(next)result.push({trigger:'LEAVE_FIELD',reasons:['RETIRE'],effects:[fx('SUMMON',undefined,{definitionRef:{name:next[1]},count:1,resolveByName:true})]});
  }
  return result.length?result:null;
}
