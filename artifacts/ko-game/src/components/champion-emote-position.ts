export function championEmotePosition(anchor: { left: number; top: number }, viewport: { width: number; height: number; offsetLeft?: number; offsetTop?: number }, measuredHeight = 164) {
  const x = viewport.offsetLeft ?? 0, y = viewport.offsetTop ?? 0;
  const width = Math.max(0, Math.min(240, viewport.width - 16));
  const height = Math.max(0, Math.min(measuredHeight, viewport.height - 16));
  const left = Math.max(x + 8, Math.min(anchor.left, x + viewport.width - width - 8));
  const top = Math.max(y + 8, Math.min(anchor.top - height - 8, y + viewport.height - height - 8));
  return { left, top, width, maxHeight: Math.max(0, y + viewport.height - top - 8) };
}
