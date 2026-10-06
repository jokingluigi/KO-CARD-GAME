import type { CardInstance } from '../cards/types';
import { getActiveCardKeywords } from '../cards/granted-text';
import type { GameEvent } from '../events/types';
import type { GameState } from '../types/game-state';

export function wantedSourceOwner(state: GameState, sourceInstanceId?: string): string | undefined {
  if (!sourceInstanceId) return undefined;
  return state.players.find(player => [...player.board, ...player.hand, ...player.deck, ...player.graveyard]
    .some(card => card?.instanceId === sourceInstanceId))?.id;
}

/** Combat may retire both participants, so use each target's own causal event. */
export function wantedRemovalActor(state: GameState, card: CardInstance, fallback?: string, startIndex = 0): string | undefined {
  for (let index = state.events.length - 1; index >= startIndex; index--) {
    const event: GameEvent = state.events[index];
    if (event.cardInstanceId === card.instanceId && ['ENTER_FIELD', 'CARD_RETIRED', 'CARD_DESTROYED'].includes(event.type)) break;
    if (event.target?.type !== 'CARD' || event.target.cardInstanceId !== card.instanceId) continue;
    const damage = event.type === 'DAMAGE_DEALT' && (event.amount ?? 0) > 0;
    const lethalStat = event.type === 'STAT_CHANGED' && ['health', 'currentHealth'].includes(event.stat ?? '') && (event.after ?? 1) <= 0;
    if (!damage && !lethalStat) continue;
    const owner = event.source?.type === 'CARD' ? wantedSourceOwner(state, event.source.cardInstanceId) : undefined;
    return owner ?? event.sourceSnapshot?.playerId
      ?? (event.reason === 'CARD_EFFECT' && damage ? event.playerId : undefined)
      ?? (lethalStat ? fallback : undefined) ?? event.sourceContext?.sourcePlayerId ?? fallback;
  }
  return fallback;
}

/** Called once at actual removal, before resetting the card or resolving its leave effects. */
export function queueWantedReward(state: GameState, card: CardInstance, ownerId: string, removerId?: string): GameState {
  if (!removerId || removerId === ownerId || !getActiveCardKeywords(card).includes('WANTED')) return state;
  if (!state.players.some(player => player.id === removerId)) return state;
  return { ...state, players: state.players.map(player => player.id === removerId
    ? { ...player, nextTurnGoldBonus: player.nextTurnGoldBonus + 1 } : player) };
}
