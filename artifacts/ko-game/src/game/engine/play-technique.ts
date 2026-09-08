import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { CardInstanceId } from '../cards/types';
import { resolveTriggeredAbilities } from '../effects/effect-engine';
import type { GameState } from '../types/game-state';
import { validateCurrentPlayer } from './turn-system';

/** Plays a technique only when it is directly cast from the player's hand. */
export function playTechniqueFromHand(
  state: GameState, playerId: string, cardInstanceId: CardInstanceId,
): ActionResult {
  if (state.targetingState?.active) return actionFailure(state, 'TARGET_SELECTION_PENDING', '먼저 대상을 선택하세요.');
  const turnFailure = validateCurrentPlayer(state, playerId);
  if (turnFailure) return turnFailure;
  const player = state.players.find((candidate) => candidate.id === playerId);
  const card = player?.hand.find((candidate) => candidate.instanceId === cardInstanceId);
  if (!player || !card || card.cardType !== 'TECHNIQUE') return actionFailure(state, 'CARD_NOT_IN_HAND', '사용할 수 없는 기술입니다.');
  if (player.currentGold < card.currentCost) return actionFailure(state, 'NOT_ENOUGH_GOLD', '골드가 부족합니다.');
  const paid: GameState = {
    ...state,
    players: state.players.map((candidate) => candidate.id !== playerId ? candidate : {
      ...candidate, currentGold: candidate.currentGold - card.currentCost,
      hand: candidate.hand.filter((entry) => entry.instanceId !== cardInstanceId),
      graveyard: [...candidate.graveyard, { ...card, boardSlot: null }],
    }),
    events: [...state.events, { type: 'CARD_PLAYED', playerId, cardInstanceId,
      source: { type: 'PLAYER', playerId }, target: { type: 'CARD', cardInstanceId }, reason: 'PLAY_FROM_HAND',
      tags: card.tags ? [...card.tags] : [] }],
  };
  // Technique-cast abilities are resolved before the technique's own effects.
  const spellListeners = (card.baseCost ?? card.currentCost) >= 1
    ? player.board.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .reduce((next, source) => resolveTriggeredAbilities(next, playerId, source, 'TECHNIQUE_CAST', {
        playedFromHand: true, baseCost: card.baseCost ?? card.currentCost,
      }), paid)
    : paid;
  const body = card.abilities.filter((ability) => ability.trigger === 'ACTIVE').flatMap((ability) => ability.effects);
  const resolved = body.length
    ? resolveTriggeredAbilities(spellListeners, playerId, { ...card, abilities: [{ trigger: 'ACTIVE', effects: body }] }, 'ACTIVE')
    : spellListeners;
  return actionSuccess(resolved);
}