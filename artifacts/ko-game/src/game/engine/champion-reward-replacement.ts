import type { CardInstance } from '../cards/types';
import { normalizeCardForZone, resetCardAfterLeavingBoard } from '../cards/zone-state';
import type { GameState } from '../types/game-state';
import { MAX_HAND_SIZE } from '../rules/constants';
import { canEnterTowerField } from '../tower/relics';
import { enterField } from './enter-field';

/** A quest reward owns this choice even when the opponent is taking their turn. */
export function awaitChampionRewardSpace(state: GameState, playerId: string, championId: string, token: CardInstance): GameState {
  const owner = state.players.find(p => p.id === playerId)!;
  const validTargetIds = owner.board.flatMap(c => c && canEnterTowerField({ ...state, players: state.players.map(p => p.id !== playerId ? p : { ...p, board: p.board.map(card => card?.instanceId === c.instanceId ? null : card) as typeof p.board }) }, playerId) ? [c.instanceId] : []);
  // A tower relic can prohibit all entries this turn independently of field space.
  if (!validTargetIds.length) return { ...state, players: state.players.map(p => p.id !== playerId ? p : p.hand.length < MAX_HAND_SIZE
    ? { ...p, hand: [...p.hand, normalizeCardForZone(token, 'HAND')] }
    : { ...p, deck: [normalizeCardForZone(token, 'DECK'), ...p.deck] }) };
  return { ...state, targetingState: {
    active: true, phase: 'POST_COMMIT', playerId, sourceInstanceId: token.instanceId, sourceCard: token,
    effects: [], effectIndex: 0, selectedTargetIds: [], lastTargetIds: [],
    validTargetIds, minTargets: 1, maxTargets: 1,
    mandatory: true, cancelable: false, championRewardReplacement: { championId, token },
    continuation: state.targetingState,
  } };
}

export function selectChampionRewardReplacement(state: GameState, targetId: string): GameState {
  const pending = state.targetingState, reward = pending?.championRewardReplacement;
  if (!pending || !reward || !pending.validTargetIds.includes(targetId)) return state;
  const owner = state.players.find(p => p.id === pending.playerId);
  const card = owner?.board.find(c => c?.instanceId === targetId);
  if (!owner || !card || card.boardSlot === null || owner.champion?.id !== reward.championId) return state;
  const destination = owner.hand.length < MAX_HAND_SIZE ? 'HAND' : 'DECK';
  const returned = normalizeCardForZone(resetCardAfterLeavingBoard(card, state.cardPool?.find(d => d.id === card.definitionId)), destination);
  const next: GameState = { ...state, targetingState: pending.continuation,
    players: state.players.map(p => p.id !== owner.id ? p : { ...p,
      ...(reward.token.awakening && p.champion?.awakening ? { champion: { ...p.champion, awakening: {
        ...p.champion.awakening, activeStageInstanceId: reward.token.instanceId, pendingStage: false, championInvulnerable: true,
      } } } : {}),
      board: p.board.map(c => c?.instanceId === targetId ? null : c) as typeof p.board,
      hand: destination === 'HAND' ? [...p.hand, returned] : p.hand,
      deck: destination === 'DECK' ? [returned, ...p.deck] : p.deck,
    }),
    events: [...state.events, { type: 'CARD_REMOVED', playerId: owner.id, cardInstanceId: targetId, cardType: card.cardType,
      boardSlot: card.boardSlot, source: { type: 'CHAMPION', championId: reward.championId },
      target: { type: 'CARD', cardInstanceId: targetId }, reason: 'CHAMPION_REWARD_RETURN_' + destination }],
  };
  return enterField(next, owner.id, reward.token, card.boardSlot,
    { type: 'CHAMPION', championId: reward.championId }, undefined, 'CHAMPION_DEPLOY');
}

export function findAwakeningRewardFrame(frame: GameState['targetingState'], sequenceId: string, stage: string): GameState['targetingState'] {
  for (let current = frame; current; current = current.continuation) {
    const card = current.championRewardReplacement?.token;
    if (card?.awakening?.sequenceId === sequenceId && card.awakening.stage === stage) return current;
  }
  return undefined;
}
export function removeRewardFrame(frame: GameState['targetingState'], target: GameState['targetingState']): GameState['targetingState'] {
  if (!frame || frame === target) return frame?.continuation;
  return { ...frame, continuation: removeRewardFrame(frame.continuation, target) };
}
