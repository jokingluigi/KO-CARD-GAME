import { generateCard } from '../cards/generation';
import type { CardInstance } from '../cards/types';
import { enterField } from './enter-field';
import type { GameState } from '../types/game-state';
import { findDirectDeployedChampion } from './direct-champion';
import type { ActionErrorCode } from '../actions/types';

export function validateLinkedChampionToken(
  state: GameState,
  playerId: string,
): { ok: true } | { ok: false; errorCode: ActionErrorCode; message: string } {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const champion = player?.champion;
  if (!champion?.championTokenDefinitionId) {
    return {
      ok: false,
      errorCode: 'CHAMPION_TOKEN_NOT_CONFIGURED',
      message: '이 챔피언에 연결된 챔피언 토큰 카드가 없습니다.',
    };
  }
  const definition = state.cardPool?.find(
    (candidate) => candidate.id === champion.championTokenDefinitionId,
  );
  if (!definition?.isChampionToken) {
    return {
      ok: false,
      errorCode: 'CHAMPION_TOKEN_REFERENCE_INVALID',
      message: '연결된 챔피언 토큰 카드를 찾을 수 없습니다.',
    };
  }
  if (!player?.board.some((card) => card === null)) {
    return {
      ok: false,
      errorCode: 'BOARD_FULL',
      message: '필드에 빈 자리가 없습니다.',
    };
  }
  return { ok: true };
}

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
    undefined,
    'CHAMPION_DEPLOY',
  );
}

export function deployLinkedChampionToken(
  state: GameState,
  playerId: string,
  reason = 'CHAMPION_TOKEN_DEPLOY',
): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const champion = player?.champion;
  const tokenId = champion?.championTokenDefinitionId;
  const definition = tokenId
    ? state.cardPool?.find((candidate) => candidate.id === tokenId)
    : undefined;
  if (
    !player ||
    !champion ||
    !tokenId ||
    !definition?.isChampionToken ||
    findDirectDeployedChampion(state, playerId) ||
    !player.board.some((card) => card === null)
  ) {
    return state;
  }
  return directDeployChampionToken(state, playerId, champion.id, tokenId, reason);
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