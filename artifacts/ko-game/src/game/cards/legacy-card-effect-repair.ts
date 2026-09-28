import type { CardAbility } from '../effects/types';
import type { PublishedCardRecord } from './published-cards';
import { isEffectScript, type EffectScript } from '@workspace/effect-registry';

const self = { zone: 'BOARD' as const, owner: 'SELF' as const, selection: 'SELF' as const, count: 1 };
const enemyChoice = { zone: 'BOARD' as const, owner: 'ENEMY' as const, cardType: 'WRESTLER' as const, selection: 'PLAYER_CHOICE' as const, count: 1 };
const enemyResult = { zone: 'BOARD' as const, owner: 'ENEMY' as const, cardType: 'WRESTLER' as const, resultId: 'target' };

/** Repair published legacy configurations by the full meaning of their stored card text. */
export function repairedLegacyCardAbilities(card: PublishedCardRecord): CardAbility[] | null {
  const text = card.text.replace(/\s+/gu, ' ').trim();
  if (card.name === '도금구슬 마스터' && /덱과 손.*6\s*비용\s*이상.*비용.*1\s*감소/u.test(text)) {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'REDUCE_COST',
      target: { zones: ['HAND', 'DECK'], owner: 'SELF', filter: { minCost: 6 }, selection: 'ALL', count: 100 }, values: { amount: 1 } }] }];
  }
  if (card.name === '오젠' && /상대.*비용이?\s*1\s*이하.*무작위.*리타이어/u.test(text)) {
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
  if (card.name === '작은 하마' && /상대.*필드.*선수.*선택.*상대방.*덱\s*맨\s*위/u.test(text)) {
    return [{ trigger: 'ENTER_FIELD', effects: [{ type: 'STRUCTURED', action: 'MOVE_TO_DECK',
      target: enemyChoice, values: { deckPosition: 'TOP' } }] }];
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
