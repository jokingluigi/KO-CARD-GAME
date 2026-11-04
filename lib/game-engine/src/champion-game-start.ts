/** Authored start effects have no target picker; generic hand-capacity decisions may suspend them. */
export function isAutomaticChampionStartConfig(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const queue: unknown[] = [value];
  for (let visited = 0; queue.length; visited++) {
    if (visited > 10000) return false;
    const entry = queue.pop();
    if (!entry || typeof entry !== 'object') continue;
    if ('selection' in entry && entry.selection === 'PLAYER_CHOICE') return false;
    queue.push(...Object.values(entry));
  }
  return true;
}
