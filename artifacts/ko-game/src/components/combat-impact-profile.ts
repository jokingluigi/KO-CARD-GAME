/** Milliseconds on the presentation clock; never used by the turn timer or engine. */
const IMPACT_TIMINGS = {
  BLOCK: [430, 180, 0],
  LIGHT: [480, 190, 35],
  NORMAL: [520, 210, 60],
  HEAVY: [580, 230, 90],
  MASSIVE: [640, 250, 125],
  FINISHER: [760, 300, 140],
} as const;

/** Raw attack affects anticipation; confirmed damage controls the contact response. */
export function combatImpactProfile(attack: number, damage: number, finisher = false) {
  const dealt = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  const power = Number.isFinite(attack) ? Math.max(0, attack) : 0;
  const tier = dealt === 0 ? 'BLOCK'
    : finisher ? 'FINISHER'
    : dealt >= 10 ? 'MASSIVE'
    : dealt >= 6 ? 'HEAVY'
    : dealt >= 3 ? 'NORMAL'
    : 'LIGHT';
  const [duration, baseContact, hitstop] = IMPACT_TIMINGS[tier];
  // Armor can stop a high-power attack: retain its windup without a false heavy hit.
  const contact = baseContact + Math.min(15, Math.floor(power / 4) * 5);
  return { tier, duration, contact, hitstop };
}
