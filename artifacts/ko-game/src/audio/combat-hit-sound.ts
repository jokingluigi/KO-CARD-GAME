/** Select the impact by damage actually dealt, not the attacker's printed attack. */
export function combatHitSound(damage: number, finishingBlow = false): string | null {
  if (damage <= 0) return null;
  const tier = finishingBlow ? 'finisher' : damage <= 2 ? '1-2' : damage <= 5 ? '3-5' : damage <= 9 ? '6-9' : '10-plus';
  return `${import.meta.env.BASE_URL}sfx/combat-${tier === 'finisher' ? 'finisher' : `hit-${tier}`}.wav?v=1`;
}
