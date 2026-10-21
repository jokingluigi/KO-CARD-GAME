export {selectAIOpponentDeck} from '@workspace/game-engine';

export function createLocalAIMatchId(): string {
  return `ai-${crypto.randomUUID()}`;
}

export function seedForAIMatch(matchId: string): number {
  let hash = 2166136261;
  for (const character of matchId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
