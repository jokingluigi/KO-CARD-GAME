import type { CardAbility, CardEffect, StructuredTarget } from '../effects/types';
import type { CardDefinition } from './types';
import type { PublishedCardRecord } from './published-cards';
const self: StructuredTarget = {zone:'BOARD',owner:'SELF',selection:'SELF',count:1};
const field = (owner: StructuredTarget['owner'], selection: StructuredTarget['selection']='ALL'): StructuredTarget => ({zone:'BOARD',owner,cardType:'WRESTLER',selection,count:selection==='ALL'?8:1});
const fx=(action: Extract<CardEffect,{type:'STRUCTURED'}>['action'], target?:StructuredTarget, values?:Extract<CardEffect,{type:'STRUCTURED'}>['values']):CardEffect=>({type:'STRUCTURED',action,target,values});
const ab=(trigger:CardAbility['trigger'],effects:CardEffect[],extra:Record<string,unknown>={}):CardAbility=>({trigger,effects,...extra} as CardAbility);
const script=(steps: import('@workspace/effect-registry').ScriptStep[]):CardAbility[]=>[ab('ENTER_FIELD',[{type:'SCRIPT',script:{version:'SCRIPT_V1',trigger:'ENTER_FIELD',steps}}])];
/** Reviewed content bindings, never an AI or arbitrary natural-language interpreter.
 * Explicit administrator DSL always wins. Engine behavior is data-driven. */
export function reviewedContentAbilities(card:PublishedCardRecord):CardAbility[]|null {
 if(card.effectId || !card.text.trim())return null;
 const text=card.text.replace(/\s+/gu,'');
 if(text.includes('어둠의전령')&&text.includes('절반')) {
  const grant:CardDefinition={id:'effect-dark-messenger-v1',name:'어둠의 전령',cost:0,attack:0,health:1,isToken:true,isChampionToken:false,keywords:[],rulesText:'상대 선수를 공격할 때 상대 공격력을 절반으로 내리고 내린 만큼 얻습니다.',abilities:[ab('BEFORE_ATTACK',[fx('MODIFY_STAT',field('ENEMY','SAME_TARGET'),{stat:'ATTACK',drainAttackFraction:0.5})])]};
  return [ab('ENTER_FIELD',[fx('GRANT_RANDOM_CARD_TEXT',field('SELF','PLAYER_CHOICE'),{definition:grant})])];
 }
 if(text.includes('다음턴에1골드')&&text.includes('직접타격'))return [ab('TURN_END',[fx('ADD_NEXT_TURN_GOLD',undefined,{amount:1})],{condition:{type:'SOURCE_ATTACKED_CHAMPION_THIS_TURN'}})];
 if(text.includes('수배키워드')&&text.includes('추가골드'))return [ab('TURN_END',[fx('ADD_NEXT_TURN_GOLD',undefined,{amountReference:'BOARD_WANTED_COUNT'})]),ab('TURN_START',[fx('BUFF',self,{attackReference:'TURN_GOLD_BONUS',healthReference:'TURN_GOLD_BONUS'})])];
 if(text.includes('리타이어시키면공격력이+1'))return [ab('SOURCE_RETIRED_TARGET',[fx('BUFF',self,{attack:1,health:0})]),ab('TURN_END',[fx('BUFF',{zone:'DECK',owner:'SELF',cardType:'WRESTLER',selection:'TOP',count:1},{reference:'SOURCE',referenceStat:'CURRENT_ATTACK'})])];
 if(text.includes('리타이어시키지않고파괴'))return [ab('ANY_BEFORE_RETIRE',[fx('DESTROY',field('ALL','SAME_TARGET'),{resolvedAutomaticTarget:true})]),ab('CARD_DESTROYED',[fx('DAMAGE',{zone:'PLAYER',owner:'ENEMY',selection:'SELF',count:1},{amount:2})])];
 if(text.includes('파괴되면')&&text.includes('+2/+2'))return [ab('ENTER_FIELD',[fx('DESTROY',field('ALL','PLAYER_CHOICE'))]),ab('CARD_DESTROYED',[fx('BUFF',self,{attack:2,health:2})])];
 if(text.includes('파괴되면')&&text.includes('무덤')&&text.includes('손'))return [ab('CARD_DESTROYED',[fx('MOVE_TO_HAND',{zone:'GRAVEYARD',owner:'SELF',cardType:'WRESTLER',selection:'RANDOM',randomScope:'FULL',count:1})],{...(text.includes('턴당1회')?{oncePerTurn:true}:{})})];
 if(text.includes('이번턴에파괴된선수')&&text.includes('골드'))return [ab('TURN_END',[fx('ADD_NEXT_TURN_GOLD',undefined,{amount:1})],{condition:{type:'WRESTLER_DESTROYED_THIS_TURN'}})];
 if(text.includes('등장:')&&text.includes('공격력이1이하')&&text.includes('파괴'))return [ab('ENTER_FIELD',[fx('DESTROY',{...field('ALL','PLAYER_CHOICE'),filter:{attack:{compare:'LTE',value:1}}})])];
 const form=card.text.match(/카운트다운\s*\((\d+)\)\s*:\s*(.+?)(?:으로|로)\s*변신/u);
 if(form)return [ab('COUNTDOWN',[fx('TRANSFORM_SOURCE',undefined,{definitionRef:{name:form[2].trim()}})])];
 if(text.includes('모든선수카드들에게')&&text.includes("'수배'"))return [ab('ENTER_FIELD',[fx('BUFF',field('SELF'),{attack:1,health:0}),fx('ADD_KEYWORD',field('SELF'),{keyword:'WANTED'})])];
 if(text.includes('코스트/체력/공격력을1로')&&text.includes('덱으로'))return script([
  {type:'SELECT',id:'sealed',target:field('ENEMY','PLAYER_CHOICE')},
  ...(['COST','ATTACK','HEALTH'] as const).map(stat=>({type:'EFFECT' as const,effect:{action:'SET_STAT' as const,target:{resultId:'sealed',zone:'BOARD' as const,owner:'ENEMY' as const},values:{stat,amount:1}}})),
  {type:'EFFECT',effect:{action:'MOVE_TO_DECK',target:{resultId:'sealed',zone:'BOARD',owner:'ENEMY'},values:{preserveStats:true,destinationOwner:'SELF'}}}
 ]);
 if(text.includes('선택한카드의공격력을')&&text.includes('덱맨위'))return script([
  {type:'SELECT',id:'hero',target:field('SELF','PLAYER_CHOICE')},
  {type:'AGGREGATE',id:'power',selectionId:'hero',operation:'SUM',stat:'ATTACK'},
  {type:'EFFECT',effect:{action:'BUFF',target:{zone:'DECK',owner:'SELF',cardType:'WRESTLER',selection:'TOP',count:1},values:{attackExpression:{kind:'RESULT_VALUE',resultId:'power'},health:0}}}
 ]);
 if(text.includes('파괴하고')&&text.includes('무작위로나눠'))return script([
  {type:'SELECT',id:'sacrifice',target:field('SELF','PLAYER_CHOICE')},
  {type:'AGGREGATE',id:'power',selectionId:'sacrifice',operation:'SUM',stat:'ATTACK'},
  {type:'EFFECT',effect:{action:'DESTROY',target:{resultId:'sacrifice',zone:'BOARD',owner:'SELF'}}},
  {type:'REPEAT',count:{kind:'RESULT_VALUE',resultId:'power'},steps:[{type:'EFFECT',effect:{action:'DAMAGE',target:{zone:'CHARACTER',owner:'ENEMY',selection:'RANDOM',randomScope:'FULL',count:1},values:{amount:1}}}]}
 ]);
 return null;
}
