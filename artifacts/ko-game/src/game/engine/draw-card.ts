import type { GameState, PlayerState } from '../types/game-state';
import { MAX_HAND_SIZE } from '../rules/constants';
import { isChampionProtectedByToken } from './direct-champion';
import { resolveRegisteredRuleListeners, resolveCardRetiredListeners, resolveTriggeredAbilities } from '../effects/effect-engine';
import { normalizeCardForZone } from '../cards/zone-state';
import { checkpointAwakening, hasAwakeningInvulnerability } from '../champions/awakening';

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
    const awakeningPrevented = hasAwakeningInvulnerability(state, playerId);
    const health = drawingPlayer.health - (awakeningPrevented || isChampionProtectedByToken(state, playerId) ? 0 : fatigueCount);
    const fatiguedPlayer = {
      ...drawingPlayer,
      health,
      fatigueCount,
      champion: drawingPlayer.champion
        ? { ...drawingPlayer.champion, health }
        : null,
    };

    const fatiguedState: GameState = {
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
    return checkpointAwakening(state, awakeningPrevented ? { ...fatiguedState, events: state.events } : resolveRegisteredRuleListeners(fatiguedState,'DAMAGE_TAKEN',playerId,undefined,undefined,state.events.length));
  }

  const [drawnCard, ...remainingDeck] = drawingPlayer.deck;
  if (drawingPlayer.hand.length >= MAX_HAND_SIZE) return {
    ...state,
    players: state.players.map(player => player.id !== playerId ? player : {
      ...player, deck: remainingDeck, removedFromGame: [...player.removedFromGame, drawnCard],
    }),
    events: [...state.events,
      { type: 'CARD_DRAWN', playerId, cardInstanceId: drawnCard.instanceId, cardDefinitionId: drawnCard.definitionId, source: {type:'SYSTEM'}, reason: 'OVERDRAW' },
      { type: 'CARD_REVEALED', playerId, cardInstanceId: drawnCard.instanceId, cardDefinitionId: drawnCard.definitionId, reason: 'OVERDRAW' },
      { type: 'CARD_REMOVED', playerId, cardInstanceId: drawnCard.instanceId, cardDefinitionId: drawnCard.definitionId,
        source: {type:'SYSTEM'}, target: {type:'CARD',cardInstanceId:drawnCard.instanceId}, reason: 'OVERDRAW' },
    ],
  };
  const drawState: GameState = {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        // Leaving the field already resets a returning card. Drawing is not
        // another reset: preserve buffs/cost changes explicitly applied in deck.
        ? { ...player, deck: remainingDeck, hand: [...player.hand, normalizeCardForZone(drawnCard, 'HAND')] }
        : player,
    ),
    events: [
      ...state.events,
      { type: 'CARD_DRAWN', playerId, cardInstanceId: drawnCard.instanceId, source: { type: 'SYSTEM' },
        target: { type: 'CARD', cardInstanceId: drawnCard.instanceId }, reason: 'DRAW' },
    ],
  };
  return resolveTriggeredAbilities(drawState, playerId, drawnCard, 'CARD_DRAWN');
}
