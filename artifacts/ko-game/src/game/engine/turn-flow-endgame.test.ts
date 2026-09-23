import assert from 'node:assert/strict';
import test from 'node:test';

import { getLegalActions, executeAction } from '../actions/engine-actions';
import { processChampionQuestEvents } from '../champions/quests';
import type { ChampionDefinition } from '../champions/types';
import { TEST_CHAMPIONS } from '../champions/test-champions';
import { attack } from './combat';
import { createInitialGameState } from './create-initial-game-state';
import { useChampionAbility } from './champion-system';
import { endTurn, startGame } from './turn-system';
import { runAITurn } from '../actions/ai-turn-scheduler';
import { displayHealth } from '../../components/match-display-utils';

const fixedRandom = () => 0.5;

const jaeger: ChampionDefinition = {
  id: 'qa-jaeger-turn-flow',
  name: 'QA Jaeger',
  maxHealth: 30,
  abilityCost: 1,
  ability: {
    id: 'qa-jaeger-basic',
    name: 'Recruit',
    description: 'Gain gold.',
    effects: [{ type: 'GAIN_GOLD', amount: 1 }],
  },
  quest: {
    id: 'qa-jaeger-quest',
    name: 'Training',
    description: 'Generate five wrestlers.',
    trackedEvent: 'CARD_GENERATED',
    cardType: 'WRESTLER',
    requiredProgress: 5,
    reward: { type: 'UPGRADE_ABILITY', effects: [] },
  },
  upgradedAbility: {
    id: 'qa-jaeger-upgraded',
    name: 'Elite Recruit',
    description: 'Gain two gold.',
    effects: [{ type: 'GAIN_GOLD', amount: 2 }],
  },
};

function startedWithJaeger() {
  return startGame(
    createInitialGameState(
      ['test-champion-no-quest', jaeger.id],
      undefined,
      [...TEST_CHAMPIONS, jaeger],
    ),
    fixedRandom,
  );
}

test('Jaeger quest completion is one-shot and leaves no pending resolution frame', () => {
  const started = startedWithJaeger();
  const prepared = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-2' && player.champion
        ? {
            ...player,
            currentGold: 2,
            champion: { ...player.champion, questProgress: 4 },
          }
        : player,
    ),
  };
  const withFinalEvent = {
    ...prepared,
    events: [
      ...prepared.events,
      {
        type: 'CARD_GENERATED' as const,
        playerId: 'player-2',
        cardType: 'WRESTLER' as const,
      },
    ],
  };

  const completed = processChampionQuestEvents(prepared, withFinalEvent);
  const jaegerState = completed.players[1]?.champion;
  assert.equal(jaegerState?.questProgress, 5);
  assert.equal(jaegerState?.questCompleted, true);
  assert.equal(completed.events.filter((event) => event.type === 'CHAMPION_QUEST_COMPLETED').length, 1);
  assert.equal(completed.targetingState, undefined);
  assert.equal(completed.pendingCardEffects.length, 0);
  assert.equal(completed.pendingDelayedEffects.length, 0);

  const unchanged = processChampionQuestEvents(completed, completed);
  assert.equal(unchanged.events.filter((event) => event.type === 'CHAMPION_QUEST_COMPLETED').length, 1);
});

test('Jaeger ability resolution completes without a stale frame and END_TURN works immediately', () => {
  const started = startedWithJaeger();
  const prepared = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1'
        ? { ...player, currentGold: 2 }
        : player,
    ),
  };

  const ability = useChampionAbility(prepared, 'player-1');
  assert.equal(ability.success, true);
  if (!ability.success) return;
  assert.equal(ability.state.targetingState, undefined);
  assert.equal(ability.state.pendingCardEffects.length, 0);

  const ended = endTurn(ability.state, 'player-1');
  assert.equal(ended.success, true);
  if (ended.success) assert.equal(ended.state.activePlayerId, 'player-2');
});

test('AI can choose and execute a legal action after Jaeger quest completion', () => {
  const started = startedWithJaeger();
  const prepared = {
    ...started,
    activePlayerId: 'player-2',
    players: started.players.map((player) =>
      player.id === 'player-2' && player.champion
        ? {
            ...player,
            currentGold: 2,
            champion: {
              ...player.champion,
              questProgress: player.champion.quest?.requiredProgress ?? 5,
              questCompleted: true,
            },
          }
        : player,
    ),
  };
  const legal = getLegalActions(prepared, 'player-2');
  assert.ok(legal.length > 0);
  const action = legal.find((candidate) => candidate.type === 'USE_CHAMPION_ABILITY') ?? legal[0]!;
  const result = executeAction(prepared, action);
  assert.equal(result.success, true);
});

test('AI resumes after a completed Jaeger quest without presentation or timeout recovery', async () => {
  const started = startedWithJaeger();
  const prepared = {
    ...started,
    activePlayerId: 'player-2' as const,
    players: started.players.map((player) =>
      player.id === 'player-2' && player.champion
        ? {
            ...player,
            currentGold: 2,
            hand: [],
            deck: [],
            board: [null, null, null, null] as typeof player.board,
            champion: {
              ...player.champion,
              questProgress: player.champion.quest?.requiredProgress ?? 5,
              questCompleted: true,
            },
          }
        : player,
    ),
  };
  const waits: number[] = [];
  const states: typeof prepared[] = [];
  const result = await runAITurn(prepared, 'player-2', {
    wait: async (milliseconds) => waits.push(milliseconds),
    waitForPresentationIdle: async () => {},
    isCancelled: () => false,
    onState: (next) => states.push(next),
    actionDelayMs: 1,
  });

  assert.equal(result.activePlayerId, 'player-1');
  assert.equal(states.at(-1)?.activePlayerId, 'player-1');
  assert.equal(waits.includes(90_000), false);
  assert.equal(result.events.filter((event) => event.type === 'CHAMPION_QUEST_COMPLETED').length, 0);
});

test('turn transition preserves board and hand membership for timeout END_TURN semantics', () => {
  const started = startedWithJaeger();
  const player = started.players[0]!;
  const boardCard = { ...player.deck[0]!, boardSlot: 0 as const, enteredThisTurn: false };
  const handCard = player.deck[1]!;
  const prepared = {
    ...started,
    players: started.players.map((candidate) =>
      candidate.id === player.id
        ? {
            ...candidate,
            deck: candidate.deck.slice(2),
            hand: [handCard],
            board: [boardCard, null, null, null] as typeof candidate.board,
          }
        : candidate,
    ),
  };
  const ended = endTurn(prepared, player.id);
  assert.equal(ended.success, true);
  if (!ended.success) return;
  assert.deepEqual(
    ended.state.players[0]?.board.map((card) => card?.instanceId),
    [boardCard.instanceId, undefined, undefined, undefined],
  );
  assert.deepEqual(
    ended.state.players[0]?.hand.map((card) => card.instanceId),
    [handCard.instanceId],
  );
});

test('lethal Champion damage finishes the match without restoring the loser to one HP', () => {
  const started = startedWithJaeger();
  const attacker = {
    ...started.players[0]!.deck[0]!,
    boardSlot: 0 as const,
    enteredThisTurn: false,
    currentAttack: 2,
    currentHealth: 2,
    maxHealth: 2,
  };
  const prepared = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1'
        ? { ...player, deck: player.deck.slice(1), board: [attacker, null, null, null] as typeof player.board }
        : player.id === 'player-2'
          ? {
              ...player,
              health: 1,
              champion: player.champion ? { ...player.champion, health: 1 } : null,
            }
          : player,
    ),
  };

  const lethal = attack(prepared, 'player-1', attacker.instanceId, {
    type: 'PLAYER',
    playerId: 'player-2',
  });
  assert.equal(lethal.success, true);
  if (!lethal.success) return;
  assert.equal(lethal.state.status, 'FINISHED');
  assert.equal(lethal.state.winnerId, 'player-1');
  assert.equal(lethal.state.loserId, 'player-2');
  assert.equal(lethal.state.players[1]?.health, -1);
  assert.equal(lethal.state.players[1]?.champion?.health, -1);

  const afterFinish = endTurn(lethal.state, 'player-2');
  assert.equal(afterFinish.success, false);
  if (!afterFinish.success) assert.equal(afterFinish.errorCode, 'GAME_NOT_IN_PROGRESS');
});

test('result and board HP display clamp only the user-facing value', () => {
  assert.equal(displayHealth(-1), 0);
  assert.equal(displayHealth(0), 0);
  assert.equal(displayHealth(12), 12);
});