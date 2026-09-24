import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from '../cards/published-cards';
import { generateCardInstance } from '../cards/generation';
import type { CardDefinition, CardInstance } from '../cards/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { attack } from '../engine/combat';
import { endTurn } from '../engine/turn-system';
import { enterField } from '../engine/enter-field';
import { playWrestlerFromHand } from '../engine/play-wrestler';
import { applyEffect, resolveTriggeredAbilities, selectEffectTarget } from '../effects/effect-engine';
import type { GameState } from '../types/game-state';
import { getVisibleCardKeywords } from '../../lib/card-display-state';

const apiOrigin = process.env.KO_QA_API_ORIGIN ?? 'http://127.0.0.1:8080';
const response = await fetch(`${apiOrigin}/api/cards`);
if (!response.ok) throw new Error(`targeted card catalog request failed: ${response.status}`);
const records = ((await response.json()) as { cards?: PublishedCardRecord[] }).cards ?? [];
const definitions = records
  .filter((record) => record.status === 'PUBLISHED')
  .map(cardRecordToDefinition);

function definition(name: string): CardDefinition {
  const result = definitions.find((item) => item.name === name);
  assert.ok(result, `published definition missing: ${name}`);
  return result;
}

function card(cardDefinition: CardDefinition, instanceId: string): CardInstance {
  return generateCardInstance(cardDefinition, { instanceId, isGenerated: false });
}

function stateWithPool(): GameState {
  const state = createInitialGameState();
  state.status = 'IN_PROGRESS';
  state.activePlayerId = 'player-1';
  state.turn = 1;
  state.cardPool = definitions;
  state.players = state.players.map((player) => ({
    ...player,
    currentGold: 10,
    hand: [],
    deck: [],
    graveyard: [],
    board: [null, null, null, null],
  }));
  return state;
}

function statTriggerCard(instanceId: string): CardInstance {
  const statTriggerDefinition: CardDefinition = {
    id: 'qa-stat-trigger',
    name: 'QA stat trigger',
    cardType: 'WRESTLER',
    cost: 1,
    attack: 2,
    health: 4,
    rulesText: 'stat trigger',
    rarity: 'NORMAL',
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [{
      trigger: 'STAT_CHANGED',
      effects: [{ type: 'GAIN_GOLD', amount: 1 }],
    }],
  };
  return card(statTriggerDefinition, instanceId);
}

test('published 팬텀워커 keeps the generic RUSH keyword in its runtime display state', () => {
  const walker = definition('팬텀워커');
  assert.equal(walker.keywords.includes('RUSH'), true);
  const instance = card(walker, 'phantom-walker');
  assert.deepEqual(getVisibleCardKeywords(instance.keywords, instance.isSilenced, instance.dodgeCharges ?? 0), ['RUSH']);
});

function buffHandCard(
  state: GameState,
  target: CardInstance,
  values: { attack?: number; health?: number },
): GameState {
  const source = {
    ...target,
    abilities: [],
  };
  return applyEffect(state, 'player-1', source, {
    type: 'STRUCTURED',
    action: 'BUFF',
    target: { zone: 'HAND', owner: 'SELF', selection: 'SELF', count: 1 },
    values,
  });
}

test('authoritative 흑구슬마스터 PLAY_FROM_HAND creates target selection and destroys the chosen enemy', () => {
  const blackOrb = definition('흑구슬마스터');
  const enemyDefinition = definition('로드');
  const enemy = { ...card(enemyDefinition, 'black-orb-enemy'), boardSlot: 0 as const };
  const state = stateWithPool();
  state.players[0].hand = [card(blackOrb, 'black-orb-source')];
  state.players[1].board = [enemy, null, null, null];

  const played = playWrestlerFromHand(state, 'player-1', 'black-orb-source', 0);
  assert.equal(played.success, true);
  if (!played.success) return;
  assert.ok(played.state.events.some((event) =>
    event.type === 'CARD_PLAYED' && event.cardInstanceId === 'black-orb-source',
  ));
  assert.equal(played.state.targetingState?.active, true);
  assert.deepEqual(played.state.targetingState?.validTargetIds, [enemy.instanceId]);
  assert.equal(played.state.players[1].board[0]?.instanceId, enemy.instanceId);

  const resolved = selectEffectTarget(played.state, enemy.instanceId);
  assert.equal(resolved.targetingState, undefined);
  assert.equal(resolved.pendingCardEffects.length, 0);
  assert.equal(resolved.players[1].board[0], null);
  assert.equal(
    resolved.players[1].graveyard.some((item) => item.instanceId === enemy.instanceId),
    true,
  );
  assert.equal(
    resolved.events.some((event) =>
      event.type === 'CARD_RETIRED' && event.cardInstanceId === enemy.instanceId,
    ),
    true,
  );
});

test('generic stat-increase listeners trigger once for HAND attack and health increases', () => {
  const state = stateWithPool();
  const attackCard = statTriggerCard('hand-attack-trigger');
  const healthCard = statTriggerCard('hand-health-trigger');
  state.players[0].hand = [attackCard, healthCard];

  const afterAttack = buffHandCard(state, attackCard, { attack: 1 });
  assert.equal(afterAttack.players[0].currentGold, 11);
  assert.equal(afterAttack.players[0].hand[0]?.currentAttack, 3);

  const afterHealth = buffHandCard(afterAttack, healthCard, { health: 1 });
  assert.equal(afterHealth.players[0].currentGold, 12);
  assert.equal(afterHealth.players[0].hand[1]?.currentHealth, 5);
  assert.equal(afterHealth.players[0].hand[1]?.maxHealth, 5);
});

test('generic stat-increase listeners preserve FIELD behavior without duplicate or decrease triggers', () => {
  const state = stateWithPool();
  const fieldCard = { ...statTriggerCard('field-stat-trigger'), boardSlot: 0 as const };
  const handCard = statTriggerCard('hand-decrease-trigger');
  const unchangedCard = statTriggerCard('hand-unchanged-trigger');
  state.players[0].board = [fieldCard, null, null, null];
  state.players[0].hand = [handCard, unchangedCard];

  const afterFieldAttack = applyEffect(state, 'player-1', fieldCard, {
    type: 'STRUCTURED',
    action: 'BUFF',
    target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
    values: { attack: 1 },
  });
  assert.equal(afterFieldAttack.players[0].currentGold, 11);
  assert.equal(afterFieldAttack.players[0].board[0]?.currentAttack, 3);

  const afterDecrease = buffHandCard(afterFieldAttack, handCard, { attack: -1 });
  assert.equal(afterDecrease.players[0].currentGold, 11);
  assert.equal(afterDecrease.players[0].hand[0]?.currentAttack, 1);

  const afterUnchanged = buffHandCard(afterDecrease, unchangedCard, { attack: 0 });
  assert.equal(afterUnchanged.players[0].currentGold, 11);
  assert.equal(afterUnchanged.players[0].hand[1]?.currentAttack, 2);
});

test('ON_ENTER PLAYER_CHOICE with no valid targets skips only the effect and leaves play usable', () => {
  const blackOrb = definition('흑구슬마스터');
  const state = stateWithPool();
  state.players[0].hand = [
    card(blackOrb, 'black-orb-no-target'),
    card(definition('로드'), 'black-orb-follow-up'),
  ];

  const played = playWrestlerFromHand(state, 'player-1', 'black-orb-no-target', 0);
  assert.equal(played.success, true);
  if (!played.success) return;
  assert.equal(played.state.players[0].currentGold, 3);
  assert.equal(played.state.players[0].board[0]?.instanceId, 'black-orb-no-target');
  assert.equal(played.state.targetingState, undefined);
  assert.equal(played.state.pendingCardEffects.length, 0);

  const ended = endTurn(played.state, 'player-1');
  assert.equal(ended.success, true);
  if (!ended.success) return;

  const nextState = {
    ...ended.state,
    activePlayerId: 'player-2',
    players: ended.state.players.map((player) =>
      player.id === 'player-2'
        ? { ...player, hand: [card(definition('로드'), 'other-player-card')], currentGold: 10 }
        : player),
  };
  const playedAgain = playWrestlerFromHand(nextState, 'player-2', 'other-player-card', 0);
  assert.equal(playedAgain.success, true);
  if (playedAgain.success) {
    assert.equal(playedAgain.state.targetingState, undefined);
  }
});

test('흑구슬마스터 targeting rejects non-enemy targets and does not leave a stale frame', () => {
  const blackOrb = definition('흑구슬마스터');
  const allyDefinition = definition('로드');
  const enemyDefinition = definition('RM우디르');
  const state = stateWithPool();
  const ally = { ...card(allyDefinition, 'black-orb-ally'), boardSlot: 1 as const };
  const enemy = { ...card(enemyDefinition, 'black-orb-valid-enemy'), boardSlot: 0 as const };
  state.players[0].hand = [card(blackOrb, 'black-orb-source-invalid')];
  state.players[0].board = [null, ally, null, null];
  state.players[1].board = [enemy, null, null, null];

  const played = playWrestlerFromHand(state, 'player-1', 'black-orb-source-invalid', 0);
  assert.equal(played.success, true);
  if (!played.success) return;
  assert.equal(played.state.targetingState?.validTargetIds.includes(ally.instanceId), false);
  assert.equal(played.state.targetingState?.validTargetIds.includes(enemy.instanceId), true);

  const resolved = selectEffectTarget(played.state, enemy.instanceId);
  assert.equal(resolved.targetingState, undefined);
  assert.equal(resolved.players[0].board[1]?.instanceId, ally.instanceId);
  assert.equal(resolved.players[1].board[0], null);
});

test('흑구슬마스터 SUMMON and REVIVE do not auto-trigger its PLAY_FROM_HAND entrance effect', () => {
  const blackOrb = definition('흑구슬마스터');
  const enemyDefinition = definition('로드');

  for (const cause of ['SUMMON', 'REVIVE'] as const) {
    const state = stateWithPool();
    const enemy = { ...card(enemyDefinition, `black-orb-${cause.toLowerCase()}-enemy`), boardSlot: 0 as const };
    state.players[1].board = [enemy, null, null, null];

    const entered = enterField(
      state,
      'player-1',
      card(blackOrb, `black-orb-${cause.toLowerCase()}-source`),
      0,
      undefined,
      undefined,
      cause,
    );
    assert.equal(entered.targetingState, undefined, cause);
    assert.equal(entered.players[1].board[0]?.instanceId, enemy.instanceId, cause);
    assert.equal(entered.players[1].graveyard.length, 0, cause);
  }
});

test('조킹루이지 taunts only successfully generated adjacent wrestlers', () => {
  const joker = definition('조킹루이지');
  const effects = Array.isArray(joker.effectConfig.effects) ? joker.effectConfig.effects : [];
  assert.equal(effects.length, 2);
  assert.equal(joker.keywords.includes('TAUNT'), false);
  assert.equal(
    (effects[0] as { action?: string; target?: { selection?: string } } | undefined)?.action,
    'SUMMON',
  );
  assert.equal(
    (effects[0] as { action?: string; target?: { selection?: string } } | undefined)?.target?.selection,
    'ADJACENT_EMPTY_SLOTS',
  );
  assert.equal(
    (effects[1] as { action?: string; target?: { selection?: string } } | undefined)?.action,
    'ADD_KEYWORD',
  );
  assert.equal(
    (effects[1] as { action?: string; target?: { selection?: string } } | undefined)?.target?.selection,
    'SAME_TARGET',
  );

  const neutralDefinition: CardDefinition = {
    ...joker,
    id: 'qa-neutral-adjacent-wrestler',
    name: 'QA neutral adjacent wrestler',
    keywords: [],
    abilities: [],
    effectId: null,
    effectConfig: {},
  };
  const makeCard = (instanceId: string, boardSlot: 0 | 1 | 2 | 3): CardInstance => ({
    ...card(neutralDefinition, instanceId),
    boardSlot,
  });
  const scenarios: Array<{
    name: string;
    sourceSlot: 0 | 1 | 2 | 3;
    board: [CardInstance | null, CardInstance | null, CardInstance | null, CardInstance | null];
  }> = [
    {
      name: 'JL1 both adjacent slots empty',
      sourceSlot: 1,
      board: [null, null, null, null],
    },
    {
      name: 'JL2 existing left, generated right',
      sourceSlot: 1,
      board: [makeCard('jl2-left-existing', 0), null, null, null],
    },
    {
      name: 'JL3 generated left, existing right',
      sourceSlot: 1,
      board: [null, null, makeCard('jl3-right-existing', 2), null],
    },
    {
      name: 'JL4 both adjacent slots occupied',
      sourceSlot: 1,
      board: [makeCard('jl4-left-existing', 0), null, makeCard('jl4-right-existing', 2), null],
    },
    {
      name: 'JL5 left board edge',
      sourceSlot: 0,
      board: [null, null, null, null],
    },
    {
      name: 'JL6 right board edge',
      sourceSlot: 3,
      board: [null, null, null, null],
    },
    {
      name: 'JL7 board full after source enters',
      sourceSlot: 1,
      board: [
        makeCard('jl7-left-existing', 0),
        null,
        makeCard('jl7-right-existing', 2),
        makeCard('jl7-distant-existing', 3),
      ],
    },
    {
      name: 'distant card does not block a direct adjacent slot',
      sourceSlot: 0,
      board: [null, null, makeCard('distant-existing', 2), null],
    },
    {
      name: 'occupied direct neighbor is not skipped to reach a farther empty slot',
      sourceSlot: 0,
      board: [null, makeCard('direct-neighbor-blocker', 1), null, null],
    },
  ];

  for (const scenario of scenarios) {
    const state = stateWithPool();
    state.randomSeed = 2026;
    state.cardPool = [neutralDefinition];
    state.players[0].board = scenario.board;
    const adjacentSlots = [scenario.sourceSlot - 1, scenario.sourceSlot + 1]
      .filter((slot): slot is 0 | 1 | 2 | 3 => slot >= 0 && slot < 4);
    const expectedSummonSlots = adjacentSlots.filter((slot) => scenario.board[slot] === null);
    const opponent = makeCard(`${scenario.name}-opponent`, 0);
    state.players[1].board = [opponent, null, null, null];
    const sourceCard = card(joker, `${scenario.name}-source`);
    const sourceKeywords = [...sourceCard.keywords];
    const result = enterField(
      state,
      'player-1',
      sourceCard,
      scenario.sourceSlot,
    );
    const source = result.players[0].board[scenario.sourceSlot];
    for (const slot of expectedSummonSlots) {
      assert.ok(result.players[0].board[slot], `${scenario.name}: adjacent empty slot ${slot} should be filled`);
    }
    const expectedTauntIds = expectedSummonSlots
      .map((slot) => result.players[0].board[slot])
      .filter((item): item is CardInstance => item !== null && item.isGenerated)
      .map((item) => item.instanceId)
      .sort();
    const tauntedIds = result.players[0].board
      .filter((item): item is CardInstance => item !== null && item.keywords.includes('TAUNT'))
      .map((item) => item.instanceId)
      .filter((instanceId) => instanceId !== source?.instanceId)
      .sort();

    assert.deepEqual(tauntedIds, expectedTauntIds, scenario.name);
    assert.deepEqual(source?.keywords, sourceKeywords, `${scenario.name}: source keyword set`);
    assert.equal(source?.keywords.includes('TAUNT'), false, `${scenario.name}: source never gets TAUNT`);
    for (const slot of adjacentSlots) {
      const before = scenario.board[slot];
      if (!before) continue;
      assert.equal(
        result.players[0].board[slot]?.keywords.includes('TAUNT'),
        false,
        `${scenario.name}: pre-existing adjacent card remains unchanged`,
      );
    }
    for (const slot of expectedSummonSlots) {
      const generated = result.players[0].board[slot];
      assert.equal(generated?.isGenerated, true, `${scenario.name}: generated marker`);
      assert.equal(generated?.keywords.includes('TAUNT'), true, `${scenario.name}: generated card gets TAUNT`);
    }
    assert.equal(
      result.players[1].board[0]?.keywords.includes('TAUNT'),
      false,
      `${scenario.name}: opponent field`,
    );
    assert.equal(result.targetingState, undefined, scenario.name);
    assert.equal(result.pendingCardEffects.length, 0, scenario.name);
  }
});

test('published Pandora Token absorbs the attack snapshot of a wrestler retired in combat', () => {
  const pandora = definition('챔피언 판도라(폭주)');
  const effects = Array.isArray(pandora.effectConfig.effects) ? pandora.effectConfig.effects : [];
  assert.deepEqual(effects.map((effect) => (effect as { action?: string }).action).slice(0, 1), ['REGISTER_LISTENER']);
  const listenerAction = (effects.find((effect) =>
    (effect as { action?: string }).action === 'REGISTER_LISTENER',
  ) as { values?: { listener?: { effect?: { action?: string } } } } | undefined)
    ?.values?.listener?.effect?.action;
  assert.equal(listenerAction, 'ADD_AGGREGATED_ATTACK');
  assert.ok(effects.some((effect) => (effect as { action?: string }).action === 'DESTROY'));

  const victimDefinition: CardDefinition = {
    id: 'qa-pandora-combat-victim',
    name: 'QA Pandora combat victim',
    cardType: 'WRESTLER',
    cost: 1,
    attack: 3,
    health: 1,
    rulesText: '',
    rarity: 'NORMAL',
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [],
  };
  const entryTargetDefinition: CardDefinition = {
    ...victimDefinition,
    id: 'qa-pandora-entry-target',
    name: 'QA Pandora entry target',
    attack: 0,
    health: 1,
  };
  const state = stateWithPool();
  const entryTarget = {
    ...card(entryTargetDefinition, 'pandora-entry-target-instance'),
    boardSlot: 0 as const,
  };
  state.players[1].board[0] = entryTarget;
  const source = {
    ...card(pandora, 'pandora-combat-source'),
    currentAttack: 5,
    currentHealth: 6,
    maxHealth: 6,
  };
  const entered = enterField(state, 'player-1', source, 0);
  assert.ok(entered.targetingState?.validTargetIds.includes(entryTarget.instanceId));
  assert.ok(entered.pendingRuleListeners?.some((listener) => listener.sourceInstanceId === source.instanceId));
  const afterEntryDestroy = selectEffectTarget(entered, entryTarget.instanceId);
  assert.equal(afterEntryDestroy.targetingState, undefined);
  const sourceOnBoard = afterEntryDestroy.players[0].board[0];
  assert.ok(sourceOnBoard);

  afterEntryDestroy.players[0].board[0] = {
    ...sourceOnBoard,
    currentAttack: 5,
    currentHealth: 6,
    maxHealth: 6,
    enteredThisTurn: false,
  };
  const victim = {
    ...card(victimDefinition, 'pandora-combat-victim-instance'),
    boardSlot: 0 as const,
  };
  afterEntryDestroy.players[1].board[0] = victim;

  const attacked = attack(afterEntryDestroy, 'player-1', source.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: victim.instanceId,
  });
  assert.equal(
    attacked.success,
    true,
    attacked.success ? undefined : `${attacked.errorCode}: ${attacked.message}`,
  );
  if (!attacked.success) return;
  const finalState = attacked.state;
  const retired = finalState.events.find((event) =>
    event.type === 'CARD_RETIRED' && event.cardInstanceId === victim.instanceId,
  );
  const updatedSource = finalState.players[0].board.find((item) => item?.instanceId === source.instanceId);

  assert.ok(retired);
  assert.equal(retired.source?.type, 'CARD');
  assert.equal(retired.source?.type === 'CARD' ? retired.source.cardInstanceId : undefined, source.instanceId);
  assert.equal(retired.targetSnapshot?.currentAttack, 3);
  assert.equal(updatedSource?.currentAttack, 8);
  assert.equal(updatedSource?.currentHealth, 3);
  assert.equal(updatedSource?.maxHealth, 6);
});

test('published Pandora registers its listener before its on-enter DESTROY effect', () => {
  const pandora = definition('챔피언 판도라(폭주)');
  const victimDefinition: CardDefinition = {
    id: 'qa-pandora-destroy-victim',
    name: 'QA Pandora destroy victim',
    cardType: 'WRESTLER',
    cost: 1,
    attack: 7,
    health: 4,
    rulesText: '',
    rarity: 'NORMAL',
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [],
  };
  const state = stateWithPool();
  const victim = {
    ...card(victimDefinition, 'pandora-destroy-victim-instance'),
    boardSlot: 0 as const,
  };
  state.players[1].board[0] = victim;
  const source = {
    ...card(pandora, 'pandora-destroy-source'),
    currentAttack: 4,
    currentHealth: 6,
    maxHealth: 6,
  };

  const entered = enterField(state, 'player-1', source, 0);
  assert.ok(entered.targetingState?.validTargetIds.includes(victim.instanceId));
  assert.ok(entered.pendingRuleListeners?.some((listener) => listener.sourceInstanceId === source.instanceId));
  const destroyed = selectEffectTarget(entered, victim.instanceId);
  const removal = destroyed.events.find((event) =>
    event.type === 'CARD_DESTROYED' && event.cardInstanceId === victim.instanceId,
  );
  const updatedSource = destroyed.players[0].board.find((item) => item?.instanceId === source.instanceId);

  assert.ok(removal);
  assert.equal(removal.targetSnapshot?.currentAttack, 7);
  assert.equal(updatedSource?.currentAttack, 11);
  assert.equal(updatedSource?.currentHealth, 6);
  assert.equal(updatedSource?.maxHealth, 6);
  assert.equal(destroyed.targetingState, undefined);
});

test('authoritative 데헌 in HAND gains one DODGE on its first attack increase', () => {
  const dehun = definition('데헌');
  const handCard = {
    ...card(dehun, 'dehun-hand'),
    currentAttack: 3,
    statHistory: [{
      stat: 'attack' as const,
      before: 2,
      after: 3,
      delta: 1,
      turnNumber: 1,
    }],
  };
  const state = stateWithPool();
  state.players[0].hand = [handCard];

  const changed = resolveTriggeredAbilities(
    state,
    'player-1',
    handCard,
    'STAT_CHANGED',
    { attackDelta: 1 },
  );
  const updated = changed.players[0].hand[0];
  assert.ok(updated);
  assert.equal(updated?.keywords.includes('DODGE'), true);
  assert.equal(updated?.dodgeCharges, 1);
  assert.equal(updated?.boardSlot, null);
  assert.equal(changed.players[0].board.every((item) => item === null), true);
});

test('데헌 does not apply its HAND effect when the source is on BOARD', () => {
  const dehun = definition('데헌');
  const boardCard = {
    ...card(dehun, 'dehun-board'),
    boardSlot: 0 as const,
    currentAttack: 3,
    statHistory: [{
      stat: 'attack' as const,
      before: 2,
      after: 3,
      delta: 1,
      turnNumber: 1,
    }],
  };
  const state = stateWithPool();
  state.players[0].board = [boardCard, null, null, null];

  const changed = resolveTriggeredAbilities(
    state,
    'player-1',
    boardCard,
    'STAT_CHANGED',
    { attackDelta: 1 },
  );
  assert.equal(changed.players[0].board[0]?.keywords.includes('DODGE'), false);
  assert.equal(changed.players[0].board[0]?.dodgeCharges, 0);
});

test('데헌 consumes only the first HAND attack increase and keeps the hand instance hidden from board state', () => {
  const dehun = definition('데헌');
  const handCard = {
    ...card(dehun, 'dehun-repeat'),
    currentAttack: 4,
    statHistory: [
      {
        stat: 'attack' as const,
        before: 2,
        after: 3,
        delta: 1,
        turnNumber: 1,
      },
      {
        stat: 'attack' as const,
        before: 3,
        after: 4,
        delta: 1,
        turnNumber: 1,
      },
    ],
  };
  const state = stateWithPool();
  state.players[0].hand = [handCard];

  const changed = resolveTriggeredAbilities(
    state,
    'player-1',
    handCard,
    'STAT_CHANGED',
    { attackDelta: 1 },
  );
  assert.equal(changed.players[0].hand[0]?.keywords.includes('DODGE'), false);
  assert.equal(changed.players[0].hand[0]?.dodgeCharges, 0);
  assert.equal(changed.players[0].hand[0]?.boardSlot, null);
  assert.equal(changed.players[0].board.every((item) => item === null), true);
});

test('authoritative 나토마토 applies an attack-based combo buff for this turn and preserves permanent attack', () => {
  const natomato = definition('나토마토');
  const attackerDefinition = definition('로드');
  const enemyDefinition = definition('RM우디르');
  const state = stateWithPool();
  const attacker = {
    ...card(attackerDefinition, 'natomato-attacker'),
    boardSlot: 0 as const,
    enteredThisTurn: false,
    currentAttack: 4,
  };
  const source = {
    ...card(natomato, 'natomato-source'),
    boardSlot: 1 as const,
    enteredThisTurn: false,
    currentAttack: 1,
  };
  const enemy = {
    ...card(enemyDefinition, 'natomato-enemy'),
    boardSlot: 0 as const,
    currentHealth: 10,
    maxHealth: 10,
  };
  state.players[0].board = [attacker, source, null, null];
  state.players[1].board = [enemy, null, null, null];

  const attacked = attack(state, 'player-1', attacker.instanceId, {
    type: 'WRESTLER',
    playerId: 'player-2',
    cardInstanceId: enemy.instanceId,
  });
  assert.equal(attacked.success, true);
  if (!attacked.success) return;
  const boosted = attacked.state.players[0].board[1];
  assert.equal(boosted?.currentAttack, 5);
  assert.deepEqual(boosted?.temporaryStatModifiers, [{ stat: 'attack', amount: 4, untilTurn: 1 }]);

  const ended = endTurn(attacked.state, 'player-1');
  assert.equal(ended.success, true);
  if (!ended.success) return;
  const restored = ended.state.players[0].board[1];
  assert.equal(restored?.currentAttack, 1);
  assert.deepEqual(restored?.temporaryStatModifiers, []);
  assert.equal(restored?.baseAttack, 0);
  assert.equal(restored?.boardSlot, 1);
});