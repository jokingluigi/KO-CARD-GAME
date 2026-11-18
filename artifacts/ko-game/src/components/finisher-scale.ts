/**
 * A match-ending blow reads one tier stronger than the damage it deals, never more.
 * A 1-damage finishing poke must not crack the board or boom like a giant hit; only a
 * finishing blow of 10+ damage gets the full finisher treatment. Visual/audio only.
 */
export function finisherDamage(damage: number, finisher = false): { damage: number; top: boolean } {
  const dealt = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  if (!finisher || dealt <= 0) return { damage: dealt, top: false };
  return { damage: dealt >= 10 ? dealt : dealt >= 6 ? 10 : dealt >= 3 ? 6 : 3, top: dealt >= 10 };
}
