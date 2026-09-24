import assert from 'node:assert/strict';
import test from 'node:test';

import { generateCard } from '../cards/generation';
import type { CardDefinition, CardInstance } from '../cards/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { drawCard } from '../engine/draw-card';
import { enterField } from '../engine/enter-field';
import { playWrestlerFromHand } from '../engine/play-wrestler';
import { playTechniqueFromHand } from '../engine/play-technique';
import { useActiveAbility } from '../engine/card-status';
import { useChampionAbility } from '../engine/champion-system';
import { endTurn } from '../engine/turn-system';
import { applyEffect, getValidTargets, selectEffectTarget } from './effect-engine';
import type { CardEffect } from './types';

const targeted = (action: Extract<CardEffect, { type: 'STRUCTURED' }>['action'], owner: 'SELF' | 'ENEMY' = 'ENEMY', selection: 'PLAYER_CHOICE' | 'SELF' | 'RANDOM' | 'ALL' | 'SAME_TARGET' = 'PLAYER_CHOICE', count = 1): CardEffect =>
  ({ type: 'STRUCTURED', action, target: { zone: 'BOARD', owner, cardType: 'WRESTLER', selection, count }, values: { amount: 1 } });

function card(id: string, effects: CardEffect[] = [], tags: string[] = []): CardInstance {
  const definition: CardDefinition = { id, name: id, cardType: 'WRESTLER', cost: 1, attack: 1, health: 2, rulesText: '', isToken: false, isChampionToken: false, keywords: [], tags, abilities: [{ trigger: 'ENTER_FIELD', effects }] };
  return generateCard(definition, { instanceId: id, playerId: 'player-1', source: { type: 'PLAYER', playerId: 'player-1' }, reason: 'TEST' }).card;
}

function definitionFor(cardInstance: CardInstance): CardDefinition {
  return {
    id: cardInstance.definitionId,
    name: cardInstance.definitionId,
    cardType: cardInstance.cardType,
    cost: cardInstance.baseCost ?? cardInstance.currentCost,
    attack: cardInstance.baseAttack ?? cardInstance.currentAttack,
    health: cardInstance.baseHealth ?? cardInstance.maxHealth,
    rulesText: '',
    isToken: cardInstance.isToken,
    isChampionToken: cardInstance.isChampionToken,
    keywords: [],
    tags: cardInstance.tags ? [...cardInstance.tags] : [],
    abilities: [],
  };
}

test('PLAYER_CHOICE pauses post-enter damage, validates stale/invalid clicks, then resolves', () => {
  const source = card('source', [targeted('DAMAGE')]);
  const enemy = { ...card('enemy'), boardSlot: 0 as const };
  const state = createInitialGameState();
  state.players[1].board[0] = enemy;
  const pending = enterField(state, 'player-1', source, 0);
  assert.deepEqual(pending.targetingState?.validTargetIds, ['enemy']);
  assert.equal(pending.players[1].board[0]?.currentHealth, 2);
  assert.equal(selectEffectTarget(pending, 'not-a-target'), pending);
  const stale = { ...pending, players: pending.players.map((p, i) => i === 1 ? { ...p, board: [null, null, null, null] as typeof p.board } : p) };
  assert.equal(selectEffectTarget(stale, 'enemy'), stale);
  const resolved = selectEffectTarget(pending, 'enemy');
  assert.equal(resolved.targetingState, undefined);
  assert.equal(resolved.players[1].board[0]?.currentHealth, 1);
});

test('mandatory Technique PLAYER_CHOICE preflights before payment when no target exists', () => {
  const definition: CardDefinition = {
    id: 'targeted-technique',
    name: 'targeted-technique',
    cardType: 'TECHNIQUE',
    cost: 1,
    attack: 0,
    health: 0,
    rulesText: '',
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [{ trigger: 'ACTIVE', effects: [targeted('DAMAGE')] }],
  };
  const technique = generateCard(definition, {
    instanceId: 'targeted-technique',
    playerId: 'player-1',
    source: { type: 'PLAYER', playerId: 'player-1' },
    reason: 'TEST',
  }).card;
  const state = createInitialGameState();
  state.players[0].hand = [technique];
  state.players[0].currentGold = 3;
  const result = playTechniqueFromHand(state, 'player-1', technique.instanceId);
  assert.equal(result.success, false);
  assert.equal(result.state, state);
  assert.equal(result.state.players[0].currentGold, 3);
  assert.equal(result.state.players[0].hand[0]?.instanceId, technique.instanceId);
});

test('SAME_TARGET uses one click; SELF, RANDOM and ALL never open targeting', () => {
  const enemyA = { ...card('a'), boardSlot: 0 as const };
  const enemyB = { ...card('b'), boardSlot: 1 as const };
  const state = createInitialGameState();
  state.players[1].board[0] = enemyA; state.players[1].board[1] = enemyB;
  const combo = card('combo', [targeted('SILENCE'), targeted('DESTROY', 'ENEMY', 'SAME_TARGET')]);
  const done = selectEffectTarget(enterField(state, 'player-1', combo, 0), 'a');
  assert.equal(done.players[1].board[0], null);
  assert.equal(done.players[1].graveyard.some((entry) => entry.instanceId === 'a'), false);
  assert.equal(
    done.events.some(
      (event) =>
        event.type === 'CARD_RETIRED' &&
        event.cardInstanceId === 'a',
    ),
    false,
  );
  assert.equal(
    done.events.some(
      (event) =>
        event.type === 'CARD_DESTROYED' &&
        event.cardInstanceId === 'a',
    ),
    true,
  );
  assert.equal(enterField(createInitialGameState(), 'player-1', card('self', [targeted('BUFF', 'SELF', 'SELF')]), 0).targetingState, undefined);
  assert.equal(enterField(state, 'player-1', card('random', [targeted('DAMAGE', 'ENEMY', 'RANDOM')]), 2).targetingState, undefined);
  const all = enterField(state, 'player-1', card('all', [targeted('DAMAGE', 'ENEMY', 'ALL')]), 2);
  assert.equal(all.targetingState, undefined);
  assert.equal(all.players[1].board.filter(Boolean).every((c) => c!.currentHealth === 1), true);
});

test('resolver covers board, hand/player ids, multiselect duplicates and champion token protection', () => {
  const source = card('source');
  const one = { ...card('one'), boardSlot: 0 as const };
  const two = { ...card('two'), boardSlot: 1 as const };
  const state = createInitialGameState();
  state.players[0].board[0] = one; state.players[1].board[0] = two;
  state.players[0].hand = [card('hand')];
  assert.deepEqual(getValidTargets(state, 'player-1', source, targeted('BUFF', 'SELF')), ['one']);
  assert.deepEqual(getValidTargets(state, 'player-1', source, { ...targeted('REDUCE_COST', 'SELF'), target: { zone: 'HAND', owner: 'SELF', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1 } }), ['hand']);
  assert.deepEqual(getValidTargets(state, 'player-1', source, { ...targeted('DAMAGE'), target: { zone: 'PLAYER', owner: 'ENEMY', selection: 'PLAYER_CHOICE', count: 1 } }), ['player-2']);
  state.players[1].board[1] = { ...card('token'), boardSlot: 1, isDirectDeployedChampion: true, isSilenceImmune: true };
  assert.deepEqual(getValidTargets(state, 'player-1', source, targeted('DESTROY')), ['two']);
  assert.deepEqual(getValidTargets(state, 'player-1', source, targeted('DAMAGE')).sort(), ['token', 'two']);
  assert.deepEqual(getValidTargets(state, 'player-1', source, targeted('REMOVE_FROM_GAME')), ['two']);

  const multi = card('multi', [{ ...targeted('STUN'), target: { zone: 'BOARD', owner: 'ENEMY', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 2, minTargets: 2, maxTargets: 2 } }]);
  const multiPending = enterField(state, 'player-1', multi, 2);
  const first = selectEffectTarget(multiPending, 'two');
  assert.deepEqual(first.targetingState?.selectedTargetIds, ['two']);
  assert.equal(selectEffectTarget(first, 'two'), first);
  const multiDone = selectEffectTarget(first, 'token');
  assert.equal(multiDone.targetingState, undefined);
});

test('tag filters compose with zone, owner, and card type without hardcoded tag names', () => {
  const source = card('tag-filter-source');
  const allyBoard = { ...card('ally-board', [], ['용병', '인간']), boardSlot: 0 as const };
  const allyUntagged = { ...card('ally-untagged'), boardSlot: 1 as const };
  const allyTechnique = { ...card('ally-technique', [], ['용병']), cardType: 'TECHNIQUE' as const, boardSlot: 2 as const };
  const allyHand = card('ally-hand', [], ['용병']);
  const generatedToken = { ...card('generated-token', [], ['용병']), isGenerated: true, isToken: true };
  const enemyBoard = { ...card('enemy-board', [], ['용병']), boardSlot: 0 as const };
  const state = createInitialGameState();
  state.players[0].board[0] = allyBoard;
  state.players[0].board[1] = allyUntagged;
  state.players[0].board[2] = allyTechnique;
  state.players[0].hand = [allyHand];
  state.players[0].board[3] = generatedToken;
  state.players[1].board[0] = enemyBoard;
  state.cardPool = [
    allyBoard, allyUntagged, allyTechnique, allyHand, generatedToken, enemyBoard,
  ].map(definitionFor);

  const boardWrestlers = {
    type: 'STRUCTURED' as const,
    action: 'BUFF' as const,
    target: {
      zone: 'BOARD' as const,
      owner: 'SELF' as const,
      cardType: 'WRESTLER' as const,
      filter: { tagsAny: ['용병'] },
      selection: 'PLAYER_CHOICE' as const,
      count: 1,
    },
    values: { attack: 1, health: 1 },
  };
  assert.deepEqual(getValidTargets(state, 'player-1', source, boardWrestlers), ['ally-board', 'generated-token']);

  const handAll = {
    ...boardWrestlers,
    target: {
      zone: 'HAND' as const,
      owner: 'SELF' as const,
      filter: { tagsAny: ['용병'] },
      selection: 'PLAYER_CHOICE' as const,
      count: 1,
    },
  };
  assert.deepEqual(getValidTargets(state, 'player-1', source, handAll), ['ally-hand']);

  const allTags = {
    ...boardWrestlers,
    target: {
      ...boardWrestlers.target,
      filter: { tagsAll: ['용병', '인간'] },
    },
  };
  assert.deepEqual(getValidTargets(state, 'player-1', source, allTags), ['ally-board']);

  const noHumans = {
    ...boardWrestlers,
    target: {
      ...boardWrestlers.target,
      filter: { tagsNone: ['인간'] },
    },
  };
  assert.deepEqual(getValidTargets(state, 'player-1', source, noHumans), ['ally-untagged', 'generated-token']);
});

test('structured tag targets sort and take the highest matching card before applying', () => {
  const source = card('ordered-source');
  const low = { ...card('low-tagged', [], ['fighter']), currentAttack: 2, boardSlot: 0 as const };
  const high = { ...card('high-tagged', [], ['fighter']), currentAttack: 6, boardSlot: 1 as const };
  const state = createInitialGameState();
  state.players[0].board[0] = low;
  state.players[0].board[1] = high;
  state.cardPool = [source, low, high].map(definitionFor);
  const effect: CardEffect = {
    type: 'STRUCTURED',
    action: 'BUFF',
    target: {
      zone: 'BOARD',
      owner: 'SELF',
      cardType: 'WRESTLER',
      filter: { tagsAny: ['fighter'] },
      selection: 'PLAYER_CHOICE',
      count: 1,
      sort: { stat: 'ATTACK', direction: 'DESC' },
      take: 1,
    },
    values: { attack: 1, health: 0 },
  };
  const orderedSource = card('ordered-source', [effect]);
  assert.deepEqual(getValidTargets(state, 'player-1', source, effect), ['high-tagged']);
  const pending = enterField(state, 'player-1', orderedSource, 3);
  assert.deepEqual(pending.targetingState?.validTargetIds, ['high-tagged']);
  const resolved = selectEffectTarget(pending, 'high-tagged');
  assert.equal(resolved.players[0].board[0]?.currentAttack, 2);
  assert.equal(resolved.players[0].board[1]?.currentAttack, 7);
});

test('tag filters treat missing definition tags as empty but reject a missing definition', () => {
  const source = card('tag-none-source');
  const definitionWithoutTags = definitionFor(card('empty-tag-definition'));
  delete definitionWithoutTags.tags;
  const target = {
    ...card('empty-tag-target'),
    definitionId: definitionWithoutTags.id,
    tags: ['stale-instance-tag'],
    boardSlot: 0 as const,
  };
  const state = createInitialGameState();
  state.players[0].board[0] = target;
  state.cardPool = [definitionWithoutTags];
  const effect: CardEffect = {
    type: 'STRUCTURED',
    action: 'BUFF',
    target: {
      zone: 'BOARD',
      owner: 'SELF',
      filter: { tagsNone: ['실험체'] },
      selection: 'ALL',
      count: 20,
    },
    values: { attack: 1 },
  };

  assert.deepEqual(getValidTargets(state, 'player-1', source, effect), [target.instanceId]);
  assert.deepEqual(
    getValidTargets({ ...state, cardPool: [] }, 'player-1', source, effect),
    [],
  );
});

test('authoritative definition tags apply once across BOARD/HAND/DECK and survive JSON round-trip and play', () => {
  const source = card('authoritative-source');
  const taggedDefinition = definitionFor(card('authoritative-tagged', [], ['실험체']));
  const untaggedDefinition = definitionFor(card('authoritative-untagged'));
  const championDefinition = {
    ...taggedDefinition,
    id: 'authoritative-champion-token',
    name: 'authoritative-champion-token',
    isToken: true,
    isChampionToken: true,
  };
  const makeInstance = (id: string, definition: CardDefinition, staleTags: string[]) => ({
    ...generateCard(definition, {
      instanceId: id,
      playerId: 'player-1',
      source: { type: 'PLAYER' as const, playerId: 'player-1' },
      reason: 'TEST',
    }).card,
    tags: staleTags,
  });
  const board = { ...makeInstance('authoritative-board', taggedDefinition, []), boardSlot: 0 as const };
  const hand = makeInstance('authoritative-hand', taggedDefinition, ['다른태그']);
  const deck = makeInstance('authoritative-deck', taggedDefinition, []);
  const untagged = makeInstance('authoritative-untagged-instance', untaggedDefinition, ['실험체']);
  const champion = makeInstance('authoritative-champion', championDefinition, []);
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.cardPool = [definitionFor(source), taggedDefinition, untaggedDefinition, championDefinition];
  state.players[0].currentGold = 5;
  state.players[0].board[0] = board;
  state.players[0].hand = [hand];
  state.players[0].deck = [deck, untagged, champion];

  const effect: CardEffect = {
    type: 'STRUCTURED',
    action: 'BUFF',
    target: {
      zones: ['BOARD', 'HAND', 'DECK'],
      owner: 'SELF',
      cardType: 'WRESTLER',
      filter: { tagsAny: ['실험체'] },
      selection: 'ALL',
      count: 20,
    },
    values: { attack: 1, health: 1 },
  };
  const buffed = applyEffect(state, 'player-1', source, effect);
  assert.deepEqual(getValidTargets(state, 'player-1', source, effect).sort(), [
    'authoritative-board', 'authoritative-champion', 'authoritative-deck', 'authoritative-hand',
  ].sort());
  const withoutDefinitions = { ...state, cardPool: undefined };
  assert.deepEqual(getValidTargets(withoutDefinitions, 'player-1', source, effect), []);
  for (const cardInstance of [
    buffed.players[0].board[0],
    buffed.players[0].hand[0],
    buffed.players[0].deck[0],
  ]) {
    assert.equal(cardInstance?.currentAttack, 2);
    assert.equal(cardInstance?.currentHealth, 3);
  }
  assert.equal(buffed.players[0].deck[1]?.currentAttack, 1);
  assert.equal(buffed.players[0].deck[2]?.isChampionToken, true);
  assert.equal(buffed.players[0].deck[2]?.currentAttack, 2);

  const restored = structuredClone(buffed);
  const drawn = drawCard(restored, 'player-1');
  assert.equal(drawn.players[0].hand.find((entry) => entry.instanceId === 'authoritative-deck')?.currentAttack, 2);
  const played = playWrestlerFromHand(drawn, 'player-1', 'authoritative-deck', 1);
  assert.equal(played.success, true);
  if (played.success) {
    assert.equal(played.state.players[0].board[1]?.currentAttack, 2);
    assert.equal(played.state.players[0].board[1]?.currentHealth, 3);
  }
});

test('CHARACTER targeting offers the owner id and wrestlers, then applies player and card damage/healing separately', () => {
  const damageCharacter: CardEffect = {
    type: 'STRUCTURED', action: 'DAMAGE',
    target: { zone: 'CHARACTER', owner: 'ENEMY', selection: 'PLAYER_CHOICE', count: 1 },
    values: { amount: 1 },
  };
  const healCharacter: CardEffect = {
    type: 'STRUCTURED', action: 'HEAL',
    target: { zone: 'CHARACTER', owner: 'SELF', selection: 'PLAYER_CHOICE', count: 1 },
    values: { amount: 1 },
  };
  const silenceCharacter: CardEffect = {
    type: 'STRUCTURED', action: 'SILENCE',
    target: { zone: 'CHARACTER', owner: 'ENEMY', selection: 'PLAYER_CHOICE', count: 1 },
  };
  const source = card('source', [damageCharacter]);
  const enemy = { ...card('enemy'), boardSlot: 0 as const };
  const state = createInitialGameState();
  state.players[1].board[0] = enemy;
  assert.deepEqual(getValidTargets(state, 'player-1', source, damageCharacter), ['player-2', 'enemy']);
  assert.deepEqual(getValidTargets(state, 'player-1', source, silenceCharacter), ['enemy']);

  const championBefore = state.players[1].health;
  const championDamaged = selectEffectTarget(enterField(state, 'player-1', source, 0), 'player-2');
  assert.equal(championDamaged.players[1].health, championBefore - 1);
  const wrestlerDamaged = selectEffectTarget(enterField(state, 'player-1', source, 1), 'enemy');
  assert.equal(wrestlerDamaged.players[1].board[0]?.currentHealth, 1);

  const healer = card('healer', [healCharacter]);
  const ally = { ...card('ally'), boardSlot: 1 as const, currentHealth: 1 };
  const healingState = createInitialGameState();
  healingState.players[0].health = 19;
  healingState.players[0].champion = { ...healingState.players[0].champion!, health: 19 };
  healingState.players[0].board[1] = ally;
  assert.deepEqual(getValidTargets(healingState, 'player-1', healer, healCharacter), ['player-1', 'ally']);
  const championHealed = selectEffectTarget(enterField(healingState, 'player-1', healer, 0), 'player-1');
  assert.equal(championHealed.players[0].health, 20);
  const wrestlerHealed = selectEffectTarget(enterField(healingState, 'player-1', healer, 2), 'ally');
  assert.equal(wrestlerHealed.players[0].board[1]?.currentHealth, 2);
});

test('generic CHARACTER damage includes a champion and wrestlers, but protected champions are excluded', () => {
  const genericDamage: CardEffect = {
    type: 'STRUCTURED', action: 'DAMAGE',
    target: { zone: 'CHARACTER', owner: 'ENEMY', selection: 'PLAYER_CHOICE', count: 1 },
    values: { amount: 1 },
  };
  const source = card('generic-source');
  const enemy = { ...card('generic-enemy'), boardSlot: 0 as const };
  const protectedChampion = { ...card('protected-champion'), boardSlot: 1 as const, isDirectDeployedChampion: true };
  const state = createInitialGameState();
  state.players[1].board[0] = enemy;
  state.players[1].board[1] = protectedChampion;

  assert.deepEqual(
    getValidTargets(state, 'player-1', source, genericDamage).sort(),
    ['generic-enemy', 'protected-champion'].sort(),
  );
  assert.deepEqual(
    getValidTargets(state, 'player-1', source, {
      ...genericDamage,
      target: { ...genericDamage.target!, cardType: 'WRESTLER' },
    }),
    ['generic-enemy', 'protected-champion'],
  );
});

test('a triggered PLAYER_CHOICE with no candidates resolves without leaving targeting stuck', () => {
  const source = card('no-candidate-trigger', [targeted('DESTROY')]);
  const state = createInitialGameState();
  const result = enterField(state, 'player-1', source, 0);

  assert.equal(result.targetingState, undefined);
  assert.equal(result.players[0].board[0]?.instanceId, source.instanceId);
});

test('ALL CHARACTER resolves both champions and every eligible wrestler without targeting', () => {
  const allDamage: CardEffect = {
    type: 'STRUCTURED', action: 'DAMAGE',
    target: { zone: 'CHARACTER', owner: 'ALL', selection: 'ALL', count: 20 },
    values: { amount: 1 },
  };
  const allHeal: CardEffect = {
    type: 'STRUCTURED', action: 'HEAL',
    target: { zone: 'CHARACTER', owner: 'ALL', selection: 'ALL', count: 20 },
    values: { amount: 1 },
  };
  const source = card('source', [allDamage]);
  const ally = { ...card('ally'), boardSlot: 1 as const, currentHealth: 1 };
  const enemy = { ...card('enemy'), boardSlot: 0 as const, currentHealth: 1 };
  const state = createInitialGameState();
  state.players[0].health = 19;
  state.players[0].champion = { ...state.players[0].champion!, health: 19 };
  state.players[1].health = 19;
  state.players[1].champion = { ...state.players[1].champion!, health: 19 };
  state.players[0].board[1] = ally; state.players[1].board[0] = enemy;
  assert.deepEqual(getValidTargets(state, 'player-1', source, allDamage).sort(), ['ally', 'enemy', 'player-1', 'player-2'].sort());
  const damaged = enterField(state, 'player-1', source, 0);
  assert.equal(damaged.targetingState, undefined);
  assert.equal(damaged.players[0].health, 18);
  assert.equal(damaged.players[1].health, 18);
  assert.equal(damaged.players[0].board[0]?.currentHealth, 1);
  assert.equal(damaged.players[0].board[1], null);
  assert.equal(damaged.players[1].board[0], null);

  const healer = card('healer', [allHeal]);
  const healed = enterField(state, 'player-1', healer, 0);
  assert.equal(healed.targetingState, undefined);
  assert.equal(healed.players[0].health, 20);
  assert.equal(healed.players[1].health, 20);
  assert.equal(healed.players[0].board[0]?.currentHealth, 2);
  assert.equal(healed.players[0].board[1]?.currentHealth, 2);
  assert.equal(healed.players[1].board[0]?.currentHealth, 2);
});

test('ALL CHARACTER card-only actions affect wrestlers but never player ids', () => {
  const silenceAll: CardEffect = {
    type: 'STRUCTURED', action: 'SILENCE',
    target: { zone: 'CHARACTER', owner: 'ALL', selection: 'ALL', count: 20 },
  };
  const source = card('source', [silenceAll]);
  const enemy = { ...card('enemy'), boardSlot: 0 as const };
  const championToken = { ...card('champion'), boardSlot: 1 as const, isDirectDeployedChampion: true };
  const state = createInitialGameState();
  state.players[1].board[0] = enemy; state.players[1].board[1] = championToken;
  assert.deepEqual(getValidTargets(state, 'player-1', source, silenceAll), ['enemy']);
  const resolved = enterField(state, 'player-1', source, 0);
  assert.equal(resolved.players[0].health, state.players[0].health);
  assert.equal(resolved.players[1].health, state.players[1].health);
  assert.equal(resolved.players[0].board[0]?.isSilenced, true);
  assert.equal(resolved.players[1].board[0]?.isSilenced, true);
  assert.equal(resolved.players[1].board[1]?.isSilenced, false);
});

test('pending targeting blocks end turn with the exact warning', () => {
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS'; state.activePlayerId = 'player-1';
  state.players[1].board[0] = { ...card('enemy'), boardSlot: 0 };
  const pending = enterField(state, 'player-1', card('source', [targeted('DAMAGE')]), 0);
  const result = endTurn(pending, 'player-1');
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.message, '먼저 대상을 선택하세요.');
});

test('ALL BOARD WRESTLERS targeting includes both players but excludes both Champions', () => {
  const pandoraEffect: CardEffect = {
    type: 'STRUCTURED',
    action: 'DAMAGE',
    target: {
      zone: 'BOARD',
      owner: 'ALL',
      cardType: 'WRESTLER',
      selection: 'PLAYER_CHOICE',
      count: 1,
    },
    values: { amount: 1 },
  };
  const source = card('pandora', [pandoraEffect]);
  const state = createInitialGameState();
  state.players[0].board[0] = { ...card('ally-wrestler'), boardSlot: 0 };
  state.players[1].board[0] = { ...card('enemy-wrestler'), boardSlot: 0 };

  assert.deepEqual(
    getValidTargets(state, 'player-1', source, pandoraEffect).sort(),
    ['ally-wrestler', 'enemy-wrestler'],
  );

  const allyDamage = selectEffectTarget(
    enterField(state, 'player-1', source, 1),
    'ally-wrestler',
  );
  assert.equal(allyDamage.players[0].board[0]?.currentHealth, 1);
  assert.equal(allyDamage.players[1].board[0]?.currentHealth, 2);

  const enemyDamage = selectEffectTarget(
    enterField(state, 'player-1', source, 1),
    'enemy-wrestler',
  );
  assert.equal(enemyDamage.players[0].board[0]?.currentHealth, 2);
  assert.equal(enemyDamage.players[1].board[0]?.currentHealth, 1);
});

test('mandatory ENTER_FIELD choice with no targets skips and commits the play', () => {
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS'; state.activePlayerId = 'player-1';
  state.players[0].currentGold = 5;
  const source = card('no-target', [targeted('DESTROY')]);
  state.players[0].hand = [source];
  const result = playWrestlerFromHand(state, 'player-1', source.instanceId, 0);
  assert.equal(result.success, true);
  assert.equal(result.state.players[0].currentGold, 4);
  assert.equal(result.state.players[0].hand.length, 0);
  assert.equal(result.state.players[0].board[0]?.instanceId, source.instanceId);
  assert.equal(result.state.targetingState, undefined);
});

test('active and champion abilities use pending effects once, with payment/use timing', () => {
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS'; state.activePlayerId = 'player-1';
  const enemy = { ...card('enemy'), boardSlot: 0 as const };
  const active = { ...card('active'), boardSlot: 0 as const, abilities: [{ trigger: 'ACTIVE' as const, effects: [targeted('DAMAGE')] }] };
  state.players[0].board[0] = active; state.players[1].board[0] = enemy;
  const activeStart = useActiveAbility(state, 'player-1', 'active');
  assert.equal(activeStart.success, true);
  if (!activeStart.success) return;
  assert.ok(activeStart.state.targetingState);
  assert.equal(activeStart.state.players[0].board[0]?.activeUsedThisTurn, false);
  const activeDone = selectEffectTarget(activeStart.state, 'enemy');
  assert.equal(activeDone.players[0].board[0]?.activeUsedThisTurn, true);

  const championState = createInitialGameState();
  championState.status = 'IN_PROGRESS'; championState.activePlayerId = 'player-1';
  championState.players[0].currentGold = 5;
  championState.players[1].board[0] = { ...card('champion-enemy'), boardSlot: 0 };
  const champion = championState.players[0].champion!;
  championState.players[0].champion = { ...champion, abilityCost: 2, ability: { ...champion.ability, effects: [targeted('DAMAGE')] } };
  const championStart = useChampionAbility(championState, 'player-1');
  assert.equal(championStart.success, true);
  if (!championStart.success) return;
  assert.equal(championStart.state.players[0].currentGold, 3);
  const championDone = selectEffectTarget(championStart.state, 'champion-enemy');
  assert.equal(championDone.players[0].currentGold, 3);
  assert.equal(championDone.players[1].board[0]?.currentHealth, 1);
});