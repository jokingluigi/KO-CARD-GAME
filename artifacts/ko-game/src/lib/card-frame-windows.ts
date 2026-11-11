export type FrameRegion = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export type DetectedFrameWindows = {
  name?: { left: number; right: number; top: number; height: number };
  rules?: FrameRegion;
  cost: { centerX: number; centerY: number; size: number };
  attack?: { centerX: number; centerY: number; size: number };
  health?: { centerX: number; centerY: number; size: number };
  opaqueArtWindow?: FrameRegion;
};
type Region = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  area: number;
  opaque: number;
  ratio: number;
};
/** Read the empty windows bounded by a registered frame's borders, independent of rarity. */
export function detectFrameWindows(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): DetectedFrameWindows | null {
  if (width < 20 || height < 20 || data.length !== width * height * 4)
    return null;
  const count = width * height,
    mask = new Uint8Array(count),
    seen = new Uint8Array(count),
    queue = new Int32Array(count),
    regions: Region[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    mask[i] =
      data[o + 3] < 40 || Math.max(data[o], data[o + 1], data[o + 2]) < 38
        ? 1
        : 0;
  }
  for (let i = 0; i < count; i++) {
    if (!mask[i] || seen[i]) continue;
    let head = 0,
      tail = 1,
      minX = width,
      maxX = 0,
      minY = height,
      maxY = 0,
      sumX = 0,
      sumY = 0,
      opaque = 0;
    queue[0] = i;
    seen[i] = 1;
    const push = (n: number) => {
      if (!seen[n] && mask[n]) {
        seen[n] = 1;
        queue[tail++] = n;
      }
    };
    while (head < tail) {
      const n = queue[head++],
        x = n % width,
        y = Math.floor(n / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
      if (data[n * 4 + 3] > 128) opaque++;
      if (x > 0) push(n - 1);
      if (x < width - 1) push(n + 1);
      if (y > 0) push(n - width);
      if (y < height - 1) push(n + width);
    }
    if (
      tail < count * 0.0015 ||
      minX === 0 ||
      minY === 0 ||
      maxX === width - 1 ||
      maxY === height - 1
    )
      continue;
    regions.push({
      left: (minX / width) * 100,
      right: ((maxX + 1) / width) * 100,
      top: (minY / height) * 100,
      bottom: ((maxY + 1) / height) * 100,
      cx: (sumX / tail / width) * 100,
      cy: (sumY / tail / height) * 100,
      width: ((maxX - minX + 1) / width) * 100,
      height: ((maxY - minY + 1) / height) * 100,
      area: tail / count,
      opaque: opaque / tail,
      ratio: (maxX - minX + 1) / (maxY - minY + 1),
    });
  }
  const largest = (items: Region[]) => items.sort((a, b) => b.area - a.area)[0];
  const art = largest(
    regions.filter(
      (r) => r.width > 45 && r.area > 0.1 && r.cy > 25 && r.cy < 60,
    ),
  );
  const name = largest(
    regions.filter(
      (r) => r.width > 35 && r.cy < 20 && r.left > 15 && r.ratio > 3,
    ),
  );
  const rules = largest(
    regions.filter((r) => r.width > 45 && r.height > 7 && r.cy > 65),
  );
  const circles = regions.filter(
    (r) =>
      r.width > 7 &&
      r.width < 25 &&
      r.height < 20 &&
      r.ratio > 0.6 &&
      r.ratio < 1.8,
  );
  const cost = largest(circles.filter((r) => r.cx < 30 && r.cy < 20));
  if (!cost) return null;
  const point = (r: Region) => ({
    centerX: r.cx,
    centerY: r.cy,
    size: r.width,
  });
  const inset = (r: Region, pad: number) => ({
    left: r.left + pad,
    right: 100 - r.right + pad,
    top: r.top + pad,
    bottom: 100 - r.bottom + pad,
  });
  const attack = largest(circles.filter((r) => r.cx < 30 && r.cy > 75)),
    health = largest(circles.filter((r) => r.cx > 70 && r.cy > 75));
  return {
    ...(name
      ? {
          name: {
            left: name.left + 1,
            right: 100 - name.right + 1,
            top: name.top + 0.3,
            height: Math.max(2, name.height - 0.6),
          },
        }
      : {}),
    ...(rules ? { rules: inset(rules, 1) } : {}),
    cost: point(cost),
    ...(attack ? { attack: point(attack) } : {}),
    ...(health ? { health: point(health) } : {}),
    ...(art && art.opaque > 0.8 ? { opaqueArtWindow: inset(art, 0.5) } : {}),
  };
}
const cache = new Map<string, DetectedFrameWindows | null>();
export function frameWindowsFromImage(
  image: HTMLImageElement,
): DetectedFrameWindows | null {
  const src = image.currentSrc || image.src;
  if (cache.has(src)) return cache.get(src)!;
  let result: DetectedFrameWindows | null = null;
  try {
    const scale = Math.min(
      1,
      384 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      result = detectFrameWindows(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
      );
    }
  } catch {
    /* Third-party images without pixel access keep the default geometry. */
  }
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(src, result);
  return result;
}
