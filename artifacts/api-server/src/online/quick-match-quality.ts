export type MatchExperience = { games: number; wins: number };
export type QueueCandidate = {
  userId: string;
  joinedAt: number;
  experience: MatchExperience;
};
/** A soft preference, not a ranked rating. Waiting gradually widens the pool. */
export function chooseQuickPair<T extends QueueCandidate>(
  entries: T[],
  now = Date.now(),
): [T, T] | null {
  const sorted = [...entries].sort((a, b) => a.joinedAt - b.joinedAt);
  for (const first of sorted) {
    const wait = now - first.joinedAt;
    const candidates = sorted
      .filter((x) => x.userId !== first.userId)
      .filter((x) => {
        if (Math.max(wait, now - x.joinedAt) >= 10000) return true;
        return first.experience.games < 5 === x.experience.games < 5;
      });
    candidates.sort((a, b) => {
      const score = (x: T) => {
        const rate = (s: MatchExperience) => (s.wins + 2) / (s.games + 4);
        return (
          Math.abs(rate(first.experience) - rate(x.experience)) * 100 +
          Math.abs(first.experience.games - x.experience.games) * 0.25
        );
      };
      return score(a) - score(b) || a.joinedAt - b.joinedAt;
    });
    if (candidates[0]) return [first, candidates[0]];
  }
  return null;
}
