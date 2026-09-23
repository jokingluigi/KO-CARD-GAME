import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardDefinition, CardInstance } from '../cards/types';
import { generateCard } from '../cards/generation';
import { getActiveCardAbilities, getActiveCardKeywords, isVanillaCard } from '../cards/granted-text';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { silenceCard } from '../engine/card-status';
import { selectEffectTarget, applyEffect, resolveTriggeredAbilities } from './effect-engine';
import type { CardEffect } from './types';

function definition(
  id: string,
  abilities: CardDefinition['abilities'] = [],
  keywords: CardDefinition['keywords'] = [],
  rulesText = '',
): CardDefinition {
  return {
    id,
    name: id,
    cardType: 'WRESTLER',
    cost: 1,
    attack: 1,
    health: 3,
    rulesText,
    status: 'PUBLISHED',
    isToken: false,
    isChampionToken: false,
    keywords,
    abilities,
  };
}

function instance(cardDefinition: CardDefinition, id = `${cardDefinition.id}-instance`): CardInstance {
  return generateCard(cardDefinition, {
    instanceId: id,
    playerId: 'player-1',
    source: { type: 'PLAYER', playerId: 'player-1' },
    reason: 'TEST',
  }).card;
}

function stateWithPool(pool: CardDefinition[], recipient: CardInstance, enemy?: CardInstance) {
  const boardRecipient = { ...recipient, boardSlot: 0 as const };
  const state = createInitialGameState(
    ['test-champion-quest', 'test-champion-no-quest'],
    pool,
    undefined,
    undefined,
    { randomSeed: 42 },
  );
  return {
    ...state,
    status: 'IN_PROGRESS' as const,
    activePlayerId: 'player-1',
    players: state.players.map((player, index) => index === 0
      ? { ...player, board: [boardRecipient, null, null, null] as typeof player.board }
      : { ...player, board: [enemy ?? null, null, null, null] as typeof player.board }),
  };
}

function grantEffect(selection: 'SELF' | 'ALL' = 'SELF'): CardEffect {
  return {
    type: 'STRUCTURED',
    action: 'GRANT_RANDOM_CARD_TEXT',
    target: {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      selection,
      count: selection === 'SELF' ? 1 : 20,
      filter: { isVanilla: true },
    },
  };
}

test('printed and silenced vanilla cards are targetable, while active text and keywords are not', () => {
  const printedVanilla = instance(definition('printed-vanilla'));
  const active = instance(definition('active', [{
    trigger: 'TURN_END',
    effects: [{ type: 'GAIN_GOLD', amount: 1 }],
  }]));
  const keyword = instance(definition('keyword', [], ['TAUNT']));
  const silencedSource = instance(definition('printed-effect', [{
    trigger: 'TURN_START',
    effects: [{ type: 'GAIN_GOLD', amount: 1 }],
  }], ['TAUNT']));
  const silencedState = stateWithPool([definition('donor', [], ['RUSH'])], silencedSource);
  const silenced = silenceCard(silencedState, silencedSource.instanceId);
  const silencedCard = silenced.players[0].board[0]!;

  assert.equal(isVanillaCard(printedVanilla), true);
  assert.equal(isVanillaCard(active), false);
  assert.equal(isVanillaCard(keyword), false);
  assert.equal(isVanillaCard(silencedCard), true);
  assert.equal(getActiveCardAbilities(silencedCard).length, 0);
  assert.deepEqual(getActiveCardKeywords(silencedCard), []);
});

test('grants executable existing text from the authoritative pool and rebinds SELF', () => {
  const donor = definition('donor-self', [{
    trigger: 'TURN_END',
    effects: [{
      type: 'STRUCTURED',
      action: 'BUFF',
      target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
      values: { attack: 1, health: 1 },
    }],
  }], [], '턴 종료: 자신에게 +1/+1');
  const recipient = instance(definition('recipient'));
  const result = applyEffect(
    stateWithPool([definition('recipient'), donor], recipient),
    'player-1',
    recipient,
    grantEffect(),
  );
  const granted = result.players[0].board[0]!;
  assert.equal(granted.grantedText?.donorDefinitionId, donor.id);
  assert.equal(granted.currentAttack, 1);
  const afterTurnEnd = resolveTriggeredAbilities(result, 'player-1', granted, 'TURN_END');
  assert.equal(afterTurnEnd.players[0].board[0]?.currentAttack, 2);
  assert.equal(afterTurnEnd.players[0].board[0]?.currentHealth, 4);
  assert.equal(afterTurnEnd.events.some((event) => event.type === 'CARD_PLAYED'), false);
});

test('synthetic ENTER_FIELD runs only the newly granted entry clause', () => {
  const donor = definition('donor-enter', [{
    trigger: 'ENTER_FIELD',
    effects: [{
      type: 'STRUCTURED',
      action: 'DRAW',
      values: { amount: 1 },
    }],
  }], [], '등장: 카드 1장을 뽑습니다.');
  const recipient = instance(definition('recipient'));
  const drawCard = instance(definition('draw-card'));
  const state = stateWithPool([definition('recipient'), donor, drawCard], recipient);
  state.players[0].deck = [drawCard];
  const result = applyEffect(state, 'player-1', recipient, grantEffect());
  assert.equal(result.players[0].hand.length, 1);
  assert.equal(result.events.filter((event) => event.type === 'CARD_PLAYED').length, 0);
  assert.equal(result.events.filter((event) => event.type === 'ENTER_FIELD').length, 0);
  assert.equal(result.events.filter((event) => event.type === 'CARD_TEXT_GRANTED').length, 1);
});

test('a granted PLAYER_CHOICE effect uses the existing continuation and no target leaves no stale choice', () => {
  const donor = definition('donor-choice', [{
    trigger: 'ENTER_FIELD',
    effects: [{
      type: 'STRUCTURED',
      action: 'DAMAGE',
      target: { zone: 'BOARD', owner: 'ENEMY', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1 },
      values: { amount: 1 },
    }],
  }], [], '등장: 적 선수에게 피해 1');
  const recipient = instance(definition('recipient'));
  const enemy = { ...instance(definition('enemy')), boardSlot: 0 as const };
  const pending = applyEffect(
    stateWithPool([definition('recipient'), donor, definition('enemy')], recipient, enemy),
    'player-1',
    recipient,
    grantEffect(),
  );
  assert.deepEqual(pending.targetingState?.validTargetIds, [enemy.instanceId]);
  const resolved = selectEffectTarget(pending, enemy.instanceId);
  assert.equal(resolved.targetingState, undefined);
  assert.equal(resolved.players[1].board[0]?.currentHealth, 2);

  const noTarget = applyEffect(
    stateWithPool([definition('recipient'), donor], instance(definition('recipient'))),
    'player-1',
    instance(definition('recipient')),
    grantEffect(),
  );
  assert.equal(noTarget.targetingState, undefined);
  assert.equal(noTarget.players[0].board[0]?.grantedText?.donorDefinitionId, donor.id);
});

test('the same seed and match snapshot select the same donor without Math.random', () => {
  const donors = [
    definition('donor-a', [], ['TAUNT']),
    definition('donor-b', [], ['RUSH']),
    definition('donor-c', [{
      trigger: 'TURN_END',
      effects: [{ type: 'GAIN_GOLD', amount: 1 }],
    }]),
  ];
  const recipient = instance(definition('recipient'));
  const first = applyEffect(
    stateWithPool([definition('recipient'), ...donors], recipient),
    'player-1',
    recipient,
    grantEffect(),
  );
  const secondRecipient = instance(definition('recipient'));
  const second = applyEffect(
    stateWithPool([definition('recipient'), ...donors], secondRecipient),
    'player-1',
    secondRecipient,
    grantEffect(),
  );
  assert.equal(
    first.players[0].board[0]?.grantedText?.donorDefinitionId,
    second.players[0].board[0]?.grantedText?.donorDefinitionId,
  );
  const roundTripped = JSON.parse(JSON.stringify(first.players[0].board[0]));
  assert.deepEqual(roundTripped.grantedText, first.players[0].board[0]?.grantedText);
});

test('silence removes the granted layer without restoring printed text', () => {
  const printed = definition('printed', [{
    trigger: 'TURN_END',
    effects: [{ type: 'GAIN_GOLD', amount: 1 }],
  }], ['TAUNT']);
  const donor = definition('donor', [], ['RUSH']);
  const recipient = instance(printed);
  const grantedState = applyEffect(
    stateWithPool([printed, donor], recipient),
    'player-1',
    recipient,
    grantEffect(),
  );
  const silenced = silenceCard(grantedState, recipient.instanceId);
  const card = silenced.players[0].board[0]!;
  assert.equal(card.grantedText, undefined);
  assert.equal(isVanillaCard(card), true);
  assert.deepEqual(getActiveCardKeywords(card), []);
  assert.equal(resolveTriggeredAbilities(silenced, 'player-1', card, 'TURN_END'), silenced);
});