import { generateCard } from '../cards/generation';
import type { CardInstance } from '../cards/types';
import { normalizeCardForZone } from '../cards/zone-state';
import { enterField } from './enter-field';
import type { GameState } from '../types/game-state';
import { findDirectDeployedChampion } from './direct-champion';
import type { ActionErrorCode } from '../actions/types';
import { MAX_HAND_SIZE } from '../rules/constants';

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
  const { card, event } = generateCard(definition, {
    instanceId: `${playerId}-${championId}-direct-${state.turn}-${state.events.length}`,
    playerId,
    source: { type: 'CHAMPION', championId },
    reason,
    creationEventIndex: state.events.length,
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
  const boardSlot = player.board.findIndex((card) => card === null);
  if (boardSlot < 0) {
    return {
      ...generatedState,
      players: generatedState.players.map((candidate) => {
        if (candidate.id !== playerId) return candidate;
        if (candidate.hand.length < MAX_HAND_SIZE) {
          return { ...candidate, hand: [...candidate.hand, normalizeCardForZone(directChampion, 'HAND')] };
        }
        return { ...candidate, deck: [normalizeCardForZone(directChampion, 'DECK'), ...candidate.deck] };
      }),
    };
  }
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
    findDirectDeployedChampion(state, playerId)
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
      !definition?.isChampionToken) {
    return state;
  }
  return directDeployChampionToken(state, playerId, championId, cardDefinitionId, reason);
}