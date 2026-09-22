import type { AIDeck } from "./ai-decks-client";
import { createDeterministicRandom } from "@/game";

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

export function selectAIOpponentDeck(
  decks: readonly AIDeck[],
  matchId: string,
): AIDeck | undefined {
  const eligible = decks
    .filter((deck) => deck.enabled && deck.isValid && deck.championDefinitionId)
    .sort((left, right) =>
      left.displayOrder - right.displayOrder ||
      left.name.localeCompare(right.name, "ko") ||
      left.id.localeCompare(right.id),
    );
  if (!eligible.length) return undefined;
  const random = createDeterministicRandom(matchId);
  return eligible[Math.floor(random() * eligible.length)];
}