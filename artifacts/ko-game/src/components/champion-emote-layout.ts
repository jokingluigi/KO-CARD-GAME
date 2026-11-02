/** Keep transient emotes inside the portrait's decorative window, away from HP, gold and controls. */
export function championEmoteLayout(
  rect: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
  self: boolean,
) {
  const size = Math.max(
    40,
    Math.min(
      viewport.width < 600 ? 88 : 112,
      rect.width * 0.65,
      rect.height * 0.6,
    ),
  );
  const left = Math.max(
    6,
    Math.min(
      viewport.width - size - 6,
      self ? rect.left + rect.width - size - 6 : rect.left + 6,
    ),
  );
  const top = Math.max(
    6,
    Math.min(viewport.height - size - 6, rect.top + rect.height - size - 6),
  );
  return { left, top, size, tail: self ? "left" : "right" };
}
