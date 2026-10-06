export const PRESENTATION_CONFIG = {
  cardPlayMs: 320,
  lightLandingMs: 260,
  heavyLandingMs: 360,
  veryHeavyLandingMs: 400,
  techniqueRevealMs: 400,
  attackWindupMs: 110,
  attackLungeMs: 260,
  attackHitStopMs: {
    NONE: 0,
    VERY_LIGHT: 30,
    LIGHT: 30,
    MEDIUM: 52,
    HEAVY: 76,
    VERY_HEAVY: 115,
  },
  damageNumberMs: 320,
  retireMs: 360,
  destroyMs: 360,
  removeMs: 280,
  summonMs: 420,
  drawMs: 260,
} as const;

export type PresentationDamageTier = keyof typeof PRESENTATION_CONFIG.attackHitStopMs;

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}
