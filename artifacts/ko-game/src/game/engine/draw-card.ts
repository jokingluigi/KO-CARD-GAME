import type { GameState, PlayerState } from '../types/game-state';
import { MAX_HAND_SIZE } from '../rules/constants';
import { findDirectDeployedChampion } from './direct-champion';
import { resolveTriggeredAbilities } from '../effects/effect-engine';

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
    const directChampion = findDirectDeployedChampion(state, playerId);
    if (directChampion) {
      const currentHealth = directChampion.currentHealth - fatigueCount;
      const defeated = currentHealth <= 0;
      return {
        ...state,
        ...(defeated
          ? finishGameFromFatigue(state, drawingPlayer)
          : {}),
        players: state.players.map((player) => {
          if (player.id !== playerId) return player;
          const board = player.board.map((card) =>
            card?.instanceId === directChampion.instanceId
              ? defeated
                ? null
                : { ...card, currentHealth }
              : card,
          ) as typeof player.board;
          return {
            ...player,
            fatigueCount,
            board,
            graveyard: defeated
              ? [
                  ...player.graveyard,
                  {
                    ...directChampion,
                    currentHealth,
                    boardSlot: null,
                  },
                ]
              : player.graveyard,
          };
        }),
        events: [
          ...state.events,
          {
            type: 'DAMAGE_DEALT',
            playerId,
            source: { type: 'SYSTEM' },
            target: {
              type: 'CARD',
              cardInstanceId: directChampion.instanceId,
            },
            reason: 'FATIGUE',
            amount: fatigueCount,
          },
          ...(defeated
            ? [
                {
                  type: 'CARD_RETIRED' as const,
                  playerId,
                  cardInstanceId: directChampion.instanceId,
                  source: { type: 'SYSTEM' as const },
                  target: {
                    type: 'CARD' as const,
                    cardInstanceId: directChampion.instanceId,
                  },
                  reason: 'RETIRE',
                  boardSlot: directChampion.boardSlot!,
                },
              ]
            : []),
        ],
      };
    }
    const health = drawingPlayer.health - fatigueCount;
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
          amount: fatigueCount,
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
      player.id === playerId ? { ...player, deck: remainingDeck, hand: [...player.hand, drawnCard] } : player,
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