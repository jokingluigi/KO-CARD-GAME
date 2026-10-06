import type { CardInstance } from './types';
import { getActiveCardKeywords } from './granted-text';
import { configuredCountdownTurns } from '@workspace/effect-registry';

export function startCountdown(card: CardInstance, turn: number): CardInstance {
  if (!getActiveCardKeywords(card).includes('COUNTDOWN')) return clearCountdown(card);
  const turns = configuredCountdownTurns({countdownTurns:card.grantedText?.keywords.includes('COUNTDOWN')
    ? card.grantedText.countdownTurns : card.countdownTurns});
  return {...card,countdownRemaining:turns,countdownResolved:false,countdownLastTickTurn:turn};
}

export function clearCountdown(card: CardInstance): CardInstance {
  return {...card,countdownRemaining:undefined,countdownResolved:undefined,countdownLastTickTurn:undefined};
}
