import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardDefinition, CardInstance } from '../cards/types';
import { generateCardInstance } from '../cards/generation';
import { cardRecordToDefinition } from '../cards/published-cards';
import type { PublishedCardRecord } from '../cards/published-cards';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { destroyCard } from '../engine/destroy-card';
import { enterField } from '../engine/enter-field';
import { attack } from '../engine/combat';
import { endTurn } from '../engine/turn-system';
import { directDeployChampionToken } from '../engine/champion-token';
import { playTechniqueFromHand } from '../engine/play-technique';
import { playWrestlerFromHand } from '../engine/play-wrestler';
import { selectEffectTarget } from './effect-engine';

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
  '디 오리진': { effects: [effect('ENTER_FIELD', 'BUFF', boardSelf, { amountReference: 'GRAVEYARD_WRESTLER_COUNT' })] },
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
    text: '',
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
  assert.equal(afterInvalid.targetingState?.validTargetIds.includes('invalid-technique'), false);
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
  assert.equal(withOrigin.players[0].board[0]?.currentAttack, 2);
  assert.equal(withOrigin.players[0].board[0]?.currentHealth, 2);

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
  assert.equal(retired.state.players[0].hand[0]?.currentCost, 3);

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