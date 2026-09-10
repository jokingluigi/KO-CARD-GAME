export type RandomSource = () => number;

export const defaultRandom: RandomSource = () => Math.random();

function hashSeed(seed: number | string): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Serializable, repeatable RNG for game actions that must not use Math.random. */
export function createDeterministicRandom(seed: number | string): RandomSource {
  let state = hashSeed(seed) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822519);
    state = Math.imul(state ^ (state >>> 13), 3266489917);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(
  items: readonly T[],
  random: RandomSource = defaultRandom,
): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [
      shuffled[targetIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}