export type FocusRect = { x: number; y: number; width: number; height: number };
/** Visible portion only: never cut a bright hole over a clipped/offscreen card. */
export function clipFocusRect(
  rect: FocusRect,
  clip: FocusRect,
): FocusRect | null {
  const x = Math.max(rect.x, clip.x),
    y = Math.max(rect.y, clip.y);
  const right = Math.min(rect.x + rect.width, clip.x + clip.width),
    bottom = Math.min(rect.y + rect.height, clip.y + clip.height);
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}
