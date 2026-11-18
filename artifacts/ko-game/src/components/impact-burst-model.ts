import { finisherDamage } from './finisher-scale';
/**
 * Visual-only slam effect sizing. Never imports battle rules or changes results.
 * Damage decides how loud the hit looks; player preferences can only turn it down.
 */
export type ImpactBurstTier = 'LIGHT' | 'NORMAL' | 'HEAVY' | 'MASSIVE' | 'FINISHER';
export type ImpactBurstQuality = 'LOW' | 'MEDIUM' | 'HIGH';

export type ImpactBurstProfile = {
  tier: ImpactBurstTier;
  /** Diameter of the warm contact flash in CSS pixels. */
  flashSize: number;
  /** Board dust clouds pushed out by the slam. */
  dust: number;
  /** Stone chips knocked off the board. */
  debris: number;
  /** Short hot streaks. */
  sparks: number;
  /** Particle launch speed in px/ms. */
  speed: number;
  /** Dark cracks drawn into the board at the hit (heavy hits only). */
  cracks: number;
  /** How far (px) the hit card shudders during hit-stop. */
  shake: number;
  /** Full-screen flash peak opacity (0..1), already scaled by the flash preference. */
  screenFlash: number;
  /** Target white-out peak brightness multiplier. */
  whiteout: number;
  /** Size of the red damage badge. */
  badgeSize: number;
  /** Total lifetime of the particle effect in ms. */
  life: number;
};

// Deliberately far apart: a 1-damage poke is a small puff, a finisher shakes the whole board.
const BASE: Record<ImpactBurstTier, Omit<ImpactBurstProfile, 'tier'>> = {
  LIGHT:    { flashSize: 120, dust: 6,  debris: 2,  sparks: 6,  speed: .75, cracks: 0,  shake: 2,  screenFlash: 0,   whiteout: 2,   badgeSize: 62,  life: 480 },
  NORMAL:   { flashSize: 200, dust: 14, debris: 8,  sparks: 14, speed: 1,   cracks: 0,  shake: 4,  screenFlash: .05, whiteout: 2.6, badgeSize: 80,  life: 640 },
  HEAVY:    { flashSize: 320, dust: 28, debris: 20, sparks: 26, speed: 1.35, cracks: 6,  shake: 8,  screenFlash: .18, whiteout: 3.4, badgeSize: 104, life: 880 },
  MASSIVE:  { flashSize: 460, dust: 44, debris: 34, sparks: 40, speed: 1.75, cracks: 10, shake: 12, screenFlash: .32, whiteout: 4,   badgeSize: 128, life: 1100 },
  FINISHER: { flashSize: 600, dust: 64, debris: 50, sparks: 60, speed: 2.2,  cracks: 16, shake: 16, screenFlash: .45, whiteout: 4.6, badgeSize: 152, life: 1350 },
};

export function impactBurstTier(damage: number, finisher = false): ImpactBurstTier | null {
  const scaled = finisherDamage(damage, finisher), amount = scaled.damage;
  if (amount <= 0) return null;
  if (scaled.top) return 'FINISHER';
  if (amount >= 10) return 'MASSIVE';
  if (amount >= 6) return 'HEAVY';
  if (amount >= 3) return 'NORMAL';
  return 'LIGHT';
}

export function impactBurstProfile(
  damage: number,
  finisher = false,
  options: { quality?: ImpactBurstQuality; flash?: number; reduced?: boolean; viewportMin?: number } = {},
): ImpactBurstProfile | null {
  const tier = impactBurstTier(damage, finisher);
  if (!tier) return null;
  const base = BASE[tier];
  const reduced = Boolean(options.reduced);
  const flash = Math.max(0, Math.min(1, Number.isFinite(options.flash) ? Number(options.flash) : 1));
  const detail = reduced ? 0 : options.quality === 'LOW' ? .4 : options.quality === 'MEDIUM' ? .7 : 1;
  // Phones keep the same punch relative to the board instead of covering it.
  const size = Math.max(.62, Math.min(1, (options.viewportMin ?? 760) / 760));
  return {
    tier,
    flashSize: Math.round(base.flashSize * size * (reduced ? .6 : 1)),
    dust: Math.round(base.dust * detail),
    debris: Math.round(base.debris * detail),
    sparks: Math.round(base.sparks * detail),
    speed: base.speed * size,
    cracks: reduced ? 0 : base.cracks,
    shake: reduced ? 0 : base.shake,
    screenFlash: reduced ? 0 : base.screenFlash * flash,
    whiteout: 1 + (base.whiteout - 1) * (reduced ? .3 : flash),
    badgeSize: Math.round(base.badgeSize * Math.max(.8, size)),
    life: reduced ? 180 : base.life,
  };
}

/**
 * Damage splash outline (closed SVG path): uneven spikes joined by concave curves,
 * like an exploding splat. The shape spans roughly ±radius. Deterministic per seed.
 */
export function damageSplashPath(radius: number, seed = 1, spikes = 11): string {
  let state = Math.max(1, Math.floor(seed * 7919)) % 2147483647;
  const random = () => (state = (state * 48271) % 2147483647) / 2147483647;
  const tips = Array.from({ length: spikes }, (_, i) => ({
    angle: (i / spikes) * Math.PI * 2 - Math.PI / 2 + (random() - .5) * .35,
    r: radius * (.72 + .28 * random()),
  }));
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(Math.cos(tips[0]!.angle) * tips[0]!.r)},${f(Math.sin(tips[0]!.angle) * tips[0]!.r)}`;
  tips.forEach((tip, i) => {
    const next = tips[(i + 1) % spikes]!;
    const nextAngle = i === spikes - 1 ? next.angle + Math.PI * 2 : next.angle;
    const mid = (tip.angle + nextAngle) / 2, valley = radius * (.42 + .12 * random());
    d += ` Q${f(Math.cos(mid) * valley)},${f(Math.sin(mid) * valley)} ${f(Math.cos(next.angle) * next.r)},${f(Math.sin(next.angle) * next.r)}`;
  });
  return `${d} Z`;
}

export type CrackShape = {
  /** Closed tapered outline: wide at the hit, thinning to a hairline at the tip. */
  outline: [number, number][];
  /** One lip of the crack, for a thin light bevel. */
  edge: [number, number][];
};

/**
 * Board cracks for heavy hits, radiating in every direction from under the struck
 * card like a slammed floor: thick angular fissures that bend sharply, taper to a
 * point and sometimes fork. Deterministic per seed.
 */
export function crackShapes(x: number, y: number, count: number, reach: number, width: number, seed = 1): CrackShape[] {
  let state = Math.max(1, Math.floor(seed * 6151)) % 2147483647;
  const random = () => (state = (state * 48271) % 2147483647) / 2147483647;
  const shapes: CrackShape[] = [];
  const grow = (sx: number, sy: number, angle: number, length: number, w0: number, branch: boolean) => {
    const centre: [number, number][] = [[sx, sy]];
    let px = sx, py = sy, heading = angle;
    for (let travelled = 0; travelled < length;) {
      // Long straight runs with sharp kinks, pulled back toward the main direction.
      const step = 14 + random() * 12;
      heading += (random() - .5) * 1.2;
      heading += (angle - heading) * .4;
      px += Math.cos(heading) * step; py += Math.sin(heading) * step;
      travelled += step;
      centre.push([px, py]);
    }
    const left: [number, number][] = [], right: [number, number][] = [];
    centre.forEach(([cx, cy], i) => {
      const [nx, ny] = centre[Math.min(i + 1, centre.length - 1)]!, [ox, oy] = centre[Math.max(i - 1, 0)]!;
      const dx = nx - ox, dy = ny - oy, len = Math.hypot(dx, dy) || 1;
      const t = i / (centre.length - 1);
      const half = (w0 * Math.pow(1 - t, 1.1) + .4) / 2 * (.75 + random() * .5);
      left.push([cx - dy / len * half, cy + dx / len * half]);
      right.push([cx + dy / len * half, cy - dx / len * half]);
    });
    shapes.push({ outline: [...left, ...right.reverse()], edge: left });
    if (branch && centre.length > 3 && random() < .65) {
      const at = Math.max(1, Math.floor(centre.length * (.3 + random() * .35)));
      const [bx, by] = centre[at]!;
      const fork = angle + (random() < .5 ? -1 : 1) * (.45 + random() * .45);
      grow(bx, by, fork, length * (1 - at / centre.length) * .7, w0 * .55, false);
    }
  };
  const offset = random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const angle = offset + (i / count) * Math.PI * 2 + (random() - .5) * (Math.PI / count);
    grow(x, y, angle, reach * (.6 + .4 * random()), width * (.75 + random() * .35), true);
  }
  return shapes;
}

/** Hit-stop shudder: alternating offsets that decay to rest. */
export function shudderFrames(amount: number, steps = 6): string[] {
  if (!(amount > 0)) return ['0px 0px', '0px 0px'];
  const frames: string[] = [];
  for (let i = 0; i < steps; i++) {
    const decay = 1 - i / steps;
    const sign = i % 2 === 0 ? 1 : -1;
    frames.push(`${(sign * amount * decay).toFixed(2)}px ${(sign * amount * .25 * decay).toFixed(2)}px`);
  }
  frames.push('0px 0px');
  return frames;
}
