import type { CardInstance } from "@/game";

export type CardAnimationRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CardPlayGeometry = {
  source: CardAnimationRect;
  target?: CardAnimationRect;
};

export type LandingImpactLevel = "LIGHT" | "NORMAL" | "HEAVY" | "VERY_HEAVY";

export type CardPlayAnimationState =
  | {
      kind: "WRESTLER";
      card: CardInstance;
      geometry: CardPlayGeometry & { target: CardAnimationRect };
      impactLevel: LandingImpactLevel;
    }
  | {
      kind: "TECHNIQUE";
      card: CardInstance;
      geometry: CardPlayGeometry;
    };

export function rectSnapshot(rect: DOMRect): CardAnimationRect {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function landingImpactLevel(baseCost: number | undefined, currentCost: number): LandingImpactLevel {
  const cost = Math.max(0, baseCost ?? currentCost);
  if (cost <= 1) return "LIGHT";
  if (cost <= 3) return "NORMAL";
  if (cost <= 5) return "HEAVY";
  return "VERY_HEAVY";
}