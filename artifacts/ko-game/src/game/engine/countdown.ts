import type { GameState } from '../types/game-state';
import { getActiveCardKeywords } from '../cards/granted-text';
import { configuredCountdownTurns } from '@workspace/effect-registry';
import { resolvePendingEffects, resolveTriggeredAbilities } from '../effects/effect-engine';

/** Tick once at the owner's turn start, while the same card is still alive on board. */
export function advanceCountdown(state: GameState, playerId: string, instanceId: string): GameState {
  const card=state.players.find(p=>p.id===playerId)?.board.find(c=>c?.instanceId===instanceId);
  if (state.status!=='IN_PROGRESS' || state.activePlayerId!==playerId || !card || card.currentHealth<=0
    || !getActiveCardKeywords(card).includes('COUNTDOWN') || card.isAbilityDisabled || card.countdownResolved
    || card.countdownLastTickTurn===state.turn || card.enteredOnTurn===state.turn) return state;
  const configured=card.grantedText?.keywords.includes('COUNTDOWN') ? card.grantedText.countdownTurns : card.countdownTurns;
  const remaining=Math.max(0,(card.countdownRemaining ?? configuredCountdownTurns({countdownTurns:configured}))-1);
  const progressed={...card,countdownRemaining:remaining,countdownResolved:remaining===0,countdownLastTickTurn:state.turn};
  const next={...state,players:state.players.map(p=>p.id===playerId?{...p,
    board:p.board.map(c=>c?.instanceId===instanceId?progressed:c) as typeof p.board}:p)};
  if (remaining>0) return next;
  const triggered=resolveTriggeredAbilities(next,playerId,progressed,'COUNTDOWN');
  return triggered.targetingState?.active ? resolvePendingEffects(triggered) : triggered;
}

/** Serializable turn-start queue: target choice must finish before later cards/abilities run. */
export function resumeCountdownTurnStart(state: GameState): GameState {
  let next = state;
  while (next.pendingCountdownTurnStart && !next.targetingState?.active) {
    const pending = next.pendingCountdownTurnStart;
    if (next.status !== 'IN_PROGRESS' || next.turn !== pending.turn || next.activePlayerId !== pending.playerId || !pending.steps.length) {
      return {...next,pendingCountdownTurnStart:undefined};
    }
    const [step,...steps] = pending.steps;
    next = {...next,pendingCountdownTurnStart:{...pending,steps}};
    if (step.trigger === 'COUNTDOWN') {
      next = advanceCountdown(next,pending.playerId,step.instanceId);
    } else {
      const owner = next.players.find(p=>p.id===pending.playerId);
      const card = owner?.board.find(c=>c?.instanceId===step.instanceId) ?? owner?.hand.find(c=>c.instanceId===step.instanceId);
      if (!card) continue;
      next = resolveTriggeredAbilities(next,pending.playerId,card,'TURN_START');
      if (next.targetingState?.active) next = resolvePendingEffects(next);
    }
  }
  return next;
}
