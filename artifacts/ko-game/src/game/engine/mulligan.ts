import { normalizeCardForZone } from '../cards/zone-state';
import type { GameState } from '../types/game-state';
import { actionFailure, actionSuccess, type ActionResult } from '../actions/types';

/** The opening exchange is available until the player's first committed action. */
export function canMulligan(state: GameState, playerId: string): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (state.status !== 'IN_PROGRESS' || !player || player.mulliganUsed || state.targetingState?.active) return false;
  if (state.openingMulligan) return true;
  if (state.activePlayerId !== playerId || player.personalTurn !== 1) return false;
  const turnStart = state.events.reduce((last, event, index) =>
    event.type === 'TURN_STARTED' && event.playerId === playerId ? index : last, -1);
  return !state.events.slice(turnStart + 1).some((event) =>
    event.playerId === playerId && (event.type === 'CARD_PLAYED' || event.type === 'ATTACK_DECLARED' ||
      event.type === 'CHAMPION_ABILITY_USED' || event.type === 'MULLIGAN_COMPLETED'));
}

export function mulligan(state: GameState, playerId: string, cardInstanceIds: string[]): ActionResult {
  if (!canMulligan(state, playerId)) return actionFailure(state, 'NOT_YOUR_TURN', '첫 턴 행동 전에만 손패를 교체할 수 있습니다.');
  const player = state.players.find((candidate) => candidate.id === playerId)!;
  const selected = new Set(cardInstanceIds);
  if (selected.size !== cardInstanceIds.length || selected.size > player.deck.length ||
      cardInstanceIds.some((id) => !player.hand.some((card) => card.instanceId === id))) {
    return actionFailure(state, 'CARD_NOT_IN_HAND', '교체할 카드를 다시 선택해 주세요.');
  }
  const exchanged = player.hand.filter((card) => selected.has(card.instanceId));
  const replacements = player.deck.slice(0, exchanged.length).map((card) => normalizeCardForZone(card, 'HAND'));
  const players = state.players.map((candidate) => candidate.id !== playerId ? candidate : {
      ...candidate,
      mulliganUsed: true,
      hand: [...candidate.hand.filter((card) => !selected.has(card.instanceId)), ...replacements],
      deck: [...candidate.deck.slice(exchanged.length), ...exchanged.map((card) => normalizeCardForZone(card, 'DECK'))],
    });
  return actionSuccess({
    ...state,
    openingMulligan: state.openingMulligan && !players.every((candidate) => candidate.mulliganUsed),
    players,
    events: [...state.events, {
      type: 'MULLIGAN_COMPLETED', playerId, amount: exchanged.length,
      source: { type: 'PLAYER', playerId }, target: { type: 'PLAYER', playerId },
    }],
  });
}
