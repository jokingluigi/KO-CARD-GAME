import assert from 'node:assert/strict';
import test from 'node:test';

import { executeAction, getLegalActions } from './engine-actions';
import { cancelEffectTargeting } from '../effects/effect-engine';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { generateCardInstance } from '../cards/generation';
import type { CardDefinition } from '../cards/types';
import type { GameState } from '../types/game-state';

const technique: CardDefinition = {
  id: 'precommit-technique',
  name: 'precommit-technique',
  cardType: 'TECHNIQUE',
  cost: 2,
  attack: 0,
  health: 0,
  rulesText: '',
  isToken: false,
  isChampionToken: false,
  keywords: [],
  abilities: [{
    trigger: 'ACTIVE',
    effects: [{
      type: 'STRUCTURED',
      action: 'DAMAGE',
      target: { zone: 'BOARD', owner: 'ENEMY', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1 },
      values: { amount: 1 },
    }],
  }],
};

function playableState() {
  const state = createInitialGameState(undefined, [technique]);
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.players[0].currentGold = 3;
  state.players[0].hand = [generateCardInstance(technique, { instanceId: 'technique-1' })];
  state.players[1].board[0] = generateCardInstance({
    id: 'enemy', name: 'enemy', cardType: 'WRESTLER', cost: 1, attack: 1, health: 2,
    rulesText: '', isToken: false, isChampionToken: false, keywords: [], abilities: [],
  }, { instanceId: 'enemy-1' });
  return state;
}

function choiceDamageEffect() {
  return {
    type: 'STRUCTURED' as const,
    action: 'DAMAGE' as const,
    target: {
      zone: 'BOARD' as const,
      owner: 'ENEMY' as const,
      cardType: 'WRESTLER' as const,
      selection: 'PLAYER_CHOICE' as const,
      count: 1,
    },
    values: { amount: 1 },
  };
}

function optionalChoiceDamageEffect() {
  const effect = choiceDamageEffect();
  return {
    ...effect,
    target: {
      ...effect.target,
      minTargets: 0,
      maxTargets: 1,
      optionalTarget: true,
    },
  };
}

function addStructuredGoldEffect(amount: number) {
  return {
    type: 'STRUCTURED' as const,
    action: 'ADD_GOLD' as const,
    values: { amount },
  };
}

function targetedEntryWrestler(): CardDefinition {
  return {
    id: 'postcommit-entry-wrestler',
    name: 'postcommit-entry-wrestler',
    cardType: 'WRESTLER',
    cost: 1,
    attack: 1,
    health: 2,
    rulesText: '',
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [{ trigger: 'ENTER_FIELD', effects: [choiceDamageEffect()] }],
  };
}

test('technique PRE_COMMIT probes a clone, cancel is canonical no-op, confirm commits once', () => {
  const state = playableState();
  const canonical = structuredClone(state);
  const invalidBegin = executeAction(state, {
    type: 'BEGIN_TARGETED_ACTION',
    playerId: 'player-1',
    action: { type: 'PLAY_TECHNIQUE', cardInstanceId: 'missing-technique' },
  });
  assert.equal(invalidBegin.success, false);
  if (!invalidBegin.success) assert.equal(invalidBegin.errorCode, 'CARD_NOT_IN_HAND');

  const begun = executeAction(state, {
    type: 'BEGIN_TARGETED_ACTION', playerId: 'player-1',
    action: { type: 'PLAY_TECHNIQUE', cardInstanceId: 'technique-1' },
  });
  assert.equal(begun.success, true);
  assert.deepEqual(state, canonical);
  assert.equal(begun.state.players[0].currentGold, 3);
  assert.equal(begun.state.players[0].hand.length, 1);
  assert.equal(begun.state.targetingState?.phase, 'PRE_COMMIT');
  assert.ok(getLegalActions(begun.state, 'player-1').some((action) => action.type === 'CANCEL_EFFECT_TARGET'));
  const prematureSelection = executeAction(begun.state, {
    type: 'SELECT_EFFECT_TARGET',
    playerId: 'player-1',
    targetId: 'enemy-1',
  });
  assert.equal(prematureSelection.success, false);
  if (!prematureSelection.success) assert.equal(prematureSelection.errorCode, 'TARGET_SELECTION_PENDING');
  assert.equal(prematureSelection.state, begun.state);

  const cancelled = executeAction(begun.state, { type: 'CANCEL_EFFECT_TARGET', playerId: 'player-1' });
  assert.deepEqual({ ...cancelled.state, targetingState: undefined }, { ...state, targetingState: undefined });
  const retry = executeAction(cancelled.state, {
    type: 'BEGIN_TARGETED_ACTION', playerId: 'player-1',
    action: { type: 'PLAY_TECHNIQUE', cardInstanceId: 'technique-1' },
  });
  const confirmed = executeAction(retry.state, {
    type: 'CONFIRM_PRECOMMIT_TARGET', playerId: 'player-1', targetId: 'enemy-1',
  });
  assert.equal(confirmed.success, true);
  assert.equal(confirmed.state.players[0].currentGold, 1);
  assert.equal(confirmed.state.players[0].hand.length, 0);
  assert.equal(confirmed.state.players[0].graveyard.length, 1);
  assert.equal(confirmed.state.players[1].board[0]?.currentHealth, 1);
  assert.equal(confirmed.state.events.filter((event) => event.type === 'CARD_PLAYED').length, 1);
});

test('optional PRE_COMMIT cancel abandons the action and empty optional choices auto-skip', () => {
  const optionalTechnique: CardDefinition = {
    ...technique,
    id: 'optional-precommit-technique',
    abilities: [{
      trigger: 'ACTIVE',
      effects: [optionalChoiceDamageEffect(), addStructuredGoldEffect(1)],
    }],
  };
  const state = playableState();
  state.players[0].hand = [generateCardInstance(optionalTechnique, { instanceId: 'optional-technique' })];
  const begun = executeAction(state, {
    type: 'BEGIN_TARGETED_ACTION',
    playerId: 'player-1',
    action: { type: 'PLAY_TECHNIQUE', cardInstanceId: 'optional-technique' },
  });
  assert.equal(begun.success, true);
  assert.equal(begun.state.targetingState?.phase, 'PRE_COMMIT');
  assert.equal(begun.state.targetingState?.cancelable, true);

  const cancelled = executeAction(begun.state, {
    type: 'CANCEL_EFFECT_TARGET',
    playerId: 'player-1',
  });
  assert.deepEqual(
    { ...cancelled.state, targetingState: undefined },
    { ...state, targetingState: undefined },
  );

  const noTargetState = playableState();
  noTargetState.players[1] = { ...noTargetState.players[1], board: [null, null, null, null] };
  noTargetState.players[0].hand = [
    generateCardInstance(optionalTechnique, { instanceId: 'optional-no-target' }),
  ];
  const noTargetAction = executeAction(noTargetState, {
    type: 'BEGIN_TARGETED_ACTION',
    playerId: 'player-1',
    action: { type: 'PLAY_TECHNIQUE', cardInstanceId: 'optional-no-target' },
  });
  assert.equal(noTargetAction.success, true, JSON.stringify(noTargetAction));
  assert.equal(noTargetAction.state.targetingState, undefined);
  assert.equal(noTargetAction.state.players[0].currentGold, 2);
  assert.equal(noTargetAction.state.players[0].hand.length, 0);
  assert.equal(noTargetAction.state.players[0].graveyard.length, 1);
  assert.equal(
    getLegalActions(noTargetAction.state, 'player-1').some((action) => action.type === 'CANCEL_EFFECT_TARGET'),
    false,
  );
});

test('Champion Ability PRE_COMMIT cancel is a no-op and reconnect confirm commits once', () => {
  const state = playableState();
  const champion = state.players[0].champion!;
  state.players[0] = {
    ...state.players[0],
    currentGold: 3,
    champion: {
      ...champion,
      abilityCost: 2,
      ability: {
        ...champion.ability,
        id: 'targeted-champion-ability',
        effects: [choiceDamageEffect(), addStructuredGoldEffect(1)],
      },
      questProgress: 0,
      questCompleted: false,
      quest: {
        ...champion.quest!,
        trackedEvent: 'WRESTLER_RETIRED',
        cardType: 'WRESTLER',
        sourceActionType: 'USE_CHAMPION_ABILITY',
        requiredProgress: 5,
        progressPerEvent: 1,
        reward: { type: 'GAIN_GOLD', amount: 0 },
      },
    },
  };
  state.players[1] = {
    ...state.players[1],
    board: [{ ...state.players[1].board[0]!, currentHealth: 1 }, null, null, null],
  };
  const canonical = structuredClone(state);
  const begun = executeAction(state, {
    type: 'BEGIN_TARGETED_ACTION',
    playerId: 'player-1',
    action: { type: 'USE_CHAMPION_ABILITY' },
  });
  assert.equal(begun.success, true);
  assert.deepEqual(state, canonical);
  assert.equal(begun.state.players[0].currentGold, 3);
  assert.equal(begun.state.players[0].championAbilityUsedThisTurn, false);
  assert.equal(begun.state.players[0].champion?.questProgress, 0);
  assert.equal(begun.state.events.length, state.events.length);
  assert.equal(begun.state.targetingState?.phase, 'PRE_COMMIT');

  const cancelled = executeAction(begun.state, {
    type: 'CANCEL_EFFECT_TARGET',
    playerId: 'player-1',
  });
  assert.deepEqual(
    { ...cancelled.state, targetingState: undefined },
    { ...state, targetingState: undefined },
  );
  const repeatedCancel = executeAction(cancelled.state, {
    type: 'CANCEL_EFFECT_TARGET',
    playerId: 'player-1',
  });
  assert.deepEqual(repeatedCancel.state, cancelled.state);

  const retry = executeAction(cancelled.state, {
    type: 'BEGIN_TARGETED_ACTION',
    playerId: 'player-1',
    action: { type: 'USE_CHAMPION_ABILITY' },
  });
  const staleTargetState = JSON.parse(JSON.stringify(retry.state)) as GameState;
  staleTargetState.players[1] = {
    ...staleTargetState.players[1],
    board: [null, null, null, null],
  };
  const staleConfirm = executeAction(staleTargetState, {
    type: 'CONFIRM_PRECOMMIT_TARGET',
    playerId: 'player-1',
    targetId: 'enemy-1',
  });
  assert.equal(staleConfirm.success, false);
  if (!staleConfirm.success) assert.equal(staleConfirm.errorCode, 'NO_VALID_TARGET');
  assert.equal(staleConfirm.state, staleTargetState);
  assert.equal(staleConfirm.state.players[0].currentGold, 3);

  const reconnected = JSON.parse(JSON.stringify(retry.state)) as GameState;
  const confirmed = executeAction(reconnected, {
    type: 'CONFIRM_PRECOMMIT_TARGET',
    playerId: 'player-1',
    targetId: 'enemy-1',
  });
  assert.equal(confirmed.success, true);
  assert.equal(confirmed.state.players[0].currentGold, 2);
  assert.equal(confirmed.state.players[0].championAbilityUsedThisTurn, true);
  assert.equal(confirmed.state.players[0].champion?.questProgress, 1);
  assert.equal(confirmed.state.players[1].board[0], null);
  assert.equal(confirmed.state.events.filter((event) => event.type === 'CHAMPION_ABILITY_USED').length, 1);
  assert.equal(
    confirmed.state.events.filter((event) => event.type === 'CARD_RETIRED').length,
    1,
    JSON.stringify(confirmed.state.events.filter((event) => event.type === 'CARD_RETIRED')),
  );
  assert.equal(confirmed.state.events.filter((event) => event.type === 'CHAMPION_QUEST_PROGRESS').length, 1);
});

test('Active ability PRE_COMMIT cancel leaves use flag unset and confirm consumes it once', () => {
  const state = playableState();
  const activeCard: CardDefinition = {
    id: 'precommit-active',
    name: 'precommit-active',
    cardType: 'WRESTLER',
    cost: 1,
    attack: 1,
    health: 2,
    rulesText: '',
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [{ trigger: 'ACTIVE', effects: [choiceDamageEffect()] }],
  };
  const activeInstance = {
    ...generateCardInstance(activeCard, { instanceId: 'active-1' }),
    boardSlot: 0 as const,
  };
  state.players[0] = {
    ...state.players[0],
    board: [activeInstance, null, null, null],
  };
  const canonical = structuredClone(state);
  const begun = executeAction(state, {
    type: 'BEGIN_TARGETED_ACTION',
    playerId: 'player-1',
    action: { type: 'USE_ACTIVE', cardInstanceId: 'active-1' },
  });
  assert.equal(begun.success, true);
  assert.deepEqual(state, canonical);
  assert.equal(begun.state.players[0].board[0]?.activeUsedThisTurn, false);
  const cancelled = executeAction(begun.state, {
    type: 'CANCEL_EFFECT_TARGET',
    playerId: 'player-1',
  });
  assert.equal(cancelled.state.players[0].board[0]?.activeUsedThisTurn, false);
  const retry = executeAction(cancelled.state, {
    type: 'BEGIN_TARGETED_ACTION',
    playerId: 'player-1',
    action: { type: 'USE_ACTIVE', cardInstanceId: 'active-1' },
  });
  const confirmed = executeAction(retry.state, {
    type: 'CONFIRM_PRECOMMIT_TARGET',
    playerId: 'player-1',
    targetId: 'enemy-1',
  });
  assert.equal(confirmed.success, true);
  assert.equal(confirmed.state.players[0].board[0]?.activeUsedThisTurn, true);
  assert.equal(confirmed.state.players[1].board[0]?.currentHealth, 1);
});

test('post-commit ENTER_FIELD cancellation preserves the played card and payment', () => {
  const state = playableState();
  const wrestler = targetedEntryWrestler();
  state.players[0].hand = [generateCardInstance(wrestler, { instanceId: 'entry-1' })];
  const played = executeAction(state, {
    type: 'PLAY_WRESTLER',
    playerId: 'player-1',
    cardInstanceId: 'entry-1',
    boardSlot: 1,
  });
  assert.equal(played.success, true, JSON.stringify(played));
  assert.equal(played.state.targetingState?.phase, undefined);
  assert.equal(played.state.players[0].currentGold, 2);
  assert.equal(played.state.players[0].board[1]?.instanceId, 'entry-1');
  assert.equal(played.state.targetingState?.validTargetIds.includes('enemy-1'), true);

  const invalidSelection = executeAction(played.state, {
    type: 'SELECT_EFFECT_TARGET',
    playerId: 'player-1',
    targetId: 'missing-target',
  });
  assert.equal(invalidSelection.success, false);
  if (!invalidSelection.success) assert.equal(invalidSelection.errorCode, 'NO_VALID_TARGET');
  assert.equal(invalidSelection.state, played.state);

  const cancelled = executeAction(played.state, {
    type: 'CANCEL_EFFECT_TARGET',
    playerId: 'player-1',
  });
  assert.equal(cancelled.success, true);
  assert.equal(cancelled.state.targetingState, undefined);
  assert.equal(cancelled.state.players[0].currentGold, 2);
  assert.equal(cancelled.state.players[0].board[1]?.instanceId, 'entry-1');
  assert.equal(cancelled.state.players[1].board[0]?.currentHealth, 2);
  assert.equal(cancelled.state.events.filter((event) => event.type === 'CARD_PLAYED').length, 1);
});

test('zero-target ENTER_FIELD choice resolves as a no-op without opening cancel mode', () => {
  const state = playableState();
  state.players[1] = { ...state.players[1], board: [null, null, null, null] };
  state.players[0].hand = [generateCardInstance(targetedEntryWrestler(), { instanceId: 'entry-no-target' })];
  const played = executeAction(state, {
    type: 'PLAY_WRESTLER',
    playerId: 'player-1',
    cardInstanceId: 'entry-no-target',
    boardSlot: 1,
  });

  assert.equal(played.success, true, JSON.stringify(played));
  assert.equal(played.state.targetingState, undefined);
  assert.equal(played.state.players[0].currentGold, 2);
  assert.equal(played.state.players[0].board[1]?.instanceId, 'entry-no-target');
  assert.equal(
    getLegalActions(played.state, 'player-1').some((action) => action.type === 'CANCEL_EFFECT_TARGET'),
    false,
  );
});

test('mandatory and script cancellation clears only the authoritative continuation', () => {
  const state = playableState();
  const pending = {
    ...state,
    targetingState: {
      active: true as const, playerId: 'player-1', sourceInstanceId: 'enemy-1',
      effects: [], effectIndex: 0, selectedTargetIds: [], lastTargetIds: ['hidden'],
      validTargetIds: ['enemy-1'], minTargets: 1, maxTargets: 1, mandatory: true,
      cancelable: false, phase: 'POST_COMMIT' as const,
      scriptContinuation: { selectedResultId: 'x', remainingSteps: [], registers: {}, script: { steps: [] } },
    },
  };
  const cancelled = cancelEffectTargeting(pending);
  assert.equal(cancelled.targetingState, undefined);
  assert.equal(cancelled.players[0].currentGold, state.players[0].currentGold);
});