import type { CardInstance } from "@/game";
import type { CardAnimationRect } from "./card-play-animation-utils";

export type AttackImpactLevel =
  | "LIGHT"
  | "NORMAL"
  | "HEAVY"
  | "VERY_HEAVY";

export type AttackAnimationState = {
  attacker: CardInstance;
  target: CardInstance | null;
  targetKind: "CARD" | "CHAMPION";
  geometry: {
    source: CardAnimationRect;
    target: CardAnimationRect;
  };
  currentAttack: number;
  impactLevel: AttackImpactLevel;
  soundKey: string;
};

export function attackImpactLevel(currentAttack: number): AttackImpactLevel {
  if (currentAttack <= 1) return "LIGHT";
  if (currentAttack <= 3) return "NORMAL";
  if (currentAttack <= 5) return "HEAVY";
  return "VERY_HEAVY";
}

export function attackAnimationDuration(currentAttack: number) {
  if (currentAttack <= 1) return 500;
  if (currentAttack <= 3) return 540;
  if (currentAttack <= 5) return 580;
  if (currentAttack <= 7) return 620;
  return 660;
}

export function attackSoundPitch(currentAttack: number) {
  return currentAttack >= 8 ? 1.06 : currentAttack >= 6 ? 1.03 : 1;
}