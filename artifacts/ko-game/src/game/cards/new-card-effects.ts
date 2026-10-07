import type { CardAbility, CardEffect, StructuredTarget } from '../effects/types';
import type { PublishedCardRecord } from './published-cards';

export const NEW_CARD_NAMES = ['DEATH','MPG','금구슬 마스터','냥냥 펀치','루나 MK.사일런스','루브','루이나','마도카와','반으로 갈라져 죽어!','뱀파이어 왕자 MPG','블랙 아웃','사일런스','어셈블!!!','좀비 감염','지뢰닷!!!','카산드라','카스토','헬뻑','헬퍼','힐빌','마개조','태그 체인지'] as const;
export type NewCardRule = typeof NEW_CARD_NAMES[number];
// Stable production IDs keep effect bindings when an administrator renames a card.
const RULE_BY_ID: Readonly<Record<string, NewCardRule>> = {
  '40cbf9ea-d2e1-4929-b6cc-2d366a72016f': 'DEATH',
  '079e04c3-faa7-43c9-b15e-f60b71d87620': '마개조',
  'db6c775a-0933-4e55-9fdc-a94861c6e10a': '태그 체인지',
  '5d568663-55e8-4ad9-88b3-3afadae538d0': 'MPG',
  '4dba4dcd-d07f-41b0-b546-ac011a73d927': '금구슬 마스터',
  'e584c34e-d640-4c41-a148-cfb70389f08a': '냥냥 펀치',
  '94a8dc96-6856-4460-9128-c487c0189dd9': '루나 MK.사일런스',
  '62a10600-5a0e-4aec-b959-f0f15cd8c012': '루브',
  '4e28e957-1148-44c3-8f8b-b6fe8f40e3a9': '루이나',
  '0ee31b68-9c4a-434f-a17b-01294e9cdf71': '마도카와',
  'd31b5465-ac88-4647-ac56-aed191a1672f': '반으로 갈라져 죽어!',
  'f6061f3c-531a-4000-bc8e-a7d2e23e45bc': '뱀파이어 왕자 MPG',
  '3ea8c9fa-f0a1-4d3e-8769-6a5d366f938b': '블랙 아웃',
  '55e36a1b-9b1d-4ab1-ba42-f097ba4449b5': '사일런스',
  '0785ff4f-ce7c-4ab0-83e7-197249767543': '어셈블!!!',
  '792082db-3844-48f1-97d2-50c03c70c9db': '좀비 감염',
  '64478cf0-d8be-4990-a4fc-c5732d41a7d0': '지뢰닷!!!',
  '9716aeaa-cbc4-4374-bedc-2f40054b72de': '카산드라',
  '2e2d2c9d-1586-49cc-9b06-b3d8174c961f': '카스토',
  '0710e9b3-a8ef-4f09-9e63-c0b872c18068': '헬뻑',
  '5f1fd584-7129-4f39-91a4-22f02ba677e5': '헬퍼',
  'a6b7689a-0468-48cd-a216-7e9fe22dec47': '힐빌',
};
const self: StructuredTarget = {zone:'BOARD',owner:'SELF',selection:'SELF',count:1};
const board = (owner: StructuredTarget['owner'], selection: StructuredTarget['selection']='ALL'): StructuredTarget => ({zone:'BOARD',owner,cardType:'WRESTLER',selection,count:selection==='ALL'?4:1});
const fx = (action: Extract<CardEffect,{type:'STRUCTURED'}>['action'], target?: StructuredTarget, values?: Extract<CardEffect,{type:'STRUCTURED'}>['values']): CardEffect => ({type:'STRUCTURED',action,target,values});
const enter = (...effects: CardEffect[]): CardAbility[] => [{trigger:'ENTER_FIELD',effects}];
const end = (...effects: CardEffect[]): CardAbility[] => [{trigger:'TURN_END',effects}];
const authority = {...board('ALL'),filter:{tagsAny:['디 어쏘리티']}};

/** Only the explicitly requested, effect-less new records. Existing authored DSL wins. */
export function newCardImplementation(card: PublishedCardRecord): {rule:NewCardRule; abilities:CardAbility[]} | null {
  if (card.effectId || !card.text.trim()) return null;
  const rule = RULE_BY_ID[card.id] ?? (NEW_CARD_NAMES.includes(card.name as NewCardRule) ? card.name as NewCardRule : undefined);
  if (!rule) return null;
  switch(rule) {
    case '태그 체인지': return {rule,abilities:enter({type:'SCRIPT',script:{version:'SCRIPT_V1',trigger:'ENTER_FIELD',steps:[
      {type:'SELECT',id:'swapField',target:board('SELF','PLAYER_CHOICE')},
      {type:'SELECT',id:'swapHand',target:{zone:'HAND',owner:'SELF',cardType:'WRESTLER',selection:'PLAYER_CHOICE',count:1}},
      {type:'EFFECT',effect:{action:'SUMMON_FROM_HAND',target:{zone:'HAND',owner:'SELF',cardType:'WRESTLER',resultId:'swapHand'}}},
    ]}})};
    case '마개조': return {rule,abilities:enter(fx('BUFF',board('SELF','PLAYER_CHOICE'),{attack:1,health:1}))};
    case 'MPG': return {rule,abilities:enter(fx('MODIFY_STAT',board('ENEMY','PLAYER_CHOICE'),{stat:'ATTACK',amount:-1}),fx('BUFF',self,{attack:1,health:0}))};
    case '금구슬 마스터': return {rule,abilities:enter(fx('DESTROY',board('ENEMY','PLAYER_CHOICE')))};
    case '루나 MK.사일런스': return {rule,abilities:[
      ...(/등장\s*:[^\n]*상대[^\n]*침묵/u.test(card.text)
        ? enter(fx('SILENCE',board('ENEMY','PLAYER_CHOICE'))) : []),
      {trigger:/턴\s*종료/u.test(card.text)?'TURN_END':'TURN_START',effects:[fx('DESTROY',board('ENEMY'))]},
    ]};
    case '루브': return {rule,abilities:[{trigger:'TURN_END',condition:{type:'BOARD_COUNT',compare:'EQ',amount:1},effects:[fx('BUFF',self,{attack:1,health:1}),fx('ADD_KEYWORD',self,{keyword:'TAUNT'})]}]};
    case '루이나': return {rule,abilities:enter(fx('GENERATE',{zone:'HAND',owner:'SELF',selection:'RANDOM',count:1,filter:{tagsAny:['디 어쏘리티']}},{count:1,destination:'HAND'}),fx('ADD_KEYWORD',{...authority,owner:'SELF'},{keyword:'LIFESTEAL'}))};
    case '반으로 갈라져 죽어!': return {rule,abilities:enter(fx('DAMAGE',{zone:'PLAYER',owner:'ENEMY',selection:'SELF',count:1},{amount:99}))};
    case '블랙 아웃': return {rule,abilities:[{trigger:'SELF_DAMAGED',effects:[fx('BUFF',self,{attack:1,health:0})]}]};
    case '어셈블!!!': return {rule,abilities:enter(...Array.from({length:4},()=>fx('SUMMON',{zone:'BOARD',owner:'SELF',cardType:'WRESTLER',selection:'RANDOM',count:1},{count:1})))};
    case '좀비 감염': return {rule,abilities:enter(fx('TRANSFORM_TARGET',board('ALL','PLAYER_CHOICE'),{definitionRef:{name:'좀비'}}))};
    case '카산드라': { const scope: StructuredTarget = /내\s*손과\s*필드/u.test(card.text) ? {...authority,zones:['HAND','BOARD'],zone:undefined,owner:'SELF',count:100} : authority; return {rule,abilities:[...enter(fx('BUFF',scope,{attack:0,health:1}),fx('ADD_KEYWORD',scope,{keyword:'REGEN'})),...end(fx('HEAL',{zone:'CHARACTER',owner:'SELF',selection:'ALL',count:5},{amount:1}))]}; }
    case '헬뻑': return {rule,abilities:end(fx('DAMAGE',board('ALL'),{amount:1}))};
    case '마도카와': return {rule,abilities:[{trigger:'ENTER_FIELD',effects:[fx('ADD_DAMAGE_MODIFIER',undefined,{amount:Number(card.text.match(/데미지가\s*(\d+)\s*증가/u)?.[1] ?? 3),damageSource:'ALL'})]}]};
    // These use small runtime hooks around the existing damage/retire/generation executors.
    case 'DEATH': case '지뢰닷!!!': return {rule,abilities:[{trigger:'TURN_END',condition:{type:'SOURCE_IN_HAND'},effects:[]}]};
    case '냥냥 펀치': return {rule,abilities:enter({type:'SCRIPT',script:{version:'SCRIPT_V1',trigger:'ENTER_FIELD',steps:[{type:'REPEAT',count:{kind:'CONSTANT',value:5},steps:[{type:'EFFECT',effect:{action:'DAMAGE',target:{zone:'CHARACTER',owner:'ENEMY',selection:'RANDOM',randomScope:'FULL',count:1},values:{amount:1}}}]}]}})};
    case '뱀파이어 왕자 MPG': return {rule,abilities:enter()};
    case '헬퍼': return {rule,abilities:[...(/등장/u.test(card.text)?enter(fx('GENERATE',undefined,{definitionRef:{id:'e584c34e-d640-4c41-a148-cfb70389f08a'},destination:'HAND',count:1})):[]),{trigger:'TURN_START',effects:[]}]};
    case '힐빌': case '사일런스': case '카스토': return {rule,abilities:[]};
  }
}

export function newCardTargetAllowed(source: {contentRule?:NewCardRule;currentAttack:number;isSilenced?:boolean;grantedText?:{contentRule?:NewCardRule}}, target: {currentAttack:number;isSilenced:boolean}, action:string):boolean {
  if(action!=='DESTROY')return true;
  const rule=source.grantedText?.contentRule ?? (!source.isSilenced?source.contentRule:undefined);
  if(rule==='금구슬 마스터')return target.currentAttack<source.currentAttack;
  if(rule==='루나 MK.사일런스')return target.isSilenced;
  return true;
}
