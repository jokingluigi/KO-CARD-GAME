import type { CardInstance } from "@/game";
import type { CardAnimationRect } from "./card-play-animation-utils";

export type AttackImpactLevel =
  | "LIGHT"
  | "NORMAL"
  | "HEAVY"
  | "VERY_HEAVY";

export type AttackDamageImpactLevel =
  | "NONE"
  | "VERY_LIGHT"
  | "LIGHT"
  | "MEDIUM"
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
  damage: number;
  damageImpactLevel: AttackDamageImpactLevel;
  soundKey: string;
};

export function attackImpactLevel(currentAttack: number): AttackImpactLevel {
  if (currentAttack <= 1) return "LIGHT";
  if (currentAttack <= 3) return "NORMAL";
  if (currentAttack <= 5) return "HEAVY";
  return "VERY_HEAVY";
}

export function attackDamageImpactLevel(damage: number): AttackDamageImpactLevel {
  if (damage <= 0) return "NONE";
  if (damage === 1) return "VERY_LIGHT";
  if (damage <= 3) return "LIGHT";
  if (damage <= 5) return "MEDIUM";
  if (damage <= 7) return "HEAVY";
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