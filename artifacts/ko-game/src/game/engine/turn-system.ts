import type { GameState, PlayerState } from '../types/game-state';

function beginPlayerTurn(player: PlayerState): PlayerState {
  const personalTurn = player.personalTurn + 1;

  return {
    ...player,
    personalTurn,
    currentGold: personalTurn + player.nextTurnGoldBonus,
    nextTurnGoldBonus: 0,
  };
}

export function isCurrentPlayer(
  state: GameState,
  playerId: string,
): boolean {
  return state.activePlayerId === playerId;
}

export function assertCurrentPlayer(
  state: GameState,
  playerId: string,
): void {
  if (!isCurrentPlayer(state, playerId)) {
    throw new Error(`현재 턴의 플레이어가 아닙니다: ${playerId}`);
  }
}

export function startGame(state: GameState): GameState {
  if (state.players.length !== 2) {
    throw new Error('게임을 시작하려면 플레이어가 정확히 2명이어야 합니다.');
  }

  if (state.activePlayerId !== null) {
    throw new Error('이미 시작된 게임입니다.');
  }

  const firstPlayer = state.players[0];

  return {
    ...state,
    turn: 1,
    activePlayerId: firstPlayer.id,
    status: 'IN_PROGRESS',
    players: state.players.map((player) =>
      player.id === firstPlayer.id ? beginPlayerTurn(player) : player,
    ),
  };
}

export function endTurn(
  state: GameState,
  actingPlayerId: string,
): GameState {
  assertCurrentPlayer(state, actingPlayerId);

  const currentPlayerIndex = state.players.findIndex(
    (player) => player.id === actingPlayerId,
  );
  const nextPlayerIndex = (currentPlayerIndex + 1) % state.players.length;
  const nextPlayer = state.players[nextPlayerIndex];

  return {
    ...state,
    turn: state.turn + 1,
    activePlayerId: nextPlayer.id,
    players: state.players.map((player) => {
      if (player.id === actingPlayerId) {
        return { ...player, currentGold: 0 };
      }

      return player.id === nextPlayer.id ? beginPlayerTurn(player) : player;
    }),
  };
}