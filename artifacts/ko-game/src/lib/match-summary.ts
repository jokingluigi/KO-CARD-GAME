import type { GameEvent, GameState } from '@/game';

export interface PlayerMatchSummary {
  playerId: string;
  cardsPlayed: number;
  damageDealt: number;
  questCompleted: boolean;
  questProgress: number | null;
  questRequired: number | null;
}

function cardOwner(state: GameState, instanceId: string): string | undefined {
  return state.players.find((player) => [
    ...player.board,
    ...player.hand,
    ...player.deck,
    ...player.graveyard,
    ...player.removedFromGame,
  ].some((card) => card?.instanceId === instanceId))?.id;
}

function damageSourcePlayer(state: GameState, event: GameEvent): string | undefined {
  if (event.sourceContext?.sourcePlayerId) return event.sourceContext.sourcePlayerId;
  if (event.sourceSnapshot?.playerId) return event.sourceSnapshot.playerId;
  if (event.source?.type === 'PLAYER') return event.source.playerId;
  if (event.source?.type === 'CARD') return cardOwner(state, event.source.cardInstanceId);
  return undefined;
}

export function matchSummary(state: GameState): PlayerMatchSummary[] {
  return state.players.map((player) => ({
    playerId: player.id,
    cardsPlayed: state.events.filter((event) => event.type === 'CARD_PLAYED' && event.playerId === player.id).length,
    damageDealt: state.events.reduce((sum, event) => {
      if (event.type !== 'DAMAGE_DEALT' || damageSourcePlayer(state, event) !== player.id) return sum;
      return sum + Math.max(0, event.amount ?? 0);
    }, 0),
    questCompleted: Boolean(player.champion?.questCompleted || state.events.some((event) =>
      event.type === 'CHAMPION_QUEST_COMPLETED' && event.playerId === player.id)),
    questProgress: player.champion?.quest ? player.champion.questProgress : null,
    questRequired: player.champion?.quest ? player.champion.quest.requiredProgress : null,
  }));
}

export function matchEndReason(state: GameState, viewerPlayerId: string): string {
  const terminalEvent = [...state.events].reverse().find((event) =>
    event.type === 'SURRENDER' ||
    (event.type === 'DAMAGE_DEALT' && (event.amount ?? 0) > 0 && (
      (event.target?.type === 'PLAYER' && event.target.playerId === state.loserId) ||
      (event.reason === 'FATIGUE' && event.playerId === state.loserId)
    )),
  );

  if (terminalEvent?.type === 'SURRENDER') {
    return terminalEvent.playerId === viewerPlayerId
      ? '항복으로 매치가 종료되었습니다.'
      : '상대의 항복으로 매치가 종료되었습니다.';
  }
  if (terminalEvent?.reason === 'FATIGUE') return '덱 소진으로 매치가 종료되었습니다.';
  if (terminalEvent?.reason === 'BASIC_ATTACK') return '직접 공격으로 매치가 종료되었습니다.';
  if (terminalEvent?.type === 'DAMAGE_DEALT') return '카드 효과로 매치가 종료되었습니다.';
  return '매치 결과가 확정되었습니다.';
}
