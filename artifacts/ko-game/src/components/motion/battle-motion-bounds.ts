/** Decorative movement only; original target rectangles never move. */
export function boundPortraitFrames(
  frames: Keyframe[],
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  },
  viewport: { width: number; height: number },
): Keyframe[] {
  const cap = Math.min(48, Math.max(6, rect.height * 0.18)),
    clamp = (v: number, min: number, max: number) =>
      Math.max(min, Math.min(max, v));
  const left = Math.max(-cap, Math.min(0, 4 - rect.left)),
    right = Math.min(cap, Math.max(0, viewport.width - 4 - rect.right)),
    top = Math.max(-cap, Math.min(0, 4 - rect.top)),
    bottom = Math.min(cap, Math.max(0, viewport.height - 4 - rect.bottom));
  return frames.map((frame) => ({
    ...frame,
    transform:
      typeof frame.transform === "string"
        ? frame.transform.replace(
            /translate\((-?[\d.]+)px,(-?[\d.]+)px\)/,
            (_, x, y) =>
              `translate(${clamp(Number(x), left, right)}px,${clamp(Number(y), top, bottom)}px)`,
          )
        : frame.transform,
  }));
}
