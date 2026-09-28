import type { CardAbility } from '../effects/types';
import type { PublishedCardRecord } from './published-cards';
import { isEffectScript, type EffectScript } from '@workspace/effect-registry';

const self = { zone: 'BOARD' as const, owner: 'SELF' as const, selection: 'SELF' as const, count: 1 };
const enemyChoice = { zone: 'BOARD' as const, owner: 'ENEMY' as const, cardType: 'WRESTLER' as const, selection: 'PLAYER_CHOICE' as const, count: 1 };
const enemyResult = { zone: 'BOARD' as const, owner: 'ENEMY' as const, cardType: 'WRESTLER' as const, resultId: 'target' };

/** Repair published legacy configurations by the full meaning of their stored card text. */
export function repairedLegacyCardAbilities(card: PublishedCardRecord): CardAbility[] | null {
  const text = card.text.replace(/\s+/gu, ' ').trim();
  if (card.name.replace(/\s+/gu, '') === '도금구슬마스터' || card.id === '99514068-68c8-46ca-b9f5-7f16b2ea4253') {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'REDUCE_COST',
      target: { zones: ['HAND', 'DECK'], owner: 'SELF', filter: { minCost: 6 }, selection: 'ALL', count: 100 }, values: { amount: 1 } }] }];
  }
  // The old Ozen record may carry an empty or stale effect config. Identify
  // this published card by its stable definition ID as well as its name.
  if (card.name.trim() === '오젠' || card.id === 'dc43dc88-38d7-499b-ad89-6b83f773fe62') {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'RETIRE',
      target: { zone: 'BOARD', owner: 'ENEMY', cardType: 'WRESTLER', filter: { maxCost: 1, isChampionToken: false }, selection: 'RANDOM', count: 1 } }] }];
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
