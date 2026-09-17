export const PRESENTATION_CONFIG = {
  cardPlayMs: 480,
  lightLandingMs: 420,
  heavyLandingMs: 540,
  veryHeavyLandingMs: 580,
  techniqueRevealMs: 2200,
  attackWindupMs: 110,
  attackLungeMs: 260,
  attackHitStopMs: {
    NONE: 0,
    VERY_LIGHT: 0,
    LIGHT: 0,
    MEDIUM: 30,
    HEAVY: 55,
    VERY_HEAVY: 80,
  },
  damageNumberMs: 320,
  retireMs: 440,
  destroyMs: 360,
  removeMs: 280,
  summonMs: 420,
  drawMs: 260,
} as const;

export type PresentationDamageTier = keyof typeof PRESENTATION_CONFIG.attackHitStopMs;

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}