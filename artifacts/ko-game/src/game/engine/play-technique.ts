import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { CardInstanceId } from '../cards/types';
import { hasMandatoryPlayerChoice, resolveQueuedEffectsForPlayedTechnique, resolveRegisteredRuleListeners, resolveTriggeredAbilities } from '../effects/effect-engine';
import type { GameState } from '../types/game-state';
import { validateCurrentPlayer } from './turn-system';
import { resetCardForGraveyard } from '../cards/zone-state';

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
  const queuedState = resolveQueuedEffectsForPlayedTechnique(state, playerId, cardInstanceId);
  const queuedPlayer = queuedState.players.find((candidate) => candidate.id === playerId);
  const queuedCard = queuedPlayer?.hand.find((candidate) => candidate.instanceId === cardInstanceId);
  if (!queuedPlayer || !queuedCard) return actionFailure(state, 'CARD_NOT_IN_HAND', '사용할 수 없는 기술입니다.');
  const body = queuedCard.abilities.filter((ability) => ability.trigger === 'ACTIVE').flatMap((ability) => ability.effects);
  if (hasMandatoryPlayerChoice(state, playerId, card, body)) {
    return actionFailure(state, 'NO_VALID_TARGET', '선택 가능한 대상이 없습니다.');
  }
  for (const source of player.board.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))) {
    const listenerEffects = source.abilities
      .filter((ability) => ability.trigger === 'TECHNIQUE_CAST')
      .flatMap((ability) => ability.effects);
    if (hasMandatoryPlayerChoice(state, playerId, source, listenerEffects)) {
      return actionFailure(state, 'NO_VALID_TARGET', '선택 가능한 대상이 없습니다.');
    }
  }
  const paid: GameState = {
    ...queuedState,
    players: queuedState.players.map((candidate) => candidate.id !== playerId ? candidate : {
      ...candidate, currentGold: candidate.currentGold - queuedCard.currentCost,
      hand: candidate.hand.filter((entry) => entry.instanceId !== cardInstanceId),
       graveyard: [...candidate.graveyard, resetCardForGraveyard(queuedCard)],
    }),
    events: [...state.events, { type: 'CARD_PLAYED', playerId, cardInstanceId, cardType: card.cardType,
      source: { type: 'PLAYER', playerId }, target: { type: 'CARD', cardInstanceId }, reason: 'PLAY_FROM_HAND',
      tags: card.tags ? [...card.tags] : [] }],
  };
  // Technique-cast abilities are resolved before the technique's own effects.
  const listenerResolved = resolveRegisteredRuleListeners(
    paid,
    'TECHNIQUE_PLAYED',
    playerId,
    cardInstanceId,
    'TECHNIQUE',
  );
  const spellListeners = (queuedCard.baseCost ?? queuedCard.currentCost) >= 1
    ? queuedPlayer.board.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .reduce((next, source) => resolveTriggeredAbilities(next, playerId, source, 'TECHNIQUE_CAST', {
        playedFromHand: true, baseCost: card.baseCost ?? card.currentCost,
      }), listenerResolved)
    : listenerResolved;
  const resolved = body.length
    ? resolveTriggeredAbilities(spellListeners, playerId, { ...queuedCard, abilities: [{ trigger: 'ACTIVE', effects: body }] }, 'ACTIVE')
    : spellListeners;
  return actionSuccess(resolved);
}