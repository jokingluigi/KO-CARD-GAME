import type { GameState } from '../../../artifacts/ko-game/src/game/types/game-state';
import type { GameEvent } from '../../../artifacts/ko-game/src/game/events/types';
import { questEventRegistry } from './quest-conditions';

export type ChampionQuestCondition =
  | { type: 'EVENT'; event: string; owner: 'SELF' | 'ENEMY'; required: number; cardType?: 'WRESTLER' | 'TECHNIQUE' }
  | { type: 'TURN'; turn: number }
  | { type: 'HEALTH'; owner: 'SELF' | 'ENEMY'; op: 'LTE' | 'LT' | 'GTE' | 'GT' | 'EQ'; value: number }
  | { type: 'ALL' | 'ANY'; conditions: ChampionQuestCondition[] };

export function validChampionQuestCondition(input: unknown, depth = 0): input is ChampionQuestCondition {
  if (!input || typeof input !== 'object' || Array.isArray(input) || depth > 4) return false;
  const n = input as Record<string, unknown>;
  const integer = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
  const keys = (allowed: string[]) => Object.keys(n).every(k => allowed.includes(k));
  if (n.type === 'ALL' || n.type === 'ANY') return keys(['type', 'conditions']) && Array.isArray(n.conditions) && n.conditions.length > 0 && n.conditions.length <= 8 && n.conditions.every(c => validChampionQuestCondition(c, depth + 1));
  if (n.type === 'TURN') return keys(['type', 'turn']) && integer(n.turn, 1, 999);
  if (n.type === 'HEALTH') return keys(['type', 'owner', 'op', 'value']) && ['SELF', 'ENEMY'].includes(n.owner as string) && ['LTE', 'LT', 'GTE', 'GT', 'EQ'].includes(n.op as string) && integer(n.value, 0, 999);
  return n.type === 'EVENT' && keys(['type', 'event', 'owner', 'required', 'cardType']) && typeof n.event === 'string' && Object.hasOwn(questEventRegistry(), n.event) && !n.event.startsWith('CHAMPION_QUEST_') && ['SELF', 'ENEMY'].includes(n.owner as string) && integer(n.required, 1, 999) && (n.cardType === undefined || ['WRESTLER', 'TECHNIQUE'].includes(n.cardType as string));
}

/** Event leaves remember accumulated counts; state leaves inspect the current state. */
export function evaluateChampionQuestCondition(condition: ChampionQuestCondition, state: GameState, playerId: string, events: GameEvent[], previous: Record<string, number> = {}) {
  const counts = { ...previous };
  const visit = (node: ChampionQuestCondition, path: string): boolean => {
    if (node.type === 'ALL' || node.type === 'ANY') {
      const results = node.conditions.map((child, index) => visit(child, `${path}.${index}`));
      return node.type === 'ALL' ? results.every(Boolean) : results.some(Boolean);
    }
    if (node.type === 'TURN') return state.turn >= node.turn;
    if (node.type === 'HEALTH') {
      const player = state.players.find(p => node.owner === 'SELF' ? p.id === playerId : p.id !== playerId);
      if (!player) return false;
      return node.op === 'LTE' ? player.health <= node.value : node.op === 'LT' ? player.health < node.value : node.op === 'GTE' ? player.health >= node.value : node.op === 'GT' ? player.health > node.value : player.health === node.value;
    }
    if (node.type !== 'EVENT') return false;
    counts[path] = Math.min(node.required, (counts[path] ?? 0) + events.filter(e => e.type === node.event && (node.owner === 'SELF' ? e.playerId === playerId : Boolean(e.playerId && e.playerId !== playerId)) && (!node.cardType || e.cardType === node.cardType)).length);
    return counts[path]! >= node.required;
  };
  return { completed: visit(condition, 'root'), counts };
}
