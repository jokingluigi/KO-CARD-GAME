import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from '../cards/published-cards';
import { generateCardInstance } from '../cards/generation';
import type { CardDefinition, CardInstance } from '../cards/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { enterField } from '../engine/enter-field';
import { playWrestlerFromHand } from '../engine/play-wrestler';
import { selectEffectTarget } from '../effects/effect-engine';
import type { GameState } from '../types/game-state';

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

test('authoritative 조킹루이지 summons two adjacent generated wrestlers and taunts only those results', () => {
  const joker = definition('조킹루이지');
  const state = stateWithPool();
  const entered = enterField(
    state,
    'player-1',
    card(joker, 'joking-luigi-source'),
    1,
  );
  const summoned = entered.players[0].board.filter(
    (item): item is CardInstance =>
      item !== null && item.instanceId !== 'joking-luigi-source',
  );

  assert.equal(summoned.length, 2);
  assert.deepEqual(summoned.map((item) => item.boardSlot), [0, 2]);
  assert.ok(summoned.every((item) => item.isGenerated));
  assert.ok(summoned.every((item) => item.cardType === 'WRESTLER'));
  assert.ok(summoned.every((item) => item.keywords.includes('TAUNT')));
  assert.equal(entered.targetingState, undefined);
  assert.equal(entered.pendingCardEffects.length, 0);
});