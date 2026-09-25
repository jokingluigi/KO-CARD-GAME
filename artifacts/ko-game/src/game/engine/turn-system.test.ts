import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialGameState } from './create-initial-game-state';
import { endTurn, startGame } from './turn-system';
import type { ActionResult } from '../actions/types';

function successState(result: ActionResult) {
  assert.equal(result.success, true);
  return result.state;
}

function getPlayerGold(
  state: ReturnType<typeof createInitialGameState>,
  playerId: string,
): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  assert.ok(player);
  return player.currentGold;
}

function startPlayerOnePersonalTurn(
  personalTurn: number,
  nextTurnGoldBonus = 0,
  currentGold = 0,
) {
  const started = startGame(createInitialGameState());
  const prepared = {
    ...started,
    activePlayerId: 'player-2',
    players: started.players.map((player) =>
      player.id === 'player-1'
        ? {
            ...player,
            personalTurn: personalTurn - 1,
            nextTurnGoldBonus,
            currentGold,
          }
        : player,
    ),
  };

  return successState(endTurn(prepared, 'player-2'));
}

test('P1 첫 턴은 1G로 시작한다', () => {
  const state = startGame(createInitialGameState());

  assert.equal(state.activePlayerId, 'player-1');
  assert.equal(getPlayerGold(state, 'player-1'), 1);
});

test('P2 첫 턴은 1G로 시작한다', () => {
  const started = startGame(createInitialGameState());
  const state = successState(endTurn(started, 'player-1'));

  assert.equal(state.activePlayerId, 'player-2');
  assert.equal(getPlayerGold(state, 'player-2'), 1);
});

test('필드 카드의 턴 종료와 다음 자기 턴 시작 효과가 실제로 발동한다', () => {
  const started = startGame(createInitialGameState());
  const owner = started.players[0]!;
  const card = owner.hand[0]!;
  const withAbility = {
    ...started,
    players: started.players.map((player) => player.id === owner.id ? {
      ...player,
      hand: player.hand.filter((candidate) => candidate.instanceId !== card.instanceId),
      board: [{ ...card, boardSlot: 0 as const, abilities: [
        { trigger: 'TURN_START' as const, effects: [{ type: 'STRUCTURED' as const, action: 'DRAW' as const, values: { amount: 1 } }] },
        { trigger: 'TURN_END' as const, effects: [{ type: 'STRUCTURED' as const, action: 'DRAW' as const, values: { amount: 1 } }] },
      ] }, ...player.board.slice(1)] as typeof player.board,
    } : player),
  };
  const initialHandCount = withAbility.players[0]!.hand.length;
  const afterEnd = successState(endTurn(withAbility, owner.id));
  assert.equal(afterEnd.players[0]!.hand.length, initialHandCount + 1);
  const afterNextStart = successState(endTurn(afterEnd, 'player-2'));
  assert.equal(afterNextStart.players[0]!.hand.length, initialHandCount + 3);
});

test('P1 두 번째 턴은 2G로 시작한다', () => {
  const started = startGame(createInitialGameState());
  const playerTwoTurn = successState(endTurn(started, 'player-1'));
  const state = successState(endTurn(playerTwoTurn, 'player-2'));

  assert.equal(state.activePlayerId, 'player-1');
  assert.equal(getPlayerGold(state, 'player-1'), 2);
});

test('기본 턴 골드는 개인 6번째 턴부터 6G로 유지된다', () => {
  for (const [personalTurn, expectedGold] of [
    [5, 5],
    [6, 6],
    [7, 6],
    [10, 6],
  ] as const) {
    const state = startPlayerOnePersonalTurn(personalTurn);

    assert.equal(getPlayerGold(state, 'player-1'), expectedGold);
  }
});

test('기본 골드가 6G여도 다음 턴 보너스는 제한 없이 더해진다', () => {
  assert.equal(getPlayerGold(startPlayerOnePersonalTurn(7, 1), 'player-1'), 7);
  assert.equal(getPlayerGold(startPlayerOnePersonalTurn(7, 3), 'player-1'), 9);
});

test('6G를 초과한 보너스 골드도 적용 후 0으로 초기화된다', () => {
  const state = startPlayerOnePersonalTurn(7, 3);
  const playerOne = state.players.find((player) => player.id === 'player-1');

  assert.ok(playerOne);
  assert.equal(playerOne.currentGold, 9);
  assert.equal(playerOne.nextTurnGoldBonus, 0);
});

test('6번째 턴 이후에도 남은 골드는 다음 개인 턴에 이월되지 않는다', () => {
  const state = startPlayerOnePersonalTurn(7, 0, 3);

  assert.equal(getPlayerGold(state, 'player-1'), 6);
});

test('남은 골드는 다음 개인 턴으로 이월되지 않는다', () => {
  const started = startGame(createInitialGameState());
  const withUnspentGold = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-1' ? { ...player, currentGold: 7 } : player,
    ),
  };
  const playerTwoTurn = successState(endTurn(withUnspentGold, 'player-1'));
  const state = successState(endTurn(playerTwoTurn, 'player-2'));

  assert.equal(getPlayerGold(state, 'player-1'), 2);
});

test('nextTurnGoldBonus는 적용된 직후 0으로 초기화된다', () => {
  const started = startGame(createInitialGameState());
  const withBonus = {
    ...started,
    players: started.players.map((player) =>
      player.id === 'player-2'
        ? { ...player, nextTurnGoldBonus: 3 }
        : player,
    ),
  };
  const state = successState(endTurn(withBonus, 'player-1'));
  const playerTwo = state.players.find(
    (player) => player.id === 'player-2',
  );

  assert.ok(playerTwo);
  assert.equal(playerTwo.currentGold, 4);
  assert.equal(playerTwo.nextTurnGoldBonus, 0);
});

test('관리자 테스트 게임의 두 단계 턴 전환은 Turn 4까지 상태를 보존한다', () => {
  let state = startGame(createInitialGameState(), () => 0.5);
  const initialZoneSizes = state.players.map((player) =>
    player.hand.length + player.deck.length + player.board.filter(Boolean).length +
    player.graveyard.length + player.removedFromGame.length,
  );

  for (let transition = 0; transition < 4; transition += 1) {
    const actingPlayerId = state.players[0]?.id;
    const opponentPlayerId = state.players[1]?.id;
    assert.ok(actingPlayerId);
    assert.ok(opponentPlayerId);
    const first = endTurn(state, actingPlayerId);
    assert.equal(first.success, true);
    if (!first.success) return;
    const second = endTurn(first.state, opponentPlayerId);
    assert.equal(second.success, true);
    if (!second.success) return;
    state = second.state;
    assert.equal(state.status, 'IN_PROGRESS');
    assert.equal(state.activePlayerId, actingPlayerId);
    assert.equal(state.targetingState, undefined);
    assert.equal(state.pendingCardEffects.length, 0);
    assert.equal(state.pendingDelayedEffects.length, 0);
    assert.deepEqual(
      state.players.map((player) => ({
        total: player.hand.length + player.deck.length + player.board.filter(Boolean).length +
          player.graveyard.length + player.removedFromGame.length,
      })).map((player) => player.total),
      initialZoneSizes,
    );
  }
  assert.equal(state.turn, 9);
});
