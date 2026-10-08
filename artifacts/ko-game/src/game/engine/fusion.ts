import type { CardInstance } from '../cards/types';
import type { GameState } from '../types/game-state';
import { getActiveCardKeywords } from '../cards/granted-text';
import { appendEffectContinuation, resolvePendingEffects, resolveTriggeredAbilities, resolveStatChangeListeners } from '../effects/effect-engine';
import { checkpointAwakening } from '../champions/awakening';
import { refreshTowerAuras } from '../tower/relics';

export function fusionTargets(state: GameState, playerId: string, sourceId: string): string[] {
  const owner = state.players.find(p => p.id === playerId);
  if (!owner?.board.some(c => c?.instanceId === sourceId)) return [];
  return owner.board.flatMap(c => c && c.instanceId !== sourceId && c.currentHealth > 0 && c.cardType !== 'TECHNIQUE' ? [c.instanceId] : []);
}
export function hasCommittedFusion(frame: GameState["targetingState"]): boolean {
  for (let current = frame; current; current = current.continuation) if (current.fusion && current.fusion.stage !== "CHOOSE") return true;
  return false;
}
export function canPlayFusion(state: GameState, playerId: string, card: CardInstance): boolean {
  return !getActiveCardKeywords(card).includes('FUSION') || Boolean(state.players.find(p => p.id === playerId)?.board.some(c => c && c.currentHealth > 0 && c.cardType !== 'TECHNIQUE'));
}
/** Vanish has no retirement, destruction, graveyard or leave dispatch. */
export function vanishCard(state: GameState, instanceId: string): GameState {
  const owner = state.players.find(p => [...p.board, ...p.hand, ...p.deck, ...p.graveyard, ...p.removedFromGame].some(c => c?.instanceId === instanceId));
  const card = owner && [...owner.board, ...owner.hand, ...owner.deck, ...owner.graveyard, ...owner.removedFromGame].find(c => c?.instanceId === instanceId);
  if (!owner || !card) return state;
  const next: GameState = { ...state, players: state.players.map(p => ({ ...p,
    board: p.board.map(c => c?.instanceId === instanceId ? null : c) as typeof p.board,
    hand: p.hand.filter(c => c.instanceId !== instanceId), deck: p.deck.filter(c => c.instanceId !== instanceId),
    graveyard: p.graveyard.filter(c => c.instanceId !== instanceId), removedFromGame: p.removedFromGame.filter(c => c.instanceId !== instanceId),
  })), events: [...state.events, { type: 'CARD_VANISHED', playerId: owner.id, cardInstanceId: instanceId, cardDefinitionId: card.definitionId,
    cardType: card.cardType, boardSlot: card.boardSlot ?? undefined, source: { type: 'SYSTEM' }, target: { type: 'CARD', cardInstanceId: instanceId }, reason: 'VANISH' }] };
  return checkpointAwakening(state, refreshTowerAuras(next));
}
export function queueHandFusion(state: GameState, rollback: GameState, playerId: string, source: CardInstance): GameState {
  const live = state.players.find(p => p.id === playerId)?.board.find(c => c?.instanceId === source.instanceId);
  if (live && !getActiveCardKeywords(live).includes("FUSION")) return state;
  return resolvePendingEffects(appendEffectContinuation(state, {
    active: true, phase: 'POST_COMMIT', playerId, sourceInstanceId: source.instanceId, sourceCard: source,
    effects: [], effectIndex: 0, selectedTargetIds: [], lastTargetIds: [], validTargetIds: [], minTargets: 1, maxTargets: 1,
    mandatory: true, cancelable: true, playRollback: rollback, fusion: { stage: 'CHOOSE' },
  }));
}
export function commitFusion(state: GameState, playerId: string, sourceId: string, targetId: string, continuation?: GameState["targetingState"], forced = false): GameState {
  if (!forced && !fusionTargets(state, playerId, sourceId).includes(targetId)) return state;
  const owner = state.players.find(p => p.id === playerId)!;
  const sourceOwner = forced ? state.players.find(p => p.board.some(c => c?.instanceId === sourceId)) : owner;
  const source = sourceOwner?.board.find(c => c?.instanceId === sourceId);
  const target = owner.board.find(c => c?.instanceId === targetId)!;
  if (!source || !target || sourceId === targetId || source.currentHealth <= 0 || target.currentHealth <= 0 || source.cardType !== "WRESTLER" || target.cardType !== "WRESTLER") return resolvePendingEffects({ ...state, targetingState: continuation });
  const attack = source.currentAttack, health = source.currentHealth;
  const changed = { ...target, currentAttack: target.currentAttack + attack, currentHealth: target.currentHealth + health, maxHealth: target.maxHealth + health,
    fusionCount: (target.fusionCount ?? 0) + 1, fusionSourceIds: [...(target.fusionSourceIds ?? []), source.instanceId],
    statHistory: [...(target.statHistory ?? []), ...(['attack', 'currentHealth', 'maxHealth'] as const).map(stat => ({ stat,
      before: stat === 'attack' ? target.currentAttack : target[stat], after: (stat === 'attack' ? target.currentAttack : target[stat]) + (stat === 'attack' ? attack : health),
      delta: stat === 'attack' ? attack : health, sourceInstanceId: sourceId, sourceDefinitionId: source.definitionId, turnNumber: state.turn, duration: 'PERMANENT' as const }))] };
  const events = [source, target].map(card => ({ type: 'FUSION' as const, playerId: card === source ? sourceOwner!.id : playerId, cardInstanceId: card.instanceId, cardDefinitionId: card.definitionId,
    boardSlot: card.boardSlot ?? undefined, reason: card === source ? 'FUSION_SOURCE' : 'FUSION_TARGET', source: { type: 'CARD' as const, cardInstanceId: sourceId },
    target: { type: 'CARD' as const, cardInstanceId: targetId }, sourceSnapshot: { playerId: sourceOwner!.id, cardInstanceId: sourceId, cardType: 'WRESTLER' as const, boardSlot: source.boardSlot, currentAttack: attack, currentHealth: health },
    targetSnapshot: { playerId, cardInstanceId: targetId, cardType: 'WRESTLER' as const, boardSlot: target.boardSlot } }));
  const transferred: GameState = { ...state, players: state.players.map(p => ({ ...p,
    board: p.board.map(c => c?.instanceId === targetId ? changed : c?.instanceId === sourceId ? { ...c, fusionCount: (c.fusionCount ?? 0) + 1 } : c) as typeof p.board })),
    events: [...state.events, ...(['attack', 'currentHealth', 'maxHealth'] as const).map(stat => ({ type: 'STAT_CHANGED' as const, playerId, cardInstanceId: targetId, source: { type: 'CARD' as const, cardInstanceId: sourceId }, target: { type: 'CARD' as const, cardInstanceId: targetId }, stat, before: stat === 'attack' ? target.currentAttack : target[stat], after: stat === 'attack' ? changed.currentAttack : changed[stat], delta: stat === 'attack' ? attack : health, reason: 'FUSION_STAT_TRANSFER' })), ...events], targetingState: {
      active: true, playerId: sourceOwner!.id, sourceInstanceId: "fusion:" + sourceId + ":" + changed.fusionCount, sourceCard: source, effects: [], effectIndex: 0,
      selectedTargetIds: [], lastTargetIds: [], validTargetIds: [], minTargets: 0, maxTargets: 0, mandatory: true, cancelable: false,
      continuation, fusion: { stage: 'SOURCE', source, target: changed, sourcePlayerId: sourceOwner!.id, targetPlayerId: playerId },
    } };
  return resolvePendingEffects(resolveStatChangeListeners(state, transferred, { sourcePlayerId: playerId, sourceActionType: 'CARD_EFFECT' }));
}
/** Serialized program counter lets nested/manual triggers finish before material removal. */
export function resumeFusion(state: GameState): GameState {
  const frame = state.targetingState!, fusion = frame.fusion!;
  if (fusion.stage === 'BATCH') {
    const [sourceId, ...remainingSourceIds] = fusion.remainingSourceIds ?? [];
    const target = state.players.find(p => p.id === frame.playerId)?.board.find(c => c?.instanceId === fusion.targetInstanceId);
    if (!sourceId || !target || target.currentHealth <= 0) return resolvePendingEffects({ ...state, targetingState: frame.continuation });
    const advanced = { ...frame, fusion: { ...fusion, remainingSourceIds } };
    const source = state.players.flatMap(p => p.board).find(c => c?.instanceId === sourceId && c.currentHealth > 0);
    return source && sourceId !== target.instanceId ? commitFusion(state, frame.playerId, sourceId, target.instanceId, advanced, true)
      : resolvePendingEffects({ ...state, targetingState: advanced });
  }
  if (fusion.stage === 'CHOOSE') {
    const ids = fusionTargets(state, frame.playerId, frame.sourceInstanceId);
    if (!ids.length) return frame.playRollback ?? resolvePendingEffects({ ...state, targetingState: frame.continuation });
    return { ...state, targetingState: { ...frame, validTargetIds: ids } };
  }
  if (fusion.stage === 'VANISH') {
    const resumed = { ...state, targetingState: frame.continuation };
    // A persisted/retried frame must never consume its own fusion recipient.
    return resolvePendingEffects(fusion.source!.instanceId === fusion.target!.instanceId
      ? resumed : vanishCard(resumed, fusion.source!.instanceId));
  }
  const snapshot = fusion.stage === 'SOURCE' ? fusion.source! : fusion.target!;
  const live = state.players.flatMap(p => p.board).find(c => c?.instanceId === snapshot.instanceId) ?? snapshot;
  const advanced = { ...state, targetingState: { ...frame, playerId: fusion.stage === 'SOURCE' ? (fusion.targetPlayerId ?? frame.playerId) : frame.playerId, fusion: { ...fusion, stage: fusion.stage === 'SOURCE' ? 'TARGET' as const : 'VANISH' as const } } };
  const triggered = resolveTriggeredAbilities(advanced, fusion.stage === 'SOURCE' ? (fusion.sourcePlayerId ?? frame.playerId) : (fusion.targetPlayerId ?? frame.playerId), live, 'ON_FUSION', { fusionTargetInstanceId: fusion.target!.instanceId });
  return triggered === advanced ? resolvePendingEffects(advanced) : triggered;
}


/** Effect-only batch: materials already occupy real board slots; hand-fusion legality is unchanged. */
export function queueForcedFusion(state: GameState, playerId: string, target: CardInstance, sourceIds: string[]): GameState {
  return resolvePendingEffects({ ...state, targetingState: {
    active: true, playerId, sourceInstanceId: 'fusion-batch:' + target.instanceId + ':' + state.events.length, sourceCard: target,
    effects: [], effectIndex: 0, selectedTargetIds: [], lastTargetIds: [], validTargetIds: [], minTargets: 0, maxTargets: 0,
    mandatory: true, cancelable: false, fusion: { stage: 'BATCH', targetInstanceId: target.instanceId,
      remainingSourceIds: [...new Set(sourceIds)].filter(id => id !== target.instanceId) },
    continuation: state.targetingState,
  } });
}
