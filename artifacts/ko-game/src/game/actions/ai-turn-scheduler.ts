import { chooseBestAction, type AIDifficulty } from './ai-evaluator';
import { executeAction, getLegalActions } from './engine-actions';
import type { GameAction } from './types';
import type { GameState } from '../types/game-state';
import type { ChampionEmote } from '../champions/types';

export const AI_ACTION_DELAY_MS = 1100;
export const AI_MAX_DECISIONS_PER_TURN = 50;

export function situationalAiEmote(state: GameState, playerId: string, eventStart = 0): ChampionEmote | null {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player?.champion) return null;
  const turnStart = state.events.reduce((last, event, index) =>
    event.type === 'TURN_STARTED' && event.playerId === playerId ? index : last, -1);
  if (state.events.slice(turnStart + 1).some((event) => event.type === 'CHAMPION_EMOTE' && event.playerId === playerId)) return null;
  const recent = state.events.slice(eventStart);
  if (recent.some((event) => event.type === 'CHAMPION_QUEST_COMPLETED' && event.playerId === playerId)) return 'THANKS';
  if (recent.some((event) => event.type === 'CARD_RETIRED' && event.playerId !== playerId)) return 'WELL_PLAYED';
  if (recent.some((event) => event.type === 'DAMAGE_DEALT' && event.target?.type === 'PLAYER' && event.target.playerId !== playerId)) return 'THREATEN';
  if (player.health <= Math.ceil(player.maxHealth / 4)) return 'OOPS';
  if (player.personalTurn === 1) return 'HELLO';
  return null;
}

export interface AITurnSchedulerOptions {
  wait: (milliseconds: number) => Promise<void>;
  waitForPresentationIdle: () => Promise<void>;
  isCancelled: () => boolean;
  onState: (state: GameState) => void;
  /** Read the committed state again after an asynchronous presentation pause. */
  getState?: () => GameState;
  onAction?: (action: GameAction) => void;
  difficulty?: AIDifficulty;
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
  const refresh = () => { workingState = options.getState?.() ?? workingState; };
  const ownsDecision = () => workingState.gameId === initialState.gameId &&
    workingState.status === 'IN_PROGRESS' &&
    (workingState.targetingState?.active ? workingState.targetingState.playerId === playerId : workingState.activePlayerId === playerId);
  if (workingState.targetingState?.active && workingState.targetingState.validTargetIds.length === 0) return workingState;

  const greet = workingState.targetingState?.active ? null : situationalAiEmote(workingState, playerId, workingState.events.length);
  if (greet) {
    const spoken = executeAction(workingState, { type: 'EMOTE', playerId, emote: greet });
    if (spoken.success) { workingState = spoken.state; options.onAction?.({ type: 'EMOTE', playerId, emote: greet }); options.onState(workingState); }
  }

  for (let decision = 0; decision < maxDecisions; decision += 1) {
    refresh();
    if (
      options.isCancelled() ||
      !ownsDecision()
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
      options.onAction?.({ type: 'END_TURN', playerId });
      options.onState(workingState);
      return workingState;
    }

    await options.wait(0);
    await options.waitForPresentationIdle();
    await options.wait(delay);
    if (options.isCancelled()) break;
    // A human emote, surrender or timeout can commit while the AI waits.
    // Never overwrite that state with the pre-pause copy: generation IDs and
    // replay depend on the complete, ordered event history.
    refresh();
    if (!ownsDecision()) break;
    const currentActions = getLegalActions(workingState, playerId);
    if (!currentActions.length) break;
    const action = chooseBestAction(workingState, currentActions, playerId, options.difficulty);

    const eventStart = workingState.events.length;
    const result = executeAction(workingState, action);
    if (!result.success) break;
    workingState = result.state;
    options.onAction?.(action);
    options.onState(workingState);
    if (!workingState.targetingState?.active) {
      const emote = situationalAiEmote(workingState, playerId, eventStart);
      if (emote) {
        const spoken = executeAction(workingState, { type: 'EMOTE', playerId, emote });
        if (spoken.success) { workingState = spoken.state; options.onAction?.({ type: 'EMOTE', playerId, emote }); options.onState(workingState); }
      }
    }
    if (workingState.status === 'FINISHED') return workingState;
  }

  refresh();
  if (
    !options.isCancelled() &&
    ownsDecision() &&
    !workingState.targetingState?.active
  ) {
    await options.waitForPresentationIdle();
    await options.wait(delay);
    refresh();
    if (!options.isCancelled() && ownsDecision() && !workingState.targetingState?.active) {
      const ended = executeAction(workingState, { type: 'END_TURN', playerId });
      if (ended.success) {
        workingState = ended.state;
        options.onAction?.({ type: 'END_TURN', playerId });
        options.onState(workingState);
      }
    }
  }

  return workingState;
}
