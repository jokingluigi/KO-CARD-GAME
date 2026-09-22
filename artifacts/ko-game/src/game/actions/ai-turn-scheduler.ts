import { chooseBestAction } from './ai-evaluator';
import { executeAction, getLegalActions } from './engine-actions';
import type { GameAction } from './types';
import type { GameState } from '../types/game-state';

export const AI_ACTION_DELAY_MS = 320;
export const AI_MAX_DECISIONS_PER_TURN = 50;

export interface AITurnSchedulerOptions {
  wait: (milliseconds: number) => Promise<void>;
  waitForPresentationIdle: () => Promise<void>;
  isCancelled: () => boolean;
  onState: (state: GameState) => void;
  actionDelayMs?: number;
  maxDecisions?: number;
}

/**
 * Runs one AI turn through the same legal-action and dispatcher boundary as
 * human actions. Presentation is allowed to pause the next decision, but it
 * never owns or cancels the canonical turn resolution.
 */
export async function runAITurn(
  initialState: GameState,
  playerId: string,
  options: AITurnSchedulerOptions,
): Promise<GameState> {
  let workingState = initialState;
  const delay = options.actionDelayMs ?? AI_ACTION_DELAY_MS;
  const maxDecisions = options.maxDecisions ?? AI_MAX_DECISIONS_PER_TURN;

  for (let decision = 0; decision < maxDecisions; decision += 1) {
    if (
      options.isCancelled() ||
      workingState.status !== 'IN_PROGRESS' ||
      workingState.activePlayerId !== playerId
    ) {
      break;
    }

    const legalActions = getLegalActions(workingState, playerId);
    if (!legalActions.length) {
      // A pending choice is a real action block. Never convert it into an
      // END_TURN, even if a malformed/stale frame exposes no target IDs.
      if (workingState.targetingState?.active) break;
      const ended = executeAction(workingState, { type: 'END_TURN', playerId });
      if (!ended.success) break;
      workingState = ended.state;
      options.onState(workingState);
      return workingState;
    }

    const action = chooseBestAction(workingState, legalActions, playerId);
    await options.wait(0);
    await options.waitForPresentationIdle();
    await options.wait(delay);
    if (options.isCancelled()) break;

    const result = executeAction(workingState, action);
    if (!result.success) break;
    workingState = result.state;
    options.onState(workingState);
    if (workingState.status === 'FINISHED') return workingState;
  }

  if (
    !options.isCancelled() &&
    workingState.status === 'IN_PROGRESS' &&
    workingState.activePlayerId === playerId &&
    !workingState.targetingState?.active
  ) {
    await options.waitForPresentationIdle();
    await options.wait(delay);
    if (!options.isCancelled()) {
      const ended = executeAction(workingState, { type: 'END_TURN', playerId });
      if (ended.success) {
        workingState = ended.state;
        options.onState(workingState);
      }
    }
  }

  return workingState;
}