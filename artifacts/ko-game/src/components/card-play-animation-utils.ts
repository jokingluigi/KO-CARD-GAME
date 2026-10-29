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

/** Keep public spell art and rules fully inside narrow and landscape viewports. */
export function techniqueStageGeometry(source: CardAnimationRect, viewport: {width:number;height:number}) {
  const scale=Math.max(.2,Math.min(1.8,(viewport.width-40)/Math.max(1,source.width),(viewport.height*.66)/Math.max(1,source.height)));
  return {scale,left:(viewport.width-source.width*scale)/2,top:(viewport.height-source.height*scale)/2};
}

export type CardPlayAnimationState =
  | {
      kind: "WRESTLER";
      card: CardInstance;
      geometry: CardPlayGeometry & { target: CardAnimationRect };
      impactLevel: LandingImpactLevel;
      playerId?: string;
    }
  | {
      kind: "TECHNIQUE";
      card: CardInstance;
      geometry: CardPlayGeometry;
      playerId?: string;
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

export function techniqueRevealRect(source: CardAnimationRect): CardAnimationRect {
  // Hidden opponent hands expose a wide row, not an individual card rectangle.
  const width = Math.min(180, Math.max(120, source.width));
  const height = width * (1484 / 1060);
  return {
    left: source.left + (source.width - width) / 2,
    top: source.top + (source.height - height) / 2,
    width,
    height,
  };
}

/** A hidden hand is a row, so animate a portrait card centred in that row. */
export function wrestlerPlayRect(source: CardAnimationRect): CardAnimationRect {
  const width = Math.min(180, Math.max(72, source.height / (1484 / 1060)));
  const height = width * (1484 / 1060);
  return { left: source.left + (source.width - width) / 2,
    top: source.top + (source.height - height) / 2, width, height };
}

/** Shares the flight clock, so the shadow spreads exactly at landing. */
export function summonShadowFrames(landing:number,duration:number,reduced:boolean):Keyframe[] {
  if(reduced)return [{opacity:0},{opacity:.25,offset:.4},{opacity:0}];
  const contact=Math.max(.1,Math.min(.85,landing/Math.max(1,duration)));
  return [
    {opacity:0,transform:'scale(1.25,.7)',offset:0},
    {opacity:.18,transform:'scale(.65,.8)',offset:contact*.85},
    {opacity:.4,transform:'scale(1.12,1)',offset:contact},
    {opacity:.22,transform:'scale(1,1)',offset:Math.min(.98,contact+.1)},
    {opacity:0,transform:'scale(1,1)',offset:1},
  ];
}
