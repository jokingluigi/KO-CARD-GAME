import type { GameState, PlayerState } from '../types/game-state';
import { MAX_HAND_SIZE } from '../rules/constants';
import { isChampionProtectedByToken } from './direct-champion';
import { resolveCardRetiredListeners, resolveTriggeredAbilities } from '../effects/effect-engine';
import { normalizeCardForZone, resetCardForGraveyard } from '../cards/zone-state';

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
    const health = drawingPlayer.health - (isChampionProtectedByToken(state, playerId) ? 0 : fatigueCount);
    const fatiguedPlayer = {
      ...drawingPlayer,
      health,
      fatigueCount,
      champion: drawingPlayer.champion
        ? { ...drawingPlayer.champion, health }
        : null,
    };

    return {
      ...state,
      ...(health <= 0
        ? finishGameFromFatigue(state, fatiguedPlayer)
        : {}),
      players: state.players.map((player) =>
        player.id === playerId ? fatiguedPlayer : player,
      ),
      events: [
        ...state.events,
        {
          type: 'DAMAGE_DEALT',
          playerId,
          source: { type: 'SYSTEM' },
          target: { type: 'PLAYER', playerId },
          reason: 'FATIGUE',
          amount: isChampionProtectedByToken(state, playerId) ? 0 : fatigueCount,
        },
      ],
    };
  }

  const [drawnCard, ...remainingDeck] = drawingPlayer.deck;
  // CARD_DRAWN is deliberately resolved while the card is temporarily in hand,
  // including an overdraw. This gives prepare effects a deterministic window
  // before the normal remove-from-game consequence.
  const drawState: GameState = {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? { ...player, deck: remainingDeck, hand: [...player.hand, normalizeCardForZone(drawnCard, 'HAND')] }
        : player,
    ),
    events: [
      ...state.events,
      { type: 'CARD_DRAWN', playerId, cardInstanceId: drawnCard.instanceId, source: { type: 'SYSTEM' },
        target: { type: 'CARD', cardInstanceId: drawnCard.instanceId }, reason: 'DRAW' },
    ],
  };
  const prepared = resolveTriggeredAbilities(drawState, playerId, drawnCard, 'CARD_DRAWN');
  if (drawingPlayer.hand.length < MAX_HAND_SIZE) return prepared;
  return {
    ...prepared,
    players: prepared.players.map((player) => player.id !== playerId ? player : {
      ...player,
      hand: player.hand.filter((card) => card.instanceId !== drawnCard.instanceId),
      removedFromGame: [...player.removedFromGame, drawnCard],
    }),
    events: [...prepared.events, { type: 'CARD_REMOVED', playerId, cardInstanceId: drawnCard.instanceId,
      source: { type: 'SYSTEM' }, target: { type: 'CARD', cardInstanceId: drawnCard.instanceId }, reason: 'OVERDRAW' }],
  };
}