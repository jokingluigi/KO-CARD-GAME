import { finisherDamage } from '../components/finisher-scale';
/** Select the impact by damage actually dealt, not the attacker's printed attack. */
export function combatHitSound(damage: number, finishingBlow = false): string | null {
  if (damage <= 0) return null;
  // A finishing blow sounds one tier up; only a 10+ finishing blow gets the finisher boom.
  const scaled = finisherDamage(damage, finishingBlow);
  const tier = scaled.top ? 'finisher' : scaled.damage <= 2 ? '1-2' : scaled.damage <= 5 ? '3-5' : scaled.damage <= 9 ? '6-9' : '10-plus';
  return `${import.meta.env.BASE_URL}sfx/combat-${tier === 'finisher' ? 'finisher' : `hit-${tier}`}.wav?v=1`;
}
