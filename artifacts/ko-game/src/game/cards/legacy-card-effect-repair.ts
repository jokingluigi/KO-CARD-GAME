import type { CardAbility } from '../effects/types';
import type { PublishedCardRecord } from './published-cards';
import { isEffectScript, type EffectScript } from '@workspace/effect-registry';

const self = { zone: 'BOARD' as const, owner: 'SELF' as const, selection: 'SELF' as const, count: 1 };
const enemyChoice = { zone: 'BOARD' as const, owner: 'ENEMY' as const, cardType: 'WRESTLER' as const, selection: 'PLAYER_CHOICE' as const, count: 1 };
const enemyResult = { zone: 'BOARD' as const, owner: 'ENEMY' as const, cardType: 'WRESTLER' as const, resultId: 'target' };

/** The current Yeager record prints Dodge but omitted it from its keyword array. */
export function repairedLegacyCardKeywords(card: Pick<PublishedCardRecord, 'id' | 'text' | 'keywords'>): PublishedCardRecord['keywords'] {
  return card.id === 'latest-wrestler-5' && /^회피(?:[.,，]|\s|$)/u.test(card.text.trim())
    ? [...new Set([...card.keywords, 'DODGE' as const])]
    : card.keywords;
}

/** Repair published legacy configurations by the full meaning of their stored card text. */
export function repairedLegacyCardAbilities(card: PublishedCardRecord): CardAbility[] | null {
  const text = card.text.replace(/\s+/gu, ' ').trim();
  if (!card.effectId && card.name === '휴먼쿠커' && /등장.*선택한\s*아군\s*대상.*체력을\s*3\s*회복/u.test(text)) {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'HEAL',
      target: { zone: 'CHARACTER', owner: 'SELF', selection: 'PLAYER_CHOICE', count: 1 }, values: { amount: 3 } }] }];
  }
  if (!card.effectId && card.name === '워썬더' && /등장.*손에\s*무작위\s*선수\s*카드\s*1장을\s*생성/u.test(text)) {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'GENERATE',
      target: { zone: 'HAND', owner: 'SELF', cardType: 'WRESTLER', selection: 'RANDOM', randomScope: 'STANDARD', count: 1 },
      values: { destination: 'HAND', count: 1,
        ...(/-1\s*\/\s*-1\s*\/\s*-1/u.test(text) ? { generatedModifiers: { cost: -1, attack: -1, health: -1 } } : {}) } }] }];
  }
  const calaveraLimit = text.match(/비용이\s*(\d+)\s*이하인\s*선수/u);
  if (!card.effectId && card.name === '라 칼라베라' && calaveraLimit && /등장.*묘지.*무작위.*부활/u.test(text)) {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'REVIVE',
      target: { zone: 'GRAVEYARD', owner: 'SELF', cardType: 'WRESTLER', selection: 'RANDOM', randomScope: 'STANDARD', count: 1,
        filter: { maxCost: Number(calaveraLimit[1]) } } },
      ...(/도발/u.test(text) ? [{ type: 'STRUCTURED' as const, action: 'ADD_KEYWORD' as const,
        target: { zone: 'BOARD' as const, owner: 'SELF' as const, selection: 'SAME_TARGET' as const, count: 1 }, values: { keyword: 'TAUNT' as const } }] : [])] }];
  }
  if (card.name === '디 오리진') {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'BUFF', target: self,
      values: { attackReference: 'GRAVEYARD_WRESTLER_COUNT', healthReference: 'GRAVEYARD_WRESTLER_COUNT', referenceDivisor: 2 } }] }];
  }
  if (card.name === '도쿵' && /공격력이?\s*증가하면.*같은\s*수치.*체력/u.test(text)) {
    return [{ trigger: 'STAT_CHANGED', condition: { type: 'ATTACK_GAIN' }, effects: [{ type: 'STRUCTURED', action: 'BUFF', target: self,
      values: { attack: 0, healthReference: 'LAST_ATTACK_DELTA' } }] }];
  }
  if (card.name === '데헌' && /공격력이?\s*처음\s*증가.*회피/u.test(text) && !/(?:손패|손)에/u.test(text)) {
    return [{ trigger: 'STAT_CHANGED', condition: { type: 'FIRST_ATTACK_GAIN' }, effects: [{ type: 'STRUCTURED', action: 'ADD_KEYWORD', target: self,
      values: { keyword: 'DODGE' } }] }];
  }
  if (card.name === '만드릴쿤' && /공격력이?\s*증가.*공격력.*추가로\s*1/u.test(text)) {
    return [{ trigger: 'STAT_CHANGED', condition: { type: 'ATTACK_GAIN' }, effects: [{ type: 'STRUCTURED', action: 'BUFF', target: self,
      values: { attack: 1, health: 0 } }] }];
  }
  if (card.name === '프랑켄슈타인 만드릴쿤' && /체력이?\s*증가.*추가로\s*\+?1/u.test(text)) {
    return [{ trigger: 'STAT_CHANGED', condition: { type: 'HEALTH_GAIN' }, effects: [{ type: 'STRUCTURED', action: 'BUFF', target: self,
      values: { attack: 0, health: 1 } }] }];
  }
  if (card.name === '좀비 데헌' && /퇴장.*언데드.*어디에\s*있든.*최대\s*체력\s*\+2/u.test(text)) {
    return [{ trigger: 'SELF_RETIRE', effects: [{ type: 'STRUCTURED', action: 'MODIFY_MAX_HEALTH',
      target: { zones: ['HAND', 'DECK', 'BOARD'], owner: 'ALL', selection: 'ALL', count: 100,
        filter: { tagsAny: ['언데드'] } }, values: { amount: 2 } }] }];
  }
  if (card.name === '좀비 벨로나' && /데미지를?\s*입으면.*1\s*\/\s*1.*좀비.*소환/u.test(text)) {
    return [{ trigger: 'SELF_DAMAGED', effects: [{ type: 'STRUCTURED', action: 'SUMMON',
      values: { definitionRef: { name: '좀비' }, count: 1, generatedModifiers: { attack: 0, health: 0 } } }] }];
  }
  if ((card.name.replace(/\s+/gu, '') === '챔피언판도라(폭주)' || card.id === 'eaefcf6c-575d-4482-aaad-98b54561b49a') &&
      /등장.*선택한\s*선수.*파괴/u.test(text) && /리타이어.*파괴.*선수.*공격력.*흡수|리타이어.*파괴.*선수.*공격력.*(?:더|추가)/u.test(text)) {
    return [
      { trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'REGISTER_LISTENER', values: {
        listener: { trigger: 'SOURCE_CAUSED_TARGET_REMOVAL', cardType: 'WRESTLER', effect: {
          action: 'ADD_AGGREGATED_ATTACK', target: self,
          values: { aggregateStats: { source: 'LAST_CAUSED_TARGET_REMOVALS', attack: 'CURRENT_ATTACK_SUM' } },
        } },
      } }] },
      { trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'DESTROY',
        target: { zone: 'BOARD', owner: 'ALL', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1,
          filter: { excludeSource: true } } }] },
    ];
  }
  if (card.name.replace(/\s+/gu, '') === '도금구슬마스터' || card.id === '99514068-68c8-46ca-b9f5-7f16b2ea4253') {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'REDUCE_COST',
      target: { zones: !text || text.includes('덱') ? ['HAND', 'DECK'] : ['HAND'], owner: 'SELF', filter: { minCost: 6 }, selection: 'ALL', count: 1 }, values: { amount: 1 } }] }];
  }
  // The old Ozen record may carry an empty or stale effect config. Identify
  // this published card by its stable definition ID as well as its name.
  if (card.name.trim() === '오젠' || card.id === 'dc43dc88-38d7-499b-ad89-6b83f773fe62') {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: /파괴/u.test(text) ? 'DESTROY' : 'RETIRE',
        target: { zone: 'BOARD', owner: 'ENEMY', cardType: 'WRESTLER', filter: { maxCost: 1, isChampionToken: false, excludeChampionRarity: true }, selection: 'RANDOM', randomScope: 'FULL', count: 1 } }] }];
  }
  if (card.name.trim() === '발단' && /묘지.*카드\s*한\s*장.*파괴.*좀비.*소환/u.test(text)) {
    return [{ trigger: 'ENTER_FIELD', effects: [
      { type: 'STRUCTURED', action: 'DESTROY', target: { zone: 'GRAVEYARD', owner: 'SELF', selection: 'RANDOM', count: 1 } },
      { type: 'STRUCTURED', action: 'SUMMON', values: { definitionRef: { name: '좀비' }, count: 1 } },
    ] }];
  }
  if (card.name === '불록스' && (!text || /턴\s*종료.*손.*빈\s*공간.*소환/u.test(text))) {
    return [{ trigger: 'TURN_END', condition: { type: 'SOURCE_IN_HAND' },
      effects: [{ type: 'STRUCTURED', action: 'SUMMON_FROM_HAND' }] }];
  }
  if (card.name === '퀘스쳔' && /비용이?\s*2\s*이하.*\+1\s*\/\s*\+1/u.test(text)) {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'BUFF',
      target: { zones: ['HAND', 'DECK', 'BOARD'], owner: 'SELF', filter: { maxCost: 2 }, selection: 'ALL', count: 100 },
      values: { attack: 1, health: 1 } }] }];
  }
  if (card.name.replace(/\s+/gu, '') === '작은하마' && /상대.*필드.*선수.*선택.*상대(?:방)?(?:의)?\s*덱\s*맨\s*위/u.test(text)) {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'MOVE_TO_DECK',
      target: enemyChoice, values: { deckPosition: 'TOP' } }] }];
  }
  if (card.name.trim() === '만당' && /등장.*['‘’"]?만당['‘’"]?을?\s*소환/u.test(text)) {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'SUMMON',
      values: { definitionRef: { id: card.id }, count: 1 } }] }];
  }
  if (card.name.trim() === '마로쓰 2세' && /퇴장.*상대.*필드.*선수.*무작위.*1\s*장.*침묵/u.test(text)) {
    return [{ trigger: 'SELF_RETIRE', effects: [{ type: 'STRUCTURED', action: 'SILENCE',
      target: { zone: 'BOARD', owner: 'ENEMY', cardType: 'WRESTLER', selection: 'RANDOM', count: 1 } }] }];
  }
  if (card.name.trim() === '마로쓰 2세' && /필드.*아군.*턴\s*종료.*(?:한\s*번|한번)\s*더/u.test(text)) {
    return [{ trigger: 'TURN_END', effects: [{ type: 'STRUCTURED', action: 'REPEAT_TURN_END' }] }];
  }
  if (card.name.trim() === '마로쓰 2세' && /퇴장.*손패.*가장\s*비용이\s*높은\s*카드.*비용.*1\s*감소/u.test(text)) {
    const script: EffectScript = { version: 'SCRIPT_V1', trigger: 'SELF_RETIRE', steps: [
      { type: 'SELECT', id: 'mostExpensive', target: { zone: 'HAND', owner: 'SELF', selection: 'ALL', count: 1,
        sort: { stat: 'COST', direction: 'DESC' }, take: 1 } },
      { type: 'EFFECT', effect: { action: 'REDUCE_COST', target: { zone: 'HAND', owner: 'SELF', resultId: 'mostExpensive' },
        values: { amount: 1, minimum: 0 } } },
    ] };
    return isEffectScript(script) ? [{ trigger: 'SELF_RETIRE', effects: [{ type: 'SCRIPT', script }] }] : null;
  }
  if (card.name === '떼껄룩' && /상대.*선수.*선택.*공격력.*1로\s*줄이고.*기절.*줄인\s*만큼.*체력/u.test(text)) {
    const script: EffectScript = { version: 'SCRIPT_V1', trigger: 'ENTER_FIELD', steps: [
      { type: 'SELECT', id: 'target', target: enemyChoice },
      { type: 'AGGREGATE', id: 'attackBefore', selectionId: 'target', operation: 'MAX', stat: 'ATTACK' },
      { type: 'IF', condition: { left: { kind: 'RESULT_VALUE', resultId: 'attackBefore' }, compare: 'GT', right: { kind: 'CONSTANT', value: 1 } }, then: [
        { type: 'EFFECT', effect: { action: 'SET_STAT', target: enemyResult, values: { stat: 'ATTACK', amount: 1 } } },
        { type: 'EFFECT', effect: { action: 'BUFF', target: self, values: { healthExpression: { kind: 'RESULT_VALUE', resultId: 'attackBefore', offset: -1 } } } },
      ] },
      { type: 'EFFECT', effect: { action: 'STUN', target: enemyResult } },
    ] };
    return isEffectScript(script) ? [{ trigger: 'ENTER_FIELD', effects: [{ type: 'SCRIPT', script }] }] : null;
  }
  return null;
}
