export type RandomSource = () => number;

export const defaultRandom: RandomSource = () => Math.random();

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