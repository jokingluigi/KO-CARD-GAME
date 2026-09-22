import assert from 'node:assert/strict';
import test from 'node:test';

import { runAITurn } from './ai-turn-scheduler';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { startGame } from '../engine/turn-system';
import type { GameState } from '../types/game-state';

const fixedRandom = () => 0.5;

function aiOnlyTurn(): GameState {
  const started = startGame(createInitialGameState(), fixedRandom);
  return {
    ...started,
    activePlayerId: 'player-2',
    players: started.players.map((player) =>
      player.id === 'player-2'
        ? {
            ...player,
            currentGold: 0,
            hand: [],
            deck: [],
            board: [null, null, null, null],
          }
        : player,
    ),
  };
}

function schedulerOptions(
  states: GameState[],
  waits: number[],
  cancelled = () => false,
) {
  return {
    wait: async (milliseconds: number) => {
      waits.push(milliseconds);
    },
    waitForPresentationIdle: async () => {},
    isCancelled: cancelled,
    onState: (state: GameState) => states.push(state),
    actionDelayMs: 17,
  };
}

test('AI auto-ends a turn with no action beyond END_TURN without waiting for timeout', async () => {
  const state = aiOnlyTurn();
  const states: GameState[] = [];
  const waits: number[] = [];

  const result = await runAITurn(
    state,
    'player-2',
    schedulerOptions(states, waits),
  );

  assert.equal(result.activePlayerId, 'player-1');
  assert.equal(states.length, 1);
  assert.equal(waits.includes(17), true);
  assert.equal(waits.includes(90_000), false);
  assert.equal(result.events.some((event) => event.type === 'TURN_STARTED' && event.playerId === 'player-1'), true);
  assert.equal(result.events.some((event) => event.type === 'TURN_ENDED' && event.playerId === 'player-2'), true);
});

test('AI scheduler keeps using the post-action state and presentation pause does not cancel the turn', async () => {
  const state = aiOnlyTurn();
  let presentationBusy = true;
  const states: GameState[] = [];
  const waits: number[] = [];

  const result = await runAITurn(state, 'player-2', {
    wait: async (milliseconds) => waits.push(milliseconds),
    waitForPresentationIdle: async () => {
      presentationBusy = false;
    },
    isCancelled: () => presentationBusy && states.length > 0,
    onState: (next) => states.push(next),
    actionDelayMs: 17,
  });

  assert.equal(result.activePlayerId, 'player-1');
  assert.equal(states.length, 1);
  assert.deepEqual(waits, [0, 17]);
});

test('AI never auto-ends while an unresolved target selection is pending', async () => {
  const state = {
    ...aiOnlyTurn(),
    targetingState: {
      active: true as const,
      playerId: 'player-2',
      sourceInstanceId: 'pending-source',
      effects: [],
      effectIndex: 0,
      selectedTargetIds: [],
      lastTargetIds: [],
      validTargetIds: [],
      minTargets: 1,
      maxTargets: 1,
      mandatory: true,
      cancelable: false,
    },
  };
  const states: GameState[] = [];
  const waits: number[] = [];

  const result = await runAITurn(
    state,
    'player-2',
    schedulerOptions(states, waits),
  );

  assert.strictEqual(result, state);
  assert.equal(states.length, 0);
  assert.deepEqual(waits, []);
});