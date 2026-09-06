import type { GameState, PlayerState } from '../types/game-state';

const MAX_HAND_SIZE = 7;

function finishGameFromFatigue(
  state: GameState,
  loser: PlayerState,
): Pick<GameState, 'status' | 'activePlayerId' | 'winnerId' | 'loserId'> {
  const winner = state.players.find((player) => player.id !== loser.id);

  return {
    status: 'FINISHED',
    activePlayerId: null,
    winnerId: winner?.id ?? null,
    loserId: loser.id,
  };
}

export function drawCard(state: GameState, playerId: string): GameState {
  const drawingPlayer = state.players.find((player) => player.id === playerId);

  if (!drawingPlayer) {
    throw new Error(`플레이어를 찾을 수 없습니다: ${playerId}`);
  }

  if (state.status === 'FINISHED') {
    throw new Error('종료된 게임에서는 카드를 뽑을 수 없습니다.');
  }

  if (drawingPlayer.deck.length === 0) {
    const fatigueCount = drawingPlayer.fatigueCount + 1;
    const health = drawingPlayer.health - fatigueCount;
    const fatiguedPlayer = {
      ...drawingPlayer,
      health,
      fatigueCount,
    };

    return {
      ...state,
      ...(health <= 0
        ? finishGameFromFatigue(state, fatiguedPlayer)
        : {}),
      players: state.players.map((player) =>
        player.id === playerId ? fatiguedPlayer : player,
      ),
    };
  }

  const [drawnCard, ...remainingDeck] = drawingPlayer.deck;
  const updatedPlayer =
    drawingPlayer.hand.length >= MAX_HAND_SIZE
      ? {
          ...drawingPlayer,
          deck: remainingDeck,
          removedFromGame: [...drawingPlayer.removedFromGame, drawnCard],
        }
      : {
          ...drawingPlayer,
          deck: remainingDeck,
          hand: [...drawingPlayer.hand, drawnCard],
        };

  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? updatedPlayer : player,
    ),
  };
}