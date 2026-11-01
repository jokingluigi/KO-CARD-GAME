/** Presentation configuration only. It never changes a deck or battle rule. */
export type HomeArtPlacement = {
  scale: number;
  x: number;
  y: number;
  flip: boolean;
  fit: "contain" | "cover";
};
export type HomeMenuLayout = {
  version: 1;
  background?: HomeBackgroundPlacement;
  imageId: string | null;
  desktop: HomeArtPlacement;
  mobile: HomeArtPlacement;
};
export type HomeMenuArtwork = HomeMenuLayout & { imageUrl: string | null };
export const defaultHomeMenuLayout = (): HomeMenuLayout => ({
  version: 1,
  imageId: null,
  desktop: { scale: 1, x: 50, y: 50, flip: false, fit: "contain" },
  mobile: { scale: 1, x: 50, y: 50, flip: false, fit: "contain" },
});
export function parseHomeMenuLayout(value: unknown): HomeMenuLayout | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    v.version !== 1 ||
    !(
      v.imageId === null ||
      (typeof v.imageId === "string" &&
        v.imageId.length > 0 &&
        v.imageId.length <= 120)
    )
  )
    return null;
  const placement = (x: unknown): HomeArtPlacement | null => {
    if (!x || typeof x !== "object") return null;
    const p = x as HomeArtPlacement;
    if (
      ![p.scale, p.x, p.y].every(
        (n) => typeof n === "number" && Number.isFinite(n),
      ) ||
      p.scale < 0.25 ||
      p.scale > 3 ||
      p.x < 0 ||
      p.x > 100 ||
      p.y < 0 ||
      p.y > 100 ||
      typeof p.flip !== "boolean" ||
      !["contain", "cover"].includes(p.fit)
    )
      return null;
    return { scale: p.scale, x: p.x, y: p.y, flip: p.flip, fit: p.fit };
  };
  const background =
    v.background === undefined
      ? undefined
      : parseHomeBackgroundPlacement(v.background);
  if (background === null) return null;
  const desktop = placement(v.desktop),
    mobile = placement(v.mobile);
  return desktop && mobile
    ? {
        version: 1,
        imageId: v.imageId as string | null,
        desktop,
        mobile,
        ...(background ? { background } : {}),
      }
    : null;
}

export type HomeBackgroundPlacement = {
  desktop: { x: number; y: number };
  mobile: { x: number; y: number };
};
export const defaultHomeBackgroundPlacement = (): HomeBackgroundPlacement => ({
  desktop: { x: 50, y: 50 },
  mobile: { x: 50, y: 50 },
});
export function parseHomeBackgroundPlacement(
  value: unknown,
): HomeBackgroundPlacement | null {
  if (!value || typeof value !== "object") return null;
  const v = value as HomeBackgroundPlacement;
  for (const device of ["desktop", "mobile"] as const) {
    const p = v[device];
    if (
      !p ||
      ![p.x, p.y].every(
        (n) =>
          typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100,
      )
    )
      return null;
  }
  return {
    desktop: { x: v.desktop.x, y: v.desktop.y },
    mobile: { x: v.mobile.x, y: v.mobile.y },
  };
}
