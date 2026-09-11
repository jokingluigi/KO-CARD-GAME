import { generateCard } from '../cards/generation';
import type { CardInstance } from '../cards/types';
import { enterField } from './enter-field';
import type { GameState } from '../types/game-state';

export function directDeployChampionToken(
  state: GameState,
  playerId: string,
  championId: string,
  cardDefinitionId: string,
  reason = 'CHAMPION_DIRECT_DEPLOY',
): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const definition = state.cardPool?.find((candidate) => candidate.id === cardDefinitionId);
  if (
    !player?.champion ||
    player.champion.id !== championId ||
    !definition?.isChampionToken
  ) {
    throw new Error('유효한 챔피언 토큰을 직접 출전시킬 수 없습니다.');
  }
  const boardSlot = player.board.findIndex((card) => card === null);
  if (boardSlot < 0) {
    throw new Error('챔피언 토큰이 출전할 빈 슬롯이 없습니다.');
  }

  const { card, event } = generateCard(definition, {
    instanceId: `${playerId}-${championId}-direct-${state.turn}-${state.events.length}`,
    playerId,
    source: { type: 'CHAMPION', championId },
    reason,
  });
  const directChampion: CardInstance = {
    ...card,
    currentHealth: player.health,
    maxHealth: player.maxHealth,
    isDirectDeployedChampion: true,
    isSilenceImmune: true,
  };
  const generatedState: GameState = {
    ...state,
    events: [...state.events, event],
  };
  return enterField(
    generatedState,
    playerId,
    directChampion,
    boardSlot as 0 | 1 | 2 | 3,
    { type: 'CHAMPION', championId },
  );
}

export function tryDirectDeployChampionToken(
  state: GameState,
  playerId: string,
  championId: string,
  cardDefinitionId: string,
  reason: string,
): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const definition = state.cardPool?.find((candidate) => candidate.id === cardDefinitionId);
  if (!player?.champion || player.champion.id !== championId ||
      !definition?.isChampionToken || !player.board.some((card) => card === null)) {
    return state;
  }
  return directDeployChampionToken(state, playerId, championId, cardDefinitionId, reason);
}