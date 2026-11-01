export const TOUCH_INTENT = {
  distance: 10,
  scrollRatio: 1.25,
  holdSlop: 10,
  holdMs: 550,
} as const;
/** Commit one intent; a horizontal hand swipe must not turn into a card drop later. */
export function handGestureIntent(
  dx: number,
  dy: number,
  touch: boolean,
): "WAIT" | "SCROLL" | "DRAG" {
  if (Math.hypot(dx, dy) < TOUCH_INTENT.distance) return "WAIT";
  if (touch && Math.abs(dx) > Math.abs(dy) * TOUCH_INTENT.scrollRatio)
    return "SCROLL";
  return "DRAG";
}
