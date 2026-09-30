import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardDefinition, CardInstance } from '../cards/types';
import { generateCardInstance } from '../cards/generation';
import { cardRecordToDefinition } from '../cards/published-cards';
import { championRecordToDefinition } from '../champions/published-champions';
import { TEST_CHAMPIONS } from '../champions/test-champions';
import { processChampionQuestEvents } from '../champions/quests';
import type { PublishedCardRecord } from '../cards/published-cards';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { destroyCard } from '../engine/destroy-card';
import { enterField } from '../engine/enter-field';
import { attack } from '../engine/combat';
import { endTurn } from '../engine/turn-system';
import { directDeployChampionToken } from '../engine/champion-token';
import { playTechniqueFromHand } from '../engine/play-technique';
import { playWrestlerFromHand } from '../engine/play-wrestler';
import { applyEffect, selectEffectTarget } from './effect-engine';

type SavedConfig = { effects: Array<Record<string, unknown>> };

const effect = (
  trigger: string,
  action: string,
  target?: Record<string, unknown>,
  values?: Record<string, unknown>,
  conditions?: Array<Record<string, unknown>>,
): Record<string, unknown> => ({
  trigger,
  action,
  ...(target ? { target } : {}),
  ...(values ? { values } : {}),
  ...(conditions ? { conditions } : {}),
});

const boardSelf = { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 };
const savedConfigs: Record<string, SavedConfig> = {
  '독세아': { effects: [effect('ENTER_FIELD', 'BUFF', { zones: ['HAND', 'DECK', 'BOARD'], owner: 'SELF', cardType: 'WRESTLER', filter: { isGenerated: true }, selection: 'ALL', count: 20 }, { attack: 1, health: 1 })] },
  '뒷정리맨': { effects: [effect('ENTER_FIELD', 'QUEUE_EFFECT', undefined, { queuedTrigger: 'NEXT_ALLY_WRESTLER_PLAYED', queuedEffect: { action: 'BUFF', target: boardSelf, values: { attack: 0, health: 2 } } })] },
  '디 오리진': { effects: [effect('ENTER_FIELD', 'BUFF', boardSelf, { attackReference: 'GRAVEYARD_WRESTLER_COUNT', healthReference: 'GRAVEYARD_WRESTLER_COUNT', referenceDivisor: 3 })] },
  '루나': { effects: [effect('FIRST_ATTACKED', 'SILENCE', { zone: 'BOARD', owner: 'ENEMY', cardType: 'WRESTLER', selection: 'SAME_TARGET', count: 1 }), effect('FIRST_ATTACKED', 'DISABLE_ABILITY', boardSelf)] },
  '블랙 마카롱': { effects: [effect('ENTER_FIELD', 'BUFF', boardSelf, { attackReference: 'HAND_COUNT' })] },
  '씨 몬스터': { effects: [effect('CARD_RETIRED', 'REDUCE_COST', { zone: 'HAND', owner: 'SELF', selection: 'SELF', count: 1 }, { amount: 1, minimum: 1 })] },
  '아르카나 조커': { effects: [effect('ENTER_FIELD', 'MILL', { zone: 'DECK', owner: 'SELF', selection: 'TOP', count: 1 }), effect('ENTER_FIELD', 'GENERATE', { zones: ['DECK'], owner: 'SELF', cardType: 'WRESTLER', selection: 'RANDOM', count: 1, randomScope: 'FULL', filter: { isChampionToken: false } }, { destination: 'DECK', deckPosition: 'TOP', generatedModifiers: { cost: -1, attack: -1, health: -1 } })] },
  '아비터': { effects: [effect('TURN_START', 'ADD_GOLD', undefined, { amount: 1 }, [{ type: 'SOURCE_IS_ONLY_WRESTLER' }])] },
  '여울': { effects: [effect('ENTER_FIELD', 'BUFF', { zone: 'HAND', owner: 'SELF', cardType: 'WRESTLER', selection: 'RANDOM', count: 3, randomScope: 'STANDARD' }, { attack: 1, health: 1 })] },
  '오심정정': { effects: [effect('ENTER_FIELD', 'MOVE_TO_HAND', { zone: 'GRAVEYARD', owner: 'SELF', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1 })] },
  '워썬더': { effects: [effect('ENTER_FIELD', 'MILL', { zone: 'DECK', owner: 'SELF', selection: 'TOP', count: 3 }), effect('ENTER_FIELD', 'ADD_NEXT_TURN_GOLD', undefined, { amount: 1 })] },
  '위리놈': { effects: [effect('ENTER_FIELD', 'GENERATE', undefined, { definitionRef: { id: 'wiriyeo-id' }, destination: 'HAND', count: 1, generatedModifiers: { copySourceStats: true } }), effect('LEAVE_FIELD', 'SUMMON_FROM_HAND', undefined, { definitionRef: { id: 'wiriyeo-id' }, count: 1 })] },
  '저지먼트': { effects: [effect('ENTER_FIELD', 'RETIRE', { zone: 'BOARD', owner: 'ENEMY', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1 })] },
  '조킹루이지': {
    effects: [
      effect('ENTER_FIELD', 'SUMMON', { zone: 'BOARD', owner: 'SELF', cardType: 'WRESTLER', selection: 'ADJACENT_EMPTY_SLOTS', count: 2, randomScope: 'STANDARD' }),
      effect('ENTER_FIELD', 'ADD_KEYWORD', { zone: 'BOARD', owner: 'SELF', cardType: 'WRESTLER', selection: 'ADJACENT', count: 2 }, { keyword: 'TAUNT' }),
    ],
  },
  '퍼플레인': { effects: [effect('ENTER_FIELD', 'WEAKEN_TO_STUN_SILENCE', { zone: 'BOARD', owner: 'ENEMY', cardType: 'WRESTLER', selection: 'ALL', count: 20 }, { amount: 2 })] },
  '플래티넘 구슬 마스터': { effects: [effect('ENTER_FIELD', 'SPEND_GOLD_BUFF_SELF', boardSelf, { amountReference: 'REMAINING_GOLD' })] },
  '피 스타 세븐': { effects: [effect('ENTER_FIELD', 'BUFF', { zone: 'BOARD', owner: 'SELF', cardType: 'WRESTLER', filter: { excludeSource: true }, selection: 'ALL', count: 20 }, { attack: 2, health: 0 })] },
};

const definition = (name: string, config: SavedConfig, overrides: Partial<CardDefinition> = {}): CardDefinition =>
  cardRecordToDefinition({
    id: `saved-${name}`,
    name,
    cardType: 'WRESTLER',
    cost: overrides.cost ?? 1,
    attack: overrides.attack ?? 1,
    health: overrides.health ?? 1,
    text: overrides.rulesText ?? '',
    keywords: [],
    isToken: false,
    isChampionToken: false,
    effectId: 'STRUCTURED_EFFECTS_V1',
    effectConfig: config,
    status: 'PUBLISHED',
    version: 1,
    createdAt: '',
    updatedAt: '',
    imageAssetId: null,
    imageUrl: null,
    ...overrides,
  } as PublishedCardRecord);

const card = (cardDefinition: CardDefinition, id: string): CardInstance =>
  generateCardInstance(cardDefinition, { instanceId: id, isGenerated: false });

const stateWithPool = (pool: CardDefinition[] = []) => {
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.cardPool = pool;
  return state;
};

const saved = Object.fromEntries(
  Object.entries(savedConfigs).map(([name, config]) => [name, definition(name, config)]),
) as Record<string, CardDefinition>;

test('도금구슬 마스터는 손패와 덱의 비용 6 이상 카드만 1 할인한다', () => {
  const master = definition('도금구슬 마스터', { effects: [] }, { rulesText: '등장:내 덱과 손에 있는 6 비용 이상의 카드들의 비용을 전부 1 감소 시킵니다.' });
  const expensive = definition('고비용', { effects: [] }, { cost: 6 });
  const cheap = definition('저비용', { effects: [] }, { cost: 5 });
  const state = stateWithPool([master, expensive, cheap]);
  state.players[0].hand = [card(expensive, 'high-hand'), card(cheap, 'low-hand')];
  state.players[0].deck = [card(expensive, 'high-deck'), card(cheap, 'low-deck')];
  const result = enterField(state, 'player-1', card(master, 'gilded'), 0);
  assert.deepEqual(result.players[0].hand.map((item) => item.currentCost), [5, 5]);
  assert.deepEqual(result.players[0].deck.map((item) => item.currentCost), [5, 5]);
  const stale = definition('도금구슬 마스터', { effects: [] }, { rulesText: '' });
  const staleState = stateWithPool([stale, expensive]);
  staleState.players[0].deck = [card(expensive, 'stale-expensive')];
  assert.equal(enterField(staleState, 'player-1', card(stale, 'stale-gilded'), 0).players[0].deck[0]?.currentCost, 5);
});

test('오젠은 챔피언 토큰을 제외한 비용 1 이하의 적 선수 하나만 리타이어시킨다', () => {
  const ozen = definition('오젠', { effects: [] }, { rulesText: '등장:상대 필드에 비용이 1이하인 선수 카드가 있다면 그 카드들중 무작위 한장을 리타이어 시킵니다.(챔피언 토큰 제외)' });
  const cheap = definition('저비용 상대', { effects: [] }, { cost: 1 });
  const expensive = definition('고비용 상대', { effects: [] }, { cost: 2 });
  const token = definition('챔피언 토큰', { effects: [] }, { cost: 0, isChampionToken: true });
  const state = stateWithPool([ozen, cheap, expensive, token]);
  state.players[1].board[0] = { ...card(cheap, 'cheap-target'), boardSlot: 0 };
  state.players[1].board[1] = { ...card(expensive, 'expensive-target'), boardSlot: 1 };
  state.players[1].board[2] = { ...card(token, 'champion-target'), boardSlot: 2 };
  const result = enterField(state, 'player-1', card(ozen, 'ozen-source'), 0);
  assert.equal(result.players[1].board[0], null);
  assert.equal(result.players[1].board[1]?.instanceId, 'expensive-target');
  assert.equal(result.players[1].board[2]?.instanceId, 'champion-target');
  assert.equal(result.players[1].graveyard.some((item) => item.instanceId === 'cheap-target'), true);
  const staleOzen = definition('오젠', { effects: [] }, { rulesText: '' });
  const staleState = stateWithPool([staleOzen, cheap]);
  staleState.players[1].board[0] = { ...card(cheap, 'stale-ozen-target'), boardSlot: 0 };
  const repaired = enterField(staleState, 'player-1', card(staleOzen, 'stale-ozen-source'), 0);
  assert.equal(repaired.players[1].board[0], null);
  const currentText = definition('오젠', { effects: [] }, { rulesText: '등장:상대 필드에 비용이 1 이하인 선수 카드가 있다면 그 카드들 중 무작위 한장을 리타이어 시킵니다.(챔피언 등급 제외)' });
  const currentState = stateWithPool([currentText, cheap, token]);
  currentState.players[1].board[0] = { ...card(cheap, 'current-ozen-target'), boardSlot: 0 };
  currentState.players[1].board[1] = { ...card(token, 'current-champion-target'), boardSlot: 1 };
  const currentResult = enterField(currentState, 'player-1', card(currentText, 'current-ozen-source'), 0);
  assert.equal(currentResult.players[1].board[0], null);
  assert.equal(currentResult.players[1].board[1]?.instanceId, 'current-champion-target');
});

test('오젠과 도금구슬 마스터는 손패에서 비용을 내고 실제 플레이해도 적용된다', () => {
  const ozen = definition('오젠', { effects: [] }, { rulesText: '' });
  const master = definition('도금구슬 마스터', { effects: [] }, { rulesText: '' });
  const cheap = definition('적 선수', { effects: [] }, { cost: 1 });
  const expensive = definition('비싼 손패 선수', { effects: [] }, { cost: 6 });
  const state = stateWithPool([ozen, master, cheap, expensive]);
  state.players[0].currentGold = 10;
  state.players[0].hand = [card(ozen, 'played-ozen'), card(master, 'played-master'), card(expensive, 'expensive-hand')];
  state.players[1].board[0] = { ...card(cheap, 'opponent-cheap'), boardSlot: 0 };
  state.players[0].deck = [card(expensive, 'expensive-deck')];
  const first = playWrestlerFromHand(state, 'player-1', 'played-ozen', 0);
  assert.equal(first.success, true);
  assert.equal(first.state.players[1].board[0], null);
  const second = playWrestlerFromHand(first.state, 'player-1', 'played-master', 1);
  assert.equal(second.success, true);
  assert.equal(second.state.players[0].hand[0]?.currentCost, 5);
  assert.equal(second.state.players[0].deck[0]?.currentCost, 5);
});

test('불록스는 손패에 있을 때만 턴 종료에 빈 필드로 소환된다', () => {
  const blox = definition('불록스', { effects: [] });
  const state = stateWithPool([blox]);
  state.players[0].hand = [card(blox, 'blox-hand')];
  const result = endTurn(state, 'player-1');
  assert.equal(result.state.players[0].board[0]?.instanceId, 'blox-hand');
  assert.equal(result.state.players[0].hand.length, 0);
});

test('작은 하마는 선택한 상대 선수만 상대 덱 맨 위로 보낸다', () => {
  const hippo = definition('작은 하마', { effects: [] }, { rulesText: '등장:상대의 필드에 있는 선수 카드 한장을 선택해서 상대방의 덱 맨위로 보냅니다.' });
  const victim = definition('상대 선수', { effects: [] });
  const state = stateWithPool([hippo, victim]);
  state.players[1].board[0] = { ...card(victim, 'hippo-target'), boardSlot: 0 };
  state.players[1].deck = [card(victim, 'old-top')];
  const pending = enterField(state, 'player-1', card(hippo, 'hippo-source'), 0);
  assert.equal(pending.targetingState?.active, true);
  const result = selectEffectTarget(pending, 'hippo-target');
  assert.equal(result.players[1].board[0], null);
  assert.equal(result.players[1].deck[0]?.instanceId, 'hippo-target');
  const current = definition('작은하마', { effects: [] }, { rulesText: '등장:상대 필드에 있는 선수 카드 한장을 선택해서 상대의 덱 맨 위로 보냅니다.' });
  const currentState = stateWithPool([current, victim]);
  currentState.players[1].board[0] = { ...card(victim, 'current-hippo-target'), boardSlot: 0 };
  const pendingCurrent = enterField(currentState, 'player-1', card(current, 'current-hippo-source'), 0);
  assert.equal(pendingCurrent.targetingState?.active, true);
  const moved = selectEffectTarget(pendingCurrent, 'current-hippo-target');
  assert.equal(moved.players[1].deck[0]?.instanceId, 'current-hippo-target');
});

test('만당은 빈 아군 필드에 자신을 한 장 소환하고 소환된 카드가 재소환하지 않는다', () => {
  const mandang = definition('만당', { effects: [] }, { rulesText: "등장:'만당'을 소환합니다." });
  const state = stateWithPool([mandang]);
  const result = enterField(state, 'player-1', card(mandang, 'mandang-source'), 0);
  const summoned = result.players[0].board.filter((item) => item?.definitionId === mandang.id);
  assert.equal(summoned.length, 2);
  assert.equal(summoned[1]?.isGenerated, true);
  assert.equal(result.events.filter((event) => event.type === 'ENTER_FIELD').length, 2);
});

test('마로쓰 2세가 리타이어하면 무작위 적 선수 하나만 침묵시킨다', () => {
  const maros = definition('마로쓰 2세', { effects: [] }, { rulesText: '퇴장:상대 필드에 있는 선수 카드 중 무작위로 1장을 침묵시킨다.' });
  const victim = definition('상대 능력 선수', { effects: [effect('TURN_END', 'BUFF', boardSelf, { attack: 1 })] });
  const state = stateWithPool([maros, victim]);
  state.players[0].board[0] = { ...card(maros, 'maros-retiring-current'), boardSlot: 0 };
  state.players[1].board[0] = { ...card(victim, 'silence-target'), boardSlot: 0 };
  const retired = applyEffect(state, 'player-1', state.players[0].board[0]!, {
    type: 'STRUCTURED', action: 'RETIRE', target: boardSelf,
  });
  assert.equal(retired.players[1].board[0]?.isSilenced, true);
});

test('퀘스쳔은 어디에 있든 비용 2 이하인 아군 카드만 +1/+1 강화한다', () => {
  const question = definition('퀘스쳔', { effects: [] }, { cost: 3, rulesText: '등장:어디에 있든 비용이 2이하인 카드들에게 +1/+1을 부여합니다.' });
  const low = definition('비용 2', { effects: [] }, { cost: 2 });
  const high = definition('비용 3', { effects: [] }, { cost: 3 });
  const state = stateWithPool([question, low, high]);
  state.players[0].hand = [card(low, 'low-hand')];
  state.players[0].deck = [card(low, 'low-deck'), card(high, 'high-deck')];
  state.players[0].board[1] = { ...card(low, 'low-board'), boardSlot: 1 };
  const result = enterField(state, 'player-1', card(question, 'question-source'), 0);
  assert.equal(result.players[0].hand[0]?.currentAttack, 2);
  assert.equal(result.players[0].deck[0]?.currentHealth, 2);
  assert.equal(result.players[0].deck[1]?.currentAttack, 1);
  assert.equal(result.players[0].board[1]?.currentHealth, 2);
});

test('떼껄룩은 선택한 적의 줄어든 공격력만큼 자신 체력을 올리고 기절시킨다', () => {
  const cat = definition('떼껄룩', { effects: [] }, { rulesText: '등장:상대 선수 카드 1장을 선택해서 그 카드의 공격력을 1로 줄이고 기절을 걸고, 공격력을 줄인 만큼 자신의 체력을 증가시킵니다.' });
  const victim = definition('공격력 5 상대', { effects: [] }, { attack: 5 });
  const state = stateWithPool([cat, victim]);
  state.players[1].board[0] = { ...card(victim, 'cat-target'), boardSlot: 0 };
  const pending = enterField(state, 'player-1', card(cat, 'cat-source'), 0);
  assert.equal(pending.targetingState?.active, true);
  const result = selectEffectTarget(pending, 'cat-target');
  assert.equal(result.players[1].board[0]?.currentAttack, 1);
  assert.equal(result.players[1].board[0]?.isStunned, true);
  assert.equal(result.players[0].board[0]?.currentHealth, 5);
});

test('마로쓰 2세가 필드에 있으면 아군 턴 종료 효과가 정확히 한 번 더 발동한다', () => {
  const maros = definition('마로쓰 2세', { effects: [] }, { rulesText: '이 카드가 필드에 있을때 아군의 턴 종료 효과가 한번 더 발동합니다.' });
  const ally = definition('턴 종료 아군', { effects: [effect('TURN_END', 'BUFF', boardSelf, { attack: 1, health: 0 })] });
  const state = stateWithPool([maros, ally]);
  state.players[0].board[0] = { ...card(maros, 'maros-on-board'), boardSlot: 0 };
  state.players[0].board[1] = { ...card(ally, 'turn-end-ally'), boardSlot: 1 };
  const result = endTurn(state, 'player-1');
  assert.equal(result.state.players[0].board[1]?.currentAttack, 3);
  const noMaros = stateWithPool([maros, ally]);
  noMaros.players[0].board[1] = { ...card(ally, 'turn-end-alone'), boardSlot: 1 };
  assert.equal(endTurn(noMaros, 'player-1').state.players[0].board[1]?.currentAttack, 2);
});

test('마로쓰 2세의 퇴장형 문구는 손패에서 가장 비싼 카드 한 장만 할인한다', () => {
  const maros = definition('마로쓰 2세', { effects: [] }, { rulesText: '퇴장:자신의 손패에서 가장 비용이 높은 카드 한장의 비용을 1 감소시킨다.' });
  const expensive = definition('비싼 카드', { effects: [] }, { cost: 6 });
  const cheap = definition('싼 카드', { effects: [] }, { cost: 2 });
  const state = stateWithPool([maros, expensive, cheap]);
  state.players[0].board[0] = { ...card(maros, 'maros-retiring'), boardSlot: 0 };
  state.players[0].hand = [card(cheap, 'cheap-hand'), card(expensive, 'expensive-hand')];
  const retired = applyEffect(state, 'player-1', state.players[0].board[0]!, {
    type: 'STRUCTURED', action: 'RETIRE', target: boardSelf,
  });
  assert.equal(retired.players[0].hand[0]?.currentCost, 2);
  assert.equal(retired.players[0].hand[1]?.currentCost, 5);
});

test('저장된 17개 WRESTLER 정의가 runtime abilities로 모두 변환된다', () => {
  assert.equal(Object.keys(saved).length, 17);
  for (const [name, cardDefinition] of Object.entries(saved)) {
    assert.equal(cardDefinition.effectId, 'STRUCTURED_EFFECTS_V1', name);
    assert.ok(cardDefinition.abilities.length > 0, name);
    assert.ok(cardDefinition.abilities.flatMap((ability) => ability.effects).length > 0, name);
  }
});

test('authoritative 뒷정리맨 정의는 자신이 아닌 다음 아군 선수에게 체력 +2를 한 번 적용한다', () => {
  const cleanupDefinition = cardRecordToDefinition({
    id: '855e87f9-1769-4036-ad49-491ab4b2058a',
    name: '뒷정리맨',
    cardType: 'WRESTLER',
    cost: 2,
    attack: 1,
    health: 2,
    text: '출현:다음에 출현하는 카드에게 체력을 +2 부여합니다.',
    keywords: ['TAUNT'],
    isToken: false,
    isChampionToken: false,
    effectId: 'STRUCTURED_EFFECTS_V1',
    effectConfig: {
      effects: [{
        trigger: 'ENTER_FIELD',
        action: 'QUEUE_EFFECT',
        values: {
          queuedTrigger: 'NEXT_ALLY_WRESTLER_PLAYED',
          queuedEffect: {
            action: 'BUFF',
            target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
            values: { attack: 0, health: 2 },
          },
        },
      }],
    },
    status: 'PUBLISHED',
    version: 9,
    createdAt: '',
    updatedAt: '',
    imageAssetId: null,
    imageUrl: null,
  });
  const nextDefinition = definition('authoritative-next', { effects: [] }, { attack: 3, health: 1 });
  const state = stateWithPool([cleanupDefinition, nextDefinition]);
  const cleanup = card(cleanupDefinition, 'authoritative-cleanup');
  const next = card(nextDefinition, 'authoritative-next');
  state.players[0].hand = [cleanup];
  state.players[0].currentGold = 10;

  const afterCleanup = playWrestlerFromHand(state, 'player-1', cleanup.instanceId, 0);
  assert.equal(afterCleanup.success, true);
  if (!afterCleanup.success) return;
  assert.equal(afterCleanup.state.players[0].board[0]?.currentAttack, 1);
  assert.equal(afterCleanup.state.players[0].board[0]?.currentHealth, 2);
  assert.equal(afterCleanup.state.pendingCardEffects.length, 1);

  const withNext = {
    ...afterCleanup.state,
    players: afterCleanup.state.players.map((player) => player.id === 'player-1'
      ? { ...player, hand: [next], currentGold: 10 }
      : player),
  };
  const afterNext = playWrestlerFromHand(withNext, 'player-1', next.instanceId, 1);
  assert.equal(afterNext.success, true);
  if (!afterNext.success) return;
  assert.equal(afterNext.state.players[0].board[1]?.currentAttack, 3);
  assert.equal(afterNext.state.players[0].board[1]?.currentHealth, 3);
  assert.equal(afterNext.state.pendingCardEffects.length, 0);
});

test('authoritative 매드 펌킨은 같은 CardInstance를 손패로 되돌리고 이번 턴 비용을 1 줄인다', () => {
  const madPumpkinDefinition = cardRecordToDefinition({
    id: 'latest-wrestler-12',
    name: '매드 펌킨',
    cardType: 'WRESTLER',
    cost: 2,
    attack: 2,
    health: 2,
    text: '등장:필드에 있는 아군 선수 하나를 선택하여 손으로 되돌립니다. 그 카드의 비용은 이번 턴에 1 감소합니다. (최소 1)',
    keywords: [],
    isToken: false,
    isChampionToken: false,
    effectId: 'STRUCTURED_EFFECTS_V1',
    effectConfig: {
      effects: [{
        trigger: 'ENTER_FIELD',
        action: 'MOVE_TO_HAND',
        target: {
          zone: 'BOARD',
          owner: 'SELF',
          cardType: 'WRESTLER',
          selection: 'PLAYER_CHOICE',
          count: 1,
        },
        values: { amount: 1, minimum: 1, temporaryCost: true },
      }],
    },
    status: 'PUBLISHED',
    version: 7,
    createdAt: '',
    updatedAt: '',
    imageAssetId: null,
    imageUrl: null,
  });
  const allyDefinition = definition('매드 펌킨 대상', { effects: [] }, { cost: 5, attack: 4, health: 4 });
  const ally = { ...card(allyDefinition, 'mad-pumpkin-target'), boardSlot: 1 as const };
  const state = stateWithPool([madPumpkinDefinition, allyDefinition]);
  state.players[0].board = [null, ally, null, null];

  const pending = enterField(state, 'player-1', card(madPumpkinDefinition, 'mad-pumpkin'), 0);
  assert.ok(pending.targetingState?.validTargetIds.includes(ally.instanceId));

  const returned = selectEffectTarget(pending, ally.instanceId);
  const returnedCard = returned.players[0].hand.find((item) => item.instanceId === ally.instanceId);
  assert.equal(returned.players[0].board[1], null);
  assert.equal(returnedCard?.instanceId, ally.instanceId);
  assert.equal(returnedCard?.currentCost, 4);
  assert.equal(returnedCard?.temporaryCostUntilTurn, state.turn);
  const ended = endTurn(returned, 'player-1');
  assert.equal(ended.success, true);
  assert.equal(ended.state.players[0].hand.find((item) => item.instanceId === ally.instanceId)?.currentCost, 5);
  assert.equal(ended.state.players[0].hand.find((item) => item.instanceId === ally.instanceId)?.temporaryCostUntilTurn, undefined);
});

test('씨 몬스터는 손패 조건이 문구에 있으면 아군 리타이어에 반응한다', () => {
  const seaDefinition = definition('씨 몬스터', savedConfigs['씨 몬스터']!, {
    text: '손패에 있을 때 아군 선수가 리타이어할 때마다 비용이 -1G 씩 감소한다. (최소 비용 1G)', cost: 10,
  });
  assert.equal(seaDefinition.abilities[0]?.condition?.type, 'SOURCE_IN_HAND');
  const sea = { ...card(seaDefinition, 'sea-in-hand'), currentCost: 4 };
  const victim = { ...card(definition('아군', { effects: [] }), 'sea-ally'), boardSlot: 0 as const, currentHealth: 1 };
  const enemy = { ...card(definition('적군', { effects: [] }), 'sea-enemy'), boardSlot: 0 as const, currentAttack: 2 };
  const state = stateWithPool([seaDefinition]);
  state.activePlayerId = 'player-2';
  state.players[0].hand = [sea];
  state.players[0].board[0] = victim;
  state.players[1].board[0] = enemy;
  const result = attack(state, 'player-2', enemy.instanceId, { type: 'WRESTLER', playerId: 'player-1', cardInstanceId: victim.instanceId });
  assert.equal(result.success, true);
  assert.equal(result.state.players[0].hand[0]?.currentCost, 3);
});

test('설정이 누락된 좀비 흡수 카드는 가장 강한 좀비를 흡수하고 없으면 2/2 좀비를 소환한다', () => {
  const zombie = definition('좀비', { effects: [] }, { attack: 0, health: 0, tags: [] });
  const absorber = definition('좀비 플래티넘구슬 마스터', { effects: [] }, {
    attack: 3, health: 3,
    text: "등장:필드에 있는 '좀비' 중 가장 수치의 합이 높은 '좀비'의 체력과 공격력을 자신에게 더합니다. '좀비'가 없다면 2/2 '좀비'를 생성하고 그 '좀비'의 체력과 공격력을 자신에게 더합니다.",
  });
  const state = stateWithPool([zombie, absorber]);
  const summoned = enterField(state, 'player-1', card(absorber, 'absorber-empty'), 0);
  assert.equal(summoned.players[0].board[0]?.currentAttack, 5);
  assert.equal(summoned.players[0].board[0]?.currentHealth, 5);
  assert.equal(summoned.players[0].board[1]?.currentAttack, 2);
  const stronger = { ...card(zombie, 'zombie-strong'), boardSlot: 1 as const, currentAttack: 6, currentHealth: 4, maxHealth: 4 };
  const withZombie = stateWithPool([zombie, absorber]);
  withZombie.players[0].board[1] = stronger;
  const copied = enterField(withZombie, 'player-1', card(absorber, 'absorber-copy'), 0);
  assert.equal(copied.players[0].board[0]?.currentAttack, 9);
  assert.equal(copied.players[0].board[0]?.currentHealth, 7);
  assert.equal(copied.players[0].board.filter(Boolean).length, 2);
});

test('기존 GENERATE 설정이 자기 자신을 가리켜도 좀비 토큰만 소환한다', () => {
  const absorber = definition('좀비 플래티넘구슬 마스터', {
    effects: [effect('ENTER_FIELD', 'GENERATE', undefined, {
      definitionRef: { id: 'saved-좀비 플래티넘구슬 마스터' }, destination: 'HAND', count: 1,
    })],
  }, {
    attack: 3, health: 3,
    text: "등장:필드에 있는 '좀비' 중 가장 수치의 합이 높은 '좀비'의 체력과 공격력을 자신에게 더합니다. '좀비'가 없다면 2/2 '좀비'를 생성하고 그 '좀비'의 체력과 공격력을 자신에게 더합니다.",
  });
  // A deck-only pool may have no zombie token definition at all.
  const entered = enterField(stateWithPool([absorber]), 'player-1', card(absorber, 'absorber'), 0);
  assert.equal(entered.players[0].board[0]?.currentAttack, 5);
  assert.equal(entered.players[0].board[0]?.currentHealth, 5);
  assert.equal(entered.players[0].board[1]?.definitionId, 'ko-fallback-zombie-token');
  assert.equal(entered.players[0].board[1]?.isToken, true);
  assert.equal(entered.players[0].hand.length, 0);
  assert.equal(entered.cardPool?.find((candidate) => candidate.id === 'ko-fallback-zombie-token')?.name, '좀비');
});

test('다른 선수의 이름 참조 좀비 소환은 토큰만 찾아 필드에 놓는다', () => {
  const source = definition('다른 소환 선수', {
    effects: [effect('ENTER_FIELD', 'SUMMON', undefined, { definitionRef: { name: '좀비' }, count: 1 })],
  });
  const zombie = definition('좀비', { effects: [] }, { id: 'real-zombie-token', isToken: true, attack: 1, health: 1 });
  const summoned = enterField(stateWithPool([source, zombie]), 'player-1', card(source, 'summoner'), 0);
  assert.equal(summoned.players[0].board[1]?.definitionId, zombie.id);
  assert.equal(summoned.players[0].board[1]?.isToken, true);

  const withoutToken = enterField(stateWithPool([source]), 'player-1', card(source, 'summoner-missing-token'), 0);
  assert.equal(withoutToken.players[0].board[1]?.definitionId, 'ko-fallback-zombie-token');
  assert.equal(withoutToken.players[0].board[1]?.isToken, true);
});

test('챔피언의 이름 참조 좀비 소환도 자기 이름에 좀비가 있어도 토큰을 소환한다', () => {
  const source = definition('좀비 챔피언 대리 카드', { effects: [] });
  const state = stateWithPool([source]);
  state.players[0].board[0] = { ...card(source, 'champion-source'), boardSlot: 0 };
  const summoned = applyEffect(state, 'player-1', state.players[0].board[0]!, {
    type: 'STRUCTURED', action: 'SUMMON', values: { definitionRef: { name: '좀비' }, count: 1 },
  });
  assert.equal(summoned.players[0].board[1]?.definitionId, 'ko-fallback-zombie-token');
  assert.equal(summoned.players[0].board[1]?.isToken, true);
});

test('좀비를 손패에 생성하는 카드도 실제 좀비 토큰을 생성한다', () => {
  const source = definition('좀비 제작자', {
    effects: [effect('ENTER_FIELD', 'GENERATE', undefined, {
      definitionRef: { name: '좀비' }, destination: 'HAND', count: 1,
    })],
  });
  const generated = enterField(stateWithPool([source]), 'player-1', card(source, 'zombie-maker'), 0);
  assert.equal(generated.players[0].hand[0]?.definitionId, 'ko-fallback-zombie-token');
  assert.equal(generated.players[0].hand[0]?.isToken, true);
  assert.equal(generated.players[0].hand.length, 1);
});

test('아르카나 조커가 파괴한 덱 맨 위 카드는 묘지에 가지 않고 다음 턴에는 한 장만 뽑는다', () => {
  const arcana = definition('아르카나 조커', savedConfigs['아르카나 조커']!, {
    text: '등장:내 덱 맨 위에 있는 카드를 파괴하고 무작위 카드를 덱 맨 위에 추가합니다.',
  });
  const filler = definition('일반 선수', { effects: [] });
  const state = stateWithPool([arcana, filler]);
  state.players[0].deck = [card(filler, 'destroyed-top'), card(filler, 'remaining')];
  state.players[1].deck = [card(filler, 'opponent-draw')];
  const entered = enterField(state, 'player-1', card(arcana, 'arcana-played'), 0);
  assert.equal(entered.players[0].graveyard.some((item) => item.instanceId === 'destroyed-top'), false);
  assert.equal(entered.players[0].deck.some((item) => item.instanceId === 'destroyed-top'), false);
  assert.equal(entered.events.some((event) => event.type === 'CARD_REMOVED' && event.cardInstanceId === 'destroyed-top'), true);
  const opponentTurn = endTurn(entered, 'player-1');
  assert.equal(opponentTurn.success, true);
  const nextTurn = endTurn(opponentTurn.state, 'player-2');
  assert.equal(nextTurn.success, true);
  assert.equal(nextTurn.state.events.filter((event) => event.type === 'CARD_DRAWN' && event.playerId === 'player-1').length, 1);
});

test('과거 판도라 토큰 설정은 대상 파괴와 이후 퇴장 공격력 흡수를 함께 실행한다', () => {
  const token = cardRecordToDefinition({
    id: 'pandora-old-token', name: '테스트 토큰', cardType: 'WRESTLER', cost: 2, attack: 1, health: 4,
    text: '등장:선택한 선수를 파괴시킵니다. 이 카드가 필드에 있을때 이 카드가 리타이어 혹은 파괴 시킨 선수의 공격력을 이 카드의 공격력에 더합니다.',
    keywords: [], isToken: true, isChampionToken: true, effectId: 'STRUCTURED_EFFECTS_V1',
    effectConfig: { effects: [
      { trigger: 'ENTER_FIELD', action: 'DESTROY', target: { zone: 'BOARD', owner: 'ENEMY', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1 } },
      { trigger: 'ENTER_FIELD', action: 'ADD_AGGREGATED_ATTACK', target: { zone: 'BOARD', owner: 'ENEMY', selection: 'PLAYER_CHOICE', count: 1 }, values: { aggregateStats: { source: 'LAST_DESTROYED_TARGETS', attack: 'CURRENT_ATTACK_SUM', health: 'CURRENT_HEALTH_SUM' } } },
    ] }, status: 'PUBLISHED', version: 1, createdAt: '', updatedAt: '', imageAssetId: null, imageUrl: null,
  });
  assert.deepEqual(token.abilities[0]?.effects.map((effect) => effect.type === 'STRUCTURED' ? effect.action : effect.type), ['REGISTER_LISTENER', 'DESTROY']);
  const victim = { ...card(definition('pandora-victim', { effects: [] }, { attack: 6 }), 'pandora-target'), boardSlot: 0 as const };
  const state = stateWithPool([token]);
  state.players[1].board[0] = victim;
  const pending = enterField(state, 'player-1', card(token, 'pandora-runtime'), 0);
  const result = selectEffectTarget(pending, victim.instanceId);
  assert.equal(result.players[1].board[0], null);
  assert.equal(result.players[0].board[0]?.currentAttack, 7);
});

test('판도라 폭주가 퀘스트 보상으로 등장하면 대상을 파괴하고 이후 전투 리타이어도 흡수한다', () => {
  const token = definition('챔피언 판도라(폭주)', { effects: [] }, {
    id: 'eaefcf6c-575d-4482-aaad-98b54561b49a', isToken: true, isChampionToken: true,
    attack: 4, health: 8,
    rulesText: '카드가 챔피언 퀘스트 보상 효과로 소환되면 등장 효과를 발동시킵니다. 등장:선택한 선수를 파괴시킵니다. 이 카드는 자신이 리타이어 혹은 파괴 시킨 선수의 공격력을 흡수합니다.',
  });
  const champion = championRecordToDefinition({
    id: 'pandora-champion', name: '챔피언 판도라', description: '', imageAssetId: null, imageUrl: null,
    maxHealth: 20, abilityName: '능력', abilityCost: 1, abilityText: '', abilityEffects: { effects: [] },
    hasQuest: true, questName: '폭주', questText: '선수 카드 1장 사용',
    questCondition: { event: 'CARD_PLAYED', required: 1 }, questProgressRequired: 1,
    questRewardText: "고유 능력을 강화시키고, '챔피언 판도라(폭주)'를 필드에 소환합니다.",
    questRewardEffects: { effects: [{ action: 'UPGRADE_CHAMPION_ABILITY' }] },
    upgradedAbilityName: '폭주 능력', upgradedAbilityCost: 1, upgradedAbilityText: '', upgradedAbilityEffects: { effects: [] },
    championTokenDefinitionId: token.id, status: 'PUBLISHED', version: 1,
  });
  assert.equal(champion.quest?.reward.type, 'DIRECT_DEPLOY_CHAMPION_TOKEN');
  const victimDefinition = definition('상대 선수', { effects: [] }, { attack: 6, health: 2 });
  const another = definition('전투 대상', { effects: [] }, { attack: 3, health: 1 });
  const state = createInitialGameState([champion.id, 'test-champion-no-quest'], [token, victimDefinition, another], [champion, TEST_CHAMPIONS[1]!]);
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.players[1].board[0] = { ...card(victimDefinition, 'quest-victim'), boardSlot: 0 };
  const completed = processChampionQuestEvents(state, {
    ...state, events: [...state.events, { type: 'CARD_PLAYED', playerId: 'player-1', cardInstanceId: 'played-card', cardType: 'WRESTLER',
      source: { type: 'PLAYER', playerId: 'player-1' }, target: { type: 'CARD', cardInstanceId: 'played-card' }, reason: 'PLAY_FROM_HAND' }],
  });
  assert.equal(completed.players[0].champion?.questCompleted, true);
  assert.equal(completed.targetingState?.validTargetIds.includes('quest-victim'), true);
  const destroyed = selectEffectTarget(completed, 'quest-victim');
  const pandora = destroyed.players[0].board.find((item) => item?.definitionId === token.id);
  assert.equal(destroyed.players[1].board[0], null);
  assert.equal(pandora?.currentAttack, 10);
  assert.ok(pandora?.isDirectDeployedChampion);
  destroyed.players[0].board[pandora!.boardSlot!] = { ...pandora!, enteredThisTurn: false };
  destroyed.players[1].board[0] = { ...card(another, 'later-victim'), boardSlot: 0 };
  const attacked = attack(destroyed, 'player-1', pandora!.instanceId, {
    type: 'WRESTLER', playerId: 'player-2', cardInstanceId: 'later-victim',
  });
  assert.equal(attacked.success, true);
  assert.equal(attacked.state.players[0].board[pandora!.boardSlot!]?.currentAttack, 13);
});

test('퀘스트 보상의 일반 SUMMON도 등장 효과를 명시한 판도라에게만 등장 효과를 발동한다', () => {
  const token = definition('챔피언 판도라(폭주)', { effects: [] }, {
    isToken: true, isChampionToken: true, attack: 2,
    rulesText: '카드가 챔피언 퀘스트 보상 효과로 소환되면 등장 효과를 발동시킵니다. 등장:선택한 선수를 파괴시킵니다. 이 카드는 자신이 리타이어 혹은 파괴 시킨 선수의 공격력을 흡수합니다.',
  });
  const champion = championRecordToDefinition({
    id: 'summon-pandora', name: '퀘스트 소환', description: '', imageAssetId: null, imageUrl: null,
    maxHealth: 20, abilityName: '능력', abilityCost: 1, abilityText: '', abilityEffects: { effects: [] },
    hasQuest: true, questName: '완료', questText: '선수 카드 1장 사용',
    questCondition: { event: 'CARD_PLAYED', required: 1 }, questProgressRequired: 1,
    questRewardText: '판도라를 소환합니다.', questRewardEffects: { effects: [{ action: 'SUMMON', values: { definitionRef: { id: token.id }, count: 1 } }] },
    upgradedAbilityName: null, upgradedAbilityCost: null, upgradedAbilityText: null, upgradedAbilityEffects: null,
    championTokenDefinitionId: null, status: 'PUBLISHED', version: 1,
  });
  const victim = definition('소환 대상', { effects: [] }, { attack: 5 });
  const state = createInitialGameState([champion.id, 'test-champion-no-quest'], [token, victim], [champion, TEST_CHAMPIONS[1]!]);
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.players[1].board[0] = { ...card(victim, 'summon-victim'), boardSlot: 0 };
  const completed = processChampionQuestEvents(state, { ...state, events: [{
    type: 'CARD_PLAYED', playerId: 'player-1', cardInstanceId: 'played-summon', cardType: 'WRESTLER',
    source: { type: 'PLAYER', playerId: 'player-1' }, target: { type: 'CARD', cardInstanceId: 'played-summon' }, reason: 'PLAY_FROM_HAND',
  }] });
  assert.equal(completed.targetingState?.validTargetIds.includes('summon-victim'), true);
  const destroyed = selectEffectTarget(completed, 'summon-victim');
  assert.equal(destroyed.players[0].board.find((item) => item?.definitionId === token.id)?.currentAttack, 7);
  assert.equal(destroyed.players[1].board[0], null);
});

test('판도라 폭주의 등장 대상은 아군 선수도 가능하며 자신은 대상에서 제외된다', () => {
  const pandora = definition('챔피언 판도라(폭주)', { effects: [] }, {
    attack: 3,
    rulesText: '등장:선택한 선수를 파괴시킵니다. 이 카드는 자신이 리타이어 혹은 파괴 시킨 선수의 공격력을 흡수합니다.',
  });
  const ally = definition('아군 대상', { effects: [] }, { attack: 4 });
  const state = stateWithPool([pandora, ally]);
  state.players[0].board[1] = { ...card(ally, 'friendly-target'), boardSlot: 1 };
  const entered = enterField(state, 'player-1', card(pandora, 'pandora-own-instance'), 0);
  assert.equal(entered.targetingState?.validTargetIds.includes('friendly-target'), true);
  assert.equal(entered.targetingState?.validTargetIds.includes('pandora-own-instance'), false);
  const destroyed = selectEffectTarget(entered, 'friendly-target');
  assert.equal(destroyed.players[0].board[1], null);
  assert.equal(destroyed.players[0].board[0]?.currentAttack, 7);
});

test('매드 펌킨 비용 감소는 최소 1을 지키고 WRESTLER가 아닌 카드는 선택 대상이 아니다', () => {
  const madPumpkinDefinition = definition('매드 펌킨', {
    effects: [{
      trigger: 'ENTER_FIELD',
      action: 'MOVE_TO_HAND',
      target: { zone: 'BOARD', owner: 'SELF', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1 },
      values: { amount: 1, minimum: 1, temporaryCost: true },
    }],
  }, { cost: 2, attack: 2, health: 2 });
  const allyDefinition = definition('비용 1 선수', { effects: [] }, { cost: 1 });
  const techniqueDefinition = definition('기술 카드 대상', { effects: [] }, { cardType: 'TECHNIQUE' });
  const state = stateWithPool([madPumpkinDefinition, allyDefinition, techniqueDefinition]);
  const ally = { ...card(allyDefinition, 'minimum-cost-target'), boardSlot: 1 as const };
  state.players[0].board = [null, ally, null, null];
  const pending = enterField(state, 'player-1', card(madPumpkinDefinition, 'mad-pumpkin-minimum'), 0);
  const returned = selectEffectTarget(pending, ally.instanceId);
  assert.equal(returned.players[0].hand.find((item) => item.instanceId === ally.instanceId)?.currentCost, 1);

  const invalidState = stateWithPool([madPumpkinDefinition, techniqueDefinition]);
  invalidState.players[0].board = [null, { ...card(techniqueDefinition, 'invalid-technique'), boardSlot: 1 }, null, null];
  const afterInvalid = enterField(
    invalidState,
    'player-1',
    card(madPumpkinDefinition, 'mad-pumpkin-invalid'),
    0,
  );
  assert.equal(afterInvalid.targetingState?.validTargetIds.includes('invalid-technique') ?? false, false);
  assert.equal(afterInvalid.players[0].board[1]?.instanceId, 'invalid-technique');
  assert.equal(afterInvalid.players[0].hand.some((item) => item.instanceId === 'invalid-technique'), false);
});

test('독세아·블랙 마카롱·디 오리진·여울·피 스타 세븐의 보드 효과가 실제 상태를 변경한다', () => {
  const grave = card(saved['여울']!, 'grave');
  const generatedHand = { ...card(saved['독세아']!, 'generated-hand'), isGenerated: true };
  const generatedDeck = { ...card(saved['독세아']!, 'generated-deck'), isGenerated: true };
  const generatedBoard = { ...card(saved['독세아']!, 'generated-board'), isGenerated: true, boardSlot: 1 as const };

  const generatedState = stateWithPool(Object.values(saved));
  generatedState.players[0].hand = [generatedHand];
  generatedState.players[0].deck = [generatedDeck];
  generatedState.players[0].board = [null, generatedBoard, null, null];
  const withDeoksea = enterField(generatedState, 'player-1', card(saved['독세아']!, 'deoksea'), 0);
  assert.equal(withDeoksea.players[0].hand[0]?.currentAttack, 2);
  assert.equal(withDeoksea.players[0].deck[0]?.currentHealth, 2);
  assert.equal(withDeoksea.players[0].board[1]?.currentAttack, 2);

  const originState = stateWithPool(Object.values(saved));
  originState.players[0].graveyard = [grave];
  const withOrigin = enterField(originState, 'player-1', card(saved['디 오리진']!, 'origin'), 0);
  assert.equal(withOrigin.players[0].board[0]?.currentAttack, 1);
  assert.equal(withOrigin.players[0].board[0]?.currentHealth, 1);
  const threeGraves = stateWithPool(Object.values(saved));
  threeGraves.players[0].graveyard = Array.from({ length: 3 }, (_, index) => card(saved['여울']!, `origin-grave-${index}`));
  const buffedOrigin = enterField(threeGraves, 'player-1', card(saved['디 오리진']!, 'origin-three'), 0);
  assert.equal(buffedOrigin.players[0].board[0]?.currentAttack, 2);
  assert.equal(buffedOrigin.players[0].board[0]?.currentHealth, 2);
  const oldConfig = { effects: [effect('ENTER_FIELD', 'BUFF', boardSelf, { amountReference: 'GRAVEYARD_WRESTLER_COUNT' })] };
  const migratedOrigin = definition('디 오리진', oldConfig, {
    rulesText: '등장:자신의 무덤에 있는 선수 카드 3장당 1씩 공격력과 체력이 증가합니다.',
  });
  const sixGraves = stateWithPool([...Object.values(saved), migratedOrigin]);
  sixGraves.players[0].graveyard = Array.from({ length: 6 }, (_, index) => card(saved['여울']!, `migrated-grave-${index}`));
  const migrated = enterField(sixGraves, 'player-1', card(migratedOrigin, 'origin-six'), 0);
  assert.equal(migrated.players[0].board[0]?.currentAttack, 3);
  assert.equal(migrated.players[0].board[0]?.currentHealth, 3);

  const blackState = stateWithPool(Object.values(saved));
  blackState.players[0].hand = [card(saved['여울']!, 'hand-1'), card(saved['여울']!, 'hand-2')];
  const withBlack = enterField(blackState, 'player-1', card(saved['블랙 마카롱']!, 'black'), 0);
  assert.equal(withBlack.players[0].board[0]?.currentAttack, 3);
  assert.equal(withBlack.players[0].board[0]?.currentHealth, 1);
  assert.equal(withBlack.players[0].board[0]?.maxHealth, 1);

  const yeoulState = stateWithPool(Object.values(saved));
  yeoulState.players[0].hand = [card(saved['여울']!, 'yeoul-hand-1'), card(saved['여울']!, 'yeoul-hand-2')];
  const withYeo = enterField(yeoulState, 'player-1', card(saved['여울']!, 'yeoul'), 0);
  assert.ok(withYeo.players[0].hand.every((item) => item.currentAttack >= 2));

  const pStarState = stateWithPool(Object.values(saved));
  pStarState.players[0].board = [
    { ...card(saved['여울']!, 'ally-1'), boardSlot: 0 },
    null,
    { ...card(saved['여울']!, 'ally-2'), boardSlot: 2 },
    null,
  ];
  const withPStar = enterField(pStarState, 'player-1', card(saved['피 스타 세븐']!, 'pstar'), 1);
  assert.equal(withPStar.players[0].board[0]?.currentAttack, 3);
  assert.equal(withPStar.players[0].board[2]?.currentAttack, 3);
  assert.equal(withPStar.players[0].board[1]?.currentAttack, 1);
});

test('루나·씨 몬스터·아르카나 조커·워썬더의 전투/퇴장/덱 흐름이 실제 매치에서 동작한다', () => {
  const luna = { ...card(saved['루나']!, 'luna'), boardSlot: 0 as const, currentHealth: 5, maxHealth: 5 };
  const enemy = { ...card(saved['여울']!, 'enemy'), playerId: undefined, boardSlot: 0 as const, currentHealth: 5, maxHealth: 5, isSilenced: false };
  const initial = stateWithPool(Object.values(saved));
  initial.activePlayerId = 'player-2';
  initial.players[0].board = [luna, null, null, null];
  initial.players[1].board = [enemy, null, null, null];

  const attacked = attack(initial, 'player-2', enemy.instanceId, { type: 'WRESTLER', playerId: 'player-1', cardInstanceId: luna.instanceId });
  assert.equal(attacked.success, true);
  assert.equal(attacked.state.players[0].board[0]?.isAbilityDisabled, true);
  assert.equal(attacked.state.players[1].board[0]?.isSilenced, true);

  const sea = { ...card(saved['씨 몬스터']!, 'sea'), currentCost: 4 };
  const victim = { ...card(saved['여울']!, 'victim'), boardSlot: 1 as const };
  const withSea = {
    ...attacked.state,
    activePlayerId: 'player-2',
    players: attacked.state.players.map((player) => player.id === 'player-1'
      ? { ...player, hand: [sea], board: [luna, victim, null, null] as typeof player.board }
      : player.id === 'player-2'
        ? {
            ...player,
            board: [{ ...card(saved['여울']!, 'sea-attacker'), boardSlot: 0, currentAttack: 5, currentHealth: 5, maxHealth: 5 }, null, null, null] as typeof player.board,
          }
        : player),
  };
  const retired = attack(withSea, 'player-2', 'sea-attacker', {
    type: 'WRESTLER',
    playerId: 'player-1',
    cardInstanceId: victim.instanceId,
  });
  assert.equal(retired.success, true);
  // This fixture has no explicit "이 카드가 손패에 있을 때" clause.
  assert.equal(retired.state.players[0].hand[0]?.currentCost, 4);

  const arcana = card(saved['아르카나 조커']!, 'arcana');
  const top = card(saved['여울']!, 'top');
  const arcanaState = stateWithPool(Object.values(saved));
  arcanaState.players[0].deck = [top];
  const afterArcana = enterField(arcanaState, 'player-1', arcana, 0);
  assert.equal(afterArcana.players[0].graveyard.at(-1)?.instanceId, top.instanceId);
  assert.equal(afterArcana.players[0].deck[0]?.isGenerated, true);
  assert.equal(afterArcana.players[0].deck[0]?.currentCost, 0);

  const thunderState = stateWithPool(Object.values(saved));
  thunderState.players[0].deck = [card(saved['여울']!, 't1'), card(saved['여울']!, 't2'), card(saved['여울']!, 't3'), card(saved['여울']!, 'keep')];
  const afterThunder = enterField(thunderState, 'player-1', card(saved['워썬더']!, 'thunder'), 0);
  assert.equal(afterThunder.players[0].deck.length, 1);
  assert.equal(afterThunder.players[0].nextTurnGoldBonus, 1);
});

test('뒷정리맨·오심정정·위리놈·저지먼트의 선택/continuation 흐름이 실제 매치에서 동작한다', () => {
  const cleanupState = stateWithPool(Object.values(saved));
  const cleanup = enterField(cleanupState, 'player-1', card(saved['뒷정리맨']!, 'cleanup'), 0);
  assert.equal(cleanup.pendingCardEffects.length, 1);
  const next = card(saved['여울']!, 'next');
  const withHand = { ...cleanup, players: cleanup.players.map((player) => player.id === 'player-1' ? { ...player, hand: [next], currentGold: 1 } : player) };
  const played = playWrestlerFromHand(withHand, 'player-1', next.instanceId, 1);
  assert.equal(played.success, true);
  assert.equal(played.state.players[0].board[1]?.currentHealth, 3);

  const graveCard = card(saved['여울']!, 'grave-choice');
  const correctionState = stateWithPool(Object.values(saved));
  correctionState.players[0].graveyard = [graveCard];
  const pending = enterField(correctionState, 'player-1', card(saved['오심정정']!, 'correction'), 0);
  assert.deepEqual(pending.targetingState?.validTargetIds, [graveCard.instanceId]);
  const corrected = selectEffectTarget(pending, graveCard.instanceId);
  assert.equal(corrected.players[0].hand.at(-1)?.instanceId, graveCard.instanceId);

  const wiriyeo = definition('위리녀', { effects: [] }, { id: 'wiriyeo-id', attack: 2, health: 3 });
  const wiriState = stateWithPool([...Object.values(saved), wiriyeo]);
  const wiri = { ...card(saved['위리놈']!, 'wiri'), currentAttack: 5, currentHealth: 4, maxHealth: 4 };
  const withWiri = enterField(wiriState, 'player-1', wiri, 0);
  assert.equal(withWiri.players[0].hand[0]?.definitionId, 'wiriyeo-id');
  assert.equal(withWiri.players[0].hand[0]?.currentAttack, 5);
  assert.equal(withWiri.players[0].hand[0]?.currentHealth, 4);
  const retiredState = {
    ...withWiri,
    activePlayerId: 'player-2',
    players: withWiri.players.map((player) => player.id === 'player-2'
      ? {
          ...player,
          board: [{ ...card(saved['여울']!, 'wiri-attacker'), boardSlot: 0, currentAttack: 5, currentHealth: 5, maxHealth: 5 }, null, null, null] as typeof player.board,
        }
      : player),
  };
  const afterWiriRetire = attack(retiredState, 'player-2', 'wiri-attacker', {
    type: 'WRESTLER',
    playerId: 'player-1',
    cardInstanceId: wiri.instanceId,
  });
  assert.equal(afterWiriRetire.success, true);
  assert.equal(afterWiriRetire.state.players[0].board[0]?.definitionId, 'wiriyeo-id');
  assert.equal(afterWiriRetire.state.players[0].graveyard.at(-1)?.instanceId, wiri.instanceId);

  const destroyState = enterField(wiriState, 'player-1', card(saved['위리놈']!, 'wiri-destroy'), 0);
  const afterWiriDestroy = destroyCard(destroyState, 'player-1', 'wiri-destroy');
  assert.equal(afterWiriDestroy.success, true);
  assert.equal(afterWiriDestroy.state.players[0].board[0], null);
  assert.equal(afterWiriDestroy.state.players[0].graveyard.some((entry) => entry.instanceId === 'wiri-destroy'), false);
  assert.equal(afterWiriDestroy.state.players[0].board.some((entry) => entry?.definitionId === 'wiriyeo-id'), false);
  assert.equal(afterWiriDestroy.state.events.some((event) => event.type === 'CARD_RETIRED' && event.cardInstanceId === 'wiri-destroy'), false);

  const judgeState = stateWithPool(Object.values(saved));
  const judgePending = enterField(judgeState, 'player-1', card(saved['저지먼트']!, 'judge'), 0);
  const enemy = card(saved['여울']!, 'judge-target');
  judgePending.players[1].board[0] = { ...enemy, boardSlot: 0 };
  const judgeWithTarget = enterField({ ...judgePending, targetingState: undefined }, 'player-1', card(saved['저지먼트']!, 'judge-2'), 1);
  const judged = selectEffectTarget(judgeWithTarget, enemy.instanceId);
  assert.equal(judged.players[1].board.some((item) => item?.instanceId === enemy.instanceId), false);
});

test('뒷정리맨 queue는 자기 자신을 제외하고 다음 아군 선수에게 한 번만 적용된다', () => {
  const cleanupDefinition = definition('뒷정리맨', savedConfigs['뒷정리맨']!, { attack: 1, health: 2 });
  const nextDefinition = definition('다음 선수', { effects: [] });
  const state = stateWithPool([cleanupDefinition, nextDefinition]);
  const cleanup = card(cleanupDefinition, 'cleanup-source');
  const nextA = card(nextDefinition, 'next-a');
  const nextB = card(nextDefinition, 'next-b');
  state.players[0].hand = [cleanup];
  state.players[0].currentGold = 10;

  const afterCleanup = playWrestlerFromHand(state, 'player-1', cleanup.instanceId, 0);
  assert.equal(afterCleanup.success, true);
  assert.equal(afterCleanup.state.players[0].board[0]?.instanceId, cleanup.instanceId);
  assert.equal(afterCleanup.state.players[0].board[0]?.currentHealth, 2);
  assert.equal(afterCleanup.state.pendingCardEffects.length, 1);

  const withNextA = {
    ...afterCleanup.state,
    players: afterCleanup.state.players.map((player) => player.id === 'player-1'
      ? { ...player, hand: [nextA], currentGold: 10 }
      : player),
  };
  const afterNextA = playWrestlerFromHand(withNextA, 'player-1', nextA.instanceId, 1);
  assert.equal(afterNextA.success, true);
  assert.equal(afterNextA.state.players[0].board[1]?.currentHealth, 3);
  assert.equal(afterNextA.state.pendingCardEffects.length, 0);

  const withNextB = {
    ...afterNextA.state,
    players: afterNextA.state.players.map((player) => player.id === 'player-1'
      ? { ...player, hand: [nextB], currentGold: 10 }
      : player),
  };
  const afterNextB = playWrestlerFromHand(withNextB, 'player-1', nextB.instanceId, 2);
  assert.equal(afterNextB.success, true);
  assert.equal(afterNextB.state.players[0].board[2]?.currentHealth, 1);
});

test('뒷정리맨 queue는 상대 선수와 기술 카드 플레이로 소비되지 않는다', () => {
  const cleanupDefinition = definition('뒷정리맨', savedConfigs['뒷정리맨']!, { attack: 1, health: 2 });
  const wrestlerDefinition = definition('상대 선수', { effects: [] });
  const techniqueDefinition = definition('기술 카드', { effects: [] }, { cardType: 'TECHNIQUE' });
  const state = stateWithPool([cleanupDefinition, wrestlerDefinition, techniqueDefinition]);
  const cleanup = card(cleanupDefinition, 'cleanup-source');
  const opponentWrestler = card(wrestlerDefinition, 'opponent-wrestler');
  const technique = card(techniqueDefinition, 'technique');
  state.players[0].hand = [cleanup];
  state.players[0].currentGold = 10;

  const afterCleanup = playWrestlerFromHand(state, 'player-1', cleanup.instanceId, 0);
  assert.equal(afterCleanup.success, true);
  const afterOpponent = {
    ...afterCleanup.state,
    activePlayerId: 'player-2',
    players: afterCleanup.state.players.map((player) => player.id === 'player-2'
      ? { ...player, hand: [opponentWrestler], currentGold: 10 }
      : player),
  };
  const opponentResult = playWrestlerFromHand(afterOpponent, 'player-2', opponentWrestler.instanceId, 0);
  assert.equal(opponentResult.success, true);
  assert.equal(opponentResult.state.pendingCardEffects.length, 1);

  const afterTechnique = {
    ...opponentResult.state,
    activePlayerId: 'player-1',
    players: opponentResult.state.players.map((player) => player.id === 'player-1'
      ? { ...player, hand: [technique], currentGold: 10 }
      : player),
  };
  const techniqueResult = playTechniqueFromHand(afterTechnique, 'player-1', technique.instanceId);
  assert.equal(techniqueResult.success, true);
  assert.equal(techniqueResult.state.pendingCardEffects.length, 1);
});

test('뒷정리맨 queue는 SUMMON·REVIVE·Champion Token 전개로 소비되지 않는다', () => {
  const cleanupDefinition = definition('뒷정리맨', savedConfigs['뒷정리맨']!, { attack: 1, health: 2 });
  const wrestlerDefinition = definition('소환 선수', { effects: [] });
  const championTokenDefinition = definition('챔피언 토큰', { effects: [] }, {
    id: 'champion-token',
    isToken: true,
    isChampionToken: true,
  });

  const queuedState = () => {
    const state = stateWithPool([cleanupDefinition, wrestlerDefinition, championTokenDefinition]);
    const cleanup = card(cleanupDefinition, 'cleanup-source');
    return enterField(state, 'player-1', cleanup, 0);
  };

  const summonedState = queuedState();
  const summoned = { ...card(wrestlerDefinition, 'summoned'), isGenerated: true };
  const afterSummon = enterField(summonedState, 'player-1', summoned, 1, undefined, undefined, 'SUMMON');
  assert.equal(afterSummon.players[0].board[1]?.currentHealth, 1);
  assert.equal(afterSummon.pendingCardEffects.length, 1);

  const revivedState = queuedState();
  const revived = card(wrestlerDefinition, 'revived');
  const afterRevive = enterField(revivedState, 'player-1', revived, 1, undefined, undefined, 'REVIVE');
  assert.equal(afterRevive.players[0].board[1]?.currentHealth, 1);
  assert.equal(afterRevive.pendingCardEffects.length, 1);

  const championState = queuedState();
  const championPlayer = championState.players.find((player) => player.id === 'player-1');
  assert.ok(championPlayer?.champion);
  const withLinkedToken = {
    ...championState,
    players: championState.players.map((player) => player.id === 'player-1'
      ? {
          ...player,
          champion: { ...player.champion!, championTokenDefinitionId: championTokenDefinition.id },
        }
      : player),
  };
  const afterChampionDeploy = directDeployChampionToken(
    withLinkedToken,
    'player-1',
    championPlayer!.champion!.id,
    championTokenDefinition.id,
  );
  assert.equal(afterChampionDeploy.pendingCardEffects.length, 1);
  assert.equal(afterChampionDeploy.players[0].board.filter(Boolean).length, 2);
});

test('조킹루이지·퍼플레인·아비터·플래티넘 구슬 마스터의 지속/조건부 효과가 실제 매치에서 동작한다', () => {
  const jokerState = stateWithPool(Object.values(saved).map((item) => item.id === saved['여울']!.id ? { ...item, cost: 4 } : item));
  jokerState.players[0].board = [
    { ...card(saved['여울']!, 'joker-left'), boardSlot: 0 },
    null,
    { ...card(saved['여울']!, 'joker-right'), boardSlot: 2 },
    null,
  ];
  const joker = enterField(jokerState, 'player-1', card(saved['조킹루이지']!, 'joker'), 1);
  assert.ok(joker.players[0].board[0]?.keywords.includes('TAUNT'));
  assert.ok(joker.players[0].board[2]?.keywords.includes('TAUNT'));
  assert.equal(joker.players[0].board[1]?.keywords.includes('TAUNT'), false);

  const purpleState = stateWithPool(Object.values(saved));
  const enemy = { ...card(saved['여울']!, 'purple-target'), currentAttack: 2, currentHealth: 3, maxHealth: 3, boardSlot: 0 as const };
  purpleState.players[1].board = [enemy, null, null, null];
  const purple = enterField(purpleState, 'player-1', card(saved['퍼플레인']!, 'purple'), 0);
  assert.equal(purple.players[1].board[0]?.currentAttack, 0);
  assert.equal(purple.players[1].board[0]?.isStunned, true);
  assert.equal(purple.players[1].board[0]?.isSilenced, true);

  const arbiterState = stateWithPool(Object.values(saved));
  arbiterState.players[0].currentGold = 1;
  arbiterState.players[0].board = [{ ...card(saved['아비터']!, 'arbiter'), boardSlot: 0 }, null, null, null];
  arbiterState.activePlayerId = 'player-2';
  const arbiterTurn = endTurn(arbiterState, 'player-2');
  assert.equal(arbiterTurn.success, true);
  assert.equal(arbiterTurn.state.players[0].currentGold, 2);

  const goldState = stateWithPool(Object.values(saved));
  goldState.players[0].currentGold = 3;
  const gold = enterField(goldState, 'player-1', { ...card(saved['플래티넘 구슬 마스터']!, 'platinum'), currentAttack: 1, currentHealth: 1, maxHealth: 1 }, 0);
  assert.equal(gold.players[0].currentGold, 0);
  assert.equal(gold.players[0].board[0]?.currentAttack, 7);
  assert.equal(gold.players[0].board[0]?.currentHealth, 7);
});

 test('현재 손패 전용 도금구슬 문구는 덱과 비용 5 이하 카드를 할인하지 않는다', () => {
  const master=definition('도금구슬 마스터',{effects:[]},{rulesText:'등장:내 손에 있는 6 비용 이상의 카드들의 비용을 전부 1 감소 시킵니다.'});
  const high=definition('고비용',{effects:[]},{cost:6}); const low=definition('저비용',{effects:[]},{cost:5});
  const state=stateWithPool([master,high,low]); state.players[0].hand=[card(high,'high'),card(low,'low')];state.players[0].deck=[card(high,'deck')];
  const result=enterField(state,'player-1',card(master,'master'),0);
  assert.deepEqual(result.players[0].hand.map(c=>c.currentCost),[5,5]);assert.equal(result.players[0].deck[0].currentCost,6);
 });
 test('오젠은 토큰 플래그가 없는 챔피언 등급 선수도 제외한다',()=>{
  const ozen=definition('오젠',{effects:[]}); const champion=definition('챔피언 등급',{effects:[]},{cost:1,rarity:'CHAMPION',isChampionToken:false});
  const cheap=definition('대상',{effects:[]},{cost:1}); const state=stateWithPool([ozen,champion,cheap]);
  state.players[1].board[0]={...card(champion,'champion'),boardSlot:0};state.players[1].board[1]={...card(cheap,'cheap'),boardSlot:1};
  const result=enterField(state,'player-1',card(ozen,'ozen'),0);assert.equal(result.players[1].board[0]?.instanceId,'champion');assert.equal(result.players[1].board[1],null);
 });
