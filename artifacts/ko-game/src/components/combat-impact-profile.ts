import { finisherDamage } from './finisher-scale';
/** Milliseconds on the presentation clock; never used by the turn timer or engine. */
const IMPACT_TIMINGS = {
  // [total, contact, hit-stop]. Contact leaves room for the card to lift toward the
  // camera and hang before it slams down; hit-stop is the frozen beat that sells the weight.
  BLOCK: [560, 290, 0],
  LIGHT: [600, 290, 50],
  NORMAL: [680, 320, 85],
  HEAVY: [780, 355, 130],
  MASSIVE: [880, 385, 175],
  FINISHER: [1020, 440, 230],
} as const;

/** Raw attack affects anticipation; confirmed damage controls the contact response. */
export function combatImpactProfile(attack: number, damage: number, finisher = false) {
  const dealt = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  const power = Number.isFinite(attack) ? Math.max(0, attack) : 0;
  const scaled = finisherDamage(dealt, finisher);
  const tier = dealt === 0 ? 'BLOCK'
    : scaled.top ? 'FINISHER'
    : scaled.damage >= 10 ? 'MASSIVE'
    : scaled.damage >= 6 ? 'HEAVY'
    : scaled.damage >= 3 ? 'NORMAL'
    : 'LIGHT';
  const [duration, baseContact, hitstop] = IMPACT_TIMINGS[tier];
  // Armor can stop a high-power attack: retain its windup without a false heavy hit.
  const contact = baseContact + Math.min(15, Math.floor(power / 4) * 5);
  return { tier, duration, contact, hitstop };
}
