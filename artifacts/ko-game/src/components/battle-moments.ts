import { readCombatPreferences } from './combat-preferences';
import './battle-moments.css';

/**
 * Hearthstone-style "moment" effects: a destroyed card shattering, a retired card
 * crumbling, a heal glow, the turn banner and the match-result stinger.
 * Fire-and-forget DOM layers on document.body; presentation only.
 */

function prefs() {
  if (typeof document === 'undefined') return null;
  const p = readCombatPreferences();
  return { reduced: p.reducedMotion, low: p.quality === 'LOW', flash: p.flash > 0 };
}

function add(className: string, style: Record<string, string> = {}, parent: HTMLElement = document.body) {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  for (const [k, v] of Object.entries(style)) el.style.setProperty(k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), v);
  parent.appendChild(el);
  return el;
}

function run(el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions, removeAfter = true) {
  try {
    const a = el.animate(frames, { fill: 'both', ...options });
    if (removeAfter) a.onfinish = () => el.remove();
  } catch { /* visual only */ }
  if (removeAfter) window.setTimeout(() => el.remove(), Number(options.duration ?? 0) + Number(options.delay ?? 0) + 300);
  return el;
}

// ------------------------------------------------------------------ destroy: the card shatters

/** Irregular shards covering a w×h card: a jittered grid split into triangles. */
export function shardPolygons(w: number, h: number, cols = 3, rows = 4, seed = 1): [number, number][][] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: [number, number][] = [];
    for (let c = 0; c <= cols; c++) {
      const edgeX = c === 0 || c === cols, edgeY = r === 0 || r === rows;
      row.push([(c + (edgeX ? 0 : (rnd() - .5) * .7)) * w / cols, (r + (edgeY ? 0 : (rnd() - .5) * .7)) * h / rows]);
    }
    pts.push(row);
  }
  const out: [number, number][][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = pts[r]![c]!, b = pts[r]![c + 1]!, d = pts[r + 1]![c]!, e = pts[r + 1]![c + 1]!;
    if (rnd() < .5) { out.push([a, b, e], [a, e, d]); } else { out.push([a, b, d], [b, e, d]); }
  }
  return out;
}

/**
 * Break a card into pieces of its own face. `source` is the card element to copy;
 * the pieces burst outward from a crack point, spin and fall.
 */
export function spawnCardShatter({ source, left, top, width, height }: { source?: Element | null; left: number; top: number; width: number; height: number }) {
  const p = prefs();
  if (!p || p.reduced) return;
  const polys = shardPolygons(width, height, p.low ? 2 : 3, p.low ? 3 : 4, Math.floor(Math.random() * 1e6) + 1);
  const hit = { x: width * (.4 + Math.random() * .2), y: height * (.35 + Math.random() * .2) };
  const layer = add('ko-shatter', { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  window.setTimeout(() => layer.remove(), 1400);
  for (const poly of polys) {
    const piece = document.createElement('div');
    piece.className = 'ko-shatter__piece';
    piece.style.clipPath = `polygon(${poly.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
    if (source) {
      const copy = source.cloneNode(true) as HTMLElement;
      copy.classList.add('ko-shatter__face');
      piece.appendChild(copy);
    } else piece.classList.add('ko-shatter__piece--plain');
    layer.appendChild(piece);
    const cx = poly.reduce((s, q) => s + q[0], 0) / 3, cy = poly.reduce((s, q) => s + q[1], 0) / 3;
    const dx = cx - hit.x, dy = cy - hit.y, d = Math.max(1, Math.hypot(dx, dy));
    const push = 40 + Math.random() * 70;
    const vx = dx / d * push, vy = dy / d * push - 30 - Math.random() * 40;
    const spin = (Math.random() - .5) * 140, life = 620 + Math.random() * 380;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, sec = t * life / 1000;
      frames.push({
        offset: t,
        transform: `translate(${(vx * sec * 2.2).toFixed(1)}px,${(vy * sec * 2.2 + 900 * sec * sec).toFixed(1)}px) rotate(${(spin * t).toFixed(1)}deg) scale(${(1 - .15 * t).toFixed(3)})`,
        opacity: t < .6 ? 1 : 1 - (t - .6) / .4,
        filter: `brightness(${(1.6 - .55 * Math.min(1, t * 3)).toFixed(2)}) saturate(${(.85 - .35 * t).toFixed(2)})`,
      });
    }
    try { piece.animate(frames, { duration: life, easing: 'linear', fill: 'both', delay: Math.random() * 30 }); } catch { /* visual only */ }
  }
  // A white crack flash at the break point and a little dust.
  if (p.flash) run(add('ko-shatter__flash', { left: `${left + hit.x - width * .6}px`, top: `${top + hit.y - width * .6}px`, width: `${width * 1.2}px`, height: `${width * 1.2}px` }),
    [{ opacity: 1, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(1.4)' }], { duration: 260, easing: 'ease-out' });
}

// ------------------------------------------------------------------ retire: crumbles to grey dust

export function spawnRetirePuff({ left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  const p = prefs();
  if (!p || p.reduced) return;
  const n = p.low ? 6 : 12;
  for (let i = 0; i < n; i++) {
    const s = width * (.28 + Math.random() * .3), x = left + width * (.1 + .8 * Math.random()), y = top + height * (.55 + .4 * Math.random());
    run(add('ko-retire-puff', { left: `${x - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px` }), [
      { opacity: 0, transform: 'translate(0,0) scale(.4)' },
      { offset: .2, opacity: .55, transform: `translate(${(Math.random() - .5) * 14}px,-6px) scale(.9)` },
      { opacity: 0, transform: `translate(${(Math.random() - .5) * 40}px,${-20 - Math.random() * 30}px) scale(1.6)` },
    ], { duration: 700 + Math.random() * 400, delay: Math.random() * 120, easing: 'ease-out' });
  }
}

// ------------------------------------------------------------------ heal: a warm rising glow

export function spawnHealGlow({ x, y, size = 110 }: { x: number; y: number; size?: number }) {
  const p = prefs();
  if (!p || p.reduced) return;
  run(add('ko-heal-glow', { left: `${x - size * .7}px`, top: `${y - size * .9}px`, width: `${size * 1.4}px`, height: `${size * 1.8}px` }), [
    { opacity: 0, transform: 'scaleY(.4)' }, { offset: .25, opacity: .9, transform: 'scaleY(1)' }, { opacity: 0, transform: 'scaleY(1.2) translateY(-10%)' },
  ], { duration: 900, easing: 'ease-out' });
  const n = p.low ? 8 : 18;
  for (let i = 0; i < n; i++) {
    const s = 3 + Math.random() * 4, px = x + (Math.random() - .5) * size * .9, py = y + size * (.1 + Math.random() * .4);
    run(add('ko-heal-mote', { left: `${px}px`, top: `${py}px`, width: `${s}px`, height: `${s}px` }), [
      { opacity: 0, transform: 'translateY(0) scale(.5)' }, { offset: .2, opacity: 1, transform: `translateY(${-size * .15}px) scale(1)` },
      { opacity: 0, transform: `translate(${(Math.random() - .5) * 20}px,${-size * (.6 + Math.random() * .5)}px) scale(.6)` },
    ], { duration: 800 + Math.random() * 500, delay: Math.random() * 250, easing: 'cubic-bezier(.2,.6,.4,1)' });
  }
}

// ------------------------------------------------------------------ turn banner

let lastTurnBanner = 0;
let coinTossUntil = 0;
export function spawnTurnBanner(mine: boolean, label: string) {
  const p = prefs();
  if (!p) return;
  const wait = coinTossUntil - Date.now();
  if (wait > 0) { window.setTimeout(() => spawnTurnBanner(mine, label), wait); return; }
  const now = Date.now();
  if (now - lastTurnBanner < 400) return;
  lastTurnBanner = now;
  const banner = add(`ko-turn-banner${mine ? ' ko-turn-banner--mine' : ''}`);
  const plate = document.createElement('div'); plate.className = 'ko-turn-banner__plate';
  const text = document.createElement('div'); text.className = 'ko-turn-banner__text'; text.textContent = label;
  const sweep = document.createElement('div'); sweep.className = 'ko-turn-banner__sweep';
  plate.append(text, sweep); banner.append(plate);
  const life = p.reduced ? 700 : mine ? 1250 : 900;
  run(banner, p.reduced
    ? [{ opacity: 0 }, { offset: .15, opacity: 1 }, { offset: .8, opacity: 1 }, { opacity: 0 }]
    : [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.6)' },
      { offset: .12, opacity: 1, transform: 'translate(-50%,-50%) scale(.96)', easing: 'ease-out' },
      { offset: .2, transform: 'translate(-50%,-50%) scale(1)' },
      { offset: .78, opacity: 1, transform: 'translate(-50%,-50%) scale(1.02)' },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.08)' },
    ], { duration: life, easing: 'linear' });
  if (!p.reduced) run(sweep, [{ transform: 'translateX(-120%) skewX(-20deg)' }, { offset: .25, transform: 'translateX(-120%) skewX(-20deg)' }, { offset: .6, transform: 'translateX(220%) skewX(-20deg)' }, { transform: 'translateX(220%) skewX(-20deg)' }], { duration: life }, false);
}

// ------------------------------------------------------------------ match result stinger

export const RESULT_STINGER = { crackStart: 250, explode: 1000, banner: 1350, fadeOut: 3300, end: 3700 };

export function crackSvg(seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const paths: string[] = [];
  for (let k = 0; k < 9; k++) {
    let a = k / 9 * Math.PI * 2 + (rnd() - .5) * .4, x = 100, y = 120, r = 0, d = `M100 120`;
    while (r < 140) {
      r += 14 + rnd() * 18; a += (rnd() - .5) * .6;
      x = 100 + r * Math.cos(a); y = 120 + r * Math.sin(a) * 1.15; d += `L${x.toFixed(0)} ${y.toFixed(0)}`;
      if (rnd() < .3) { const b = a + (rnd() < .5 ? -1 : 1) * (.5 + rnd() * .5), l = 14 + rnd() * 22; paths.push(`<path d='M${x.toFixed(0)} ${y.toFixed(0)}l${(l * Math.cos(b)).toFixed(0)} ${(l * Math.sin(b)).toFixed(0)}' stroke-width='1.6'/>`); }
    }
    paths.push(`<path d='${d}' stroke-width='3'/>`);
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 240' preserveAspectRatio='none' fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='#fff3d6' opacity='.9'>${paths.join('')}</g></svg>`;
}

function medallion(art: string | null | undefined, kind: 'gold' | 'dark') {
  const m = document.createElement('div');
  m.className = `ko-result-medallion ko-result-medallion--${kind}`;
  const frame = document.createElement('div'); frame.className = 'ko-result-medallion__frame';
  if (art) { const img = document.createElement('img'); img.src = art; img.alt = ''; img.draggable = false; frame.append(img); }
  m.append(frame);
  return m;
}

/**
 * Hearthstone-style ending. VICTORY: the opponent's champion portrait cracks, shudders
 * and explodes, then yours rises in a gold frame over a "VICTORY" ribbon.
 * DEFEAT: your portrait cracks and crumbles away, leaving a dark "DEFEAT" ribbon.
 */
export function spawnResultStinger(kind: 'victory' | 'defeat', art: { loser?: string | null; winner?: string | null } = {}) {
  const p = prefs();
  if (!p) return;
  const T = RESULT_STINGER, victory = kind === 'victory';
  const root = add(`ko-result-stinger ko-result-stinger--${kind}`);
  window.setTimeout(() => root.remove(), T.end + 200);
  run(root, [{ opacity: 0 }, { offset: 160 / T.end, opacity: 1 }, { offset: T.fadeOut / T.end, opacity: 1 }, { opacity: 0 }], { duration: T.end }, false);
  const ribbon = () => {
    const r = document.createElement('div'); r.className = 'ko-result-ribbon';
    const t = document.createElement('span'); t.textContent = victory ? 'VICTORY' : 'DEFEAT'; r.append(t);
    return r;
  };
  if (p.reduced) {
    const r = ribbon(); root.append(r);
    return;
  }

  // 1. The losing champion, framed, under strain.
  const doomed = medallion(art.loser, victory ? 'dark' : 'gold');
  root.append(doomed);
  const cracks = document.createElement('div'); cracks.className = 'ko-result-medallion__cracks';
  cracks.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(crackSvg(Math.floor(Math.random() * 1e6) + 1))}")`;
  doomed.firstElementChild!.append(cracks);
  const e = T.explode;
  run(doomed, [
    { offset: 0, opacity: 0, transform: 'translate(-50%,-50%) scale(.8)' },
    { offset: 180 / e, opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
    ...Array.from({ length: 14 }, (_, i) => {
      const k = i / 13, a = 1 + 6 * k * k;
      return { offset: (T.crackStart + (e - 30 - T.crackStart) * k) / e, transform: `translate(calc(-50% + ${(i % 2 ? a : -a).toFixed(1)}px),calc(-50% + ${((i * 5) % 3 - 1) * a * .5}px)) scale(${1 + .04 * k})` };
    }),
    { offset: 1, opacity: 1, transform: 'translate(-50%,-50%) scale(1.06)', filter: 'brightness(1.8)' },
  ], { duration: e, easing: 'linear' }, false);
  run(cracks, [{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }, { offset: T.crackStart / e, opacity: 1, clipPath: 'circle(8% at 50% 50%)' }, { opacity: 1, clipPath: 'circle(75% at 50% 50%)' }], { duration: e, easing: 'cubic-bezier(.5,0,.9,.6)' }, false);

  // 2. It breaks apart.
  window.setTimeout(() => {
    const r = doomed.getBoundingClientRect();
    doomed.style.visibility = 'hidden';
    const polys = shardPolygons(r.width, r.height, p.low ? 3 : 4, p.low ? 3 : 5, Math.floor(Math.random() * 1e6) + 1);
    const layer = add('ko-result-shards', { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }, root);
    for (const poly of polys) {
      const piece = document.createElement('div'); piece.className = 'ko-shatter__piece';
      piece.style.clipPath = `polygon(${poly.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
      const copy = doomed.firstElementChild!.cloneNode(true) as HTMLElement; copy.classList.add('ko-shatter__face'); piece.append(copy);
      layer.append(piece);
      const cx = poly.reduce((a, q) => a + q[0], 0) / 3 - r.width / 2, cy = poly.reduce((a, q) => a + q[1], 0) / 3 - r.height / 2;
      const d = Math.max(1, Math.hypot(cx, cy)), push = victory ? 260 + Math.random() * 320 : 60 + Math.random() * 90;
      const vx = cx / d * push, vy = cy / d * push - (victory ? 120 : 0), spin = (Math.random() - .5) * (victory ? 520 : 160), life = victory ? 900 + Math.random() * 500 : 1300 + Math.random() * 500;
      const frames: Keyframe[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, sec = t * life / 1000;
        frames.push({ offset: t, transform: `translate(${(vx * sec).toFixed(1)}px,${(vy * sec + (victory ? 700 : 520) * sec * sec).toFixed(1)}px) rotate(${(spin * t).toFixed(1)}deg)`, opacity: t < .55 ? 1 : 1 - (t - .55) / .45, filter: `brightness(${(victory ? 2.2 - 1.2 * Math.min(1, t * 2.5) : 1 - .45 * t).toFixed(2)})` });
      }
      try { piece.animate(frames, { duration: life, easing: 'linear', fill: 'both' }); } catch { /* visual only */ }
    }
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (p.flash) run(add(`ko-result-blast ko-result-blast--${kind}`, { left: `${cx - r.width * 1.6}px`, top: `${cy - r.width * 1.6}px`, width: `${r.width * 3.2}px`, height: `${r.width * 3.2}px` }, root),
      [{ opacity: 1, transform: 'scale(.2)' }, { offset: .2, opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 700, easing: 'cubic-bezier(.2,.7,.3,1)' });
    if (p.flash && victory) run(add('ko-result-stinger__flash ko-result-stinger__flash--victory', {}, root), [{ opacity: .85 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
    if (!victory) run(add('ko-result-stinger__flash ko-result-stinger__flash--defeat', {}, root), [{ opacity: .6 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' });
    try { document.querySelector<HTMLElement>('.ko-result-poster')?.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-9px,5px)' }, { transform: 'translate(8px,-6px)' }, { transform: 'translate(-5px,3px)' }, { transform: 'translate(3px,-1px)' }, { transform: 'translate(0,0)' }], { duration: 420 }); } catch { /* visual only */ }
  }, e);

  // 3. The verdict.
  window.setTimeout(() => {
    if (victory) {
      const rays = document.createElement('div'); rays.className = 'ko-result-stinger__rays'; root.append(rays);
      run(rays, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4) rotate(0deg)' }, { offset: .15, opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(8deg)' }, { opacity: .7, transform: 'translate(-50%,-50%) scale(1.08) rotate(40deg)' }], { duration: T.end - T.banner, easing: 'linear' }, false);
      const hero = medallion(art.winner, 'gold'); hero.classList.add('ko-result-medallion--winner'); root.append(hero);
      run(hero, [{ opacity: 0, transform: 'translate(-50%,-30%) scale(.7)' }, { offset: .14, opacity: 1, transform: 'translate(-50%,-52%) scale(1.04)', easing: 'ease-out' }, { offset: .22, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.02)' }], { duration: T.end - T.banner, easing: 'linear' }, false);
    }
    const r = ribbon(); root.append(r);
    run(r, [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(2.2)', filter: 'blur(4px)' },
      { offset: .07, opacity: 1, transform: 'translate(-50%,-50%) scale(.95)', filter: 'blur(0)' },
      { offset: .12, transform: 'translate(-50%,-50%) scale(1)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1.02)' },
    ], { duration: T.end - T.banner, easing: 'linear' }, false);
  }, T.banner);
}


// ------------------------------------------------------------------ champion portrait: ability flare and big-hit cracks

/** The champion HUD node (portrait window) under a screen point, if any. */
export function championPortraitAt(x: number, y: number): HTMLElement | null {
  for (const node of Array.from(document.querySelectorAll<HTMLElement>('.ko-player-champion,.ko-opponent-champion'))) {
    const r = node.getBoundingClientRect();
    if (x >= r.left - 20 && x <= r.right + 20 && y >= r.top - 20 && y <= r.bottom + 20) return node.querySelector<HTMLElement>('.ko-portrait-window') ?? node;
  }
  return null;
}

/** A champion uses its ability: the portrait flares, a ring of light opens under it and motes rise. */
export function spawnAbilityFlare(portrait: HTMLElement | null, fallback: { x: number; y: number }, fallbackSize = 120) {
  const p = prefs();
  if (!p) return;
  const r = portrait?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : fallback.x, y = r ? r.top + r.height / 2 : fallback.y, size = r ? Math.max(r.width, r.height) : fallbackSize;
  if (portrait && !p.reduced) try {
    portrait.animate([{ filter: 'brightness(1)' }, { offset: .25, filter: 'brightness(1.9) saturate(1.3) drop-shadow(0 0 14px rgba(140,200,255,.9))' }, { filter: 'brightness(1)' }], { duration: 650, easing: 'ease-out' });
  } catch { /* visual only */ }
  if (p.reduced) return;
  for (let i = 0; i < 2; i++) {
    const s = size * (1 + i * .15);
    run(add('ko-ability-ring', { left: `${x - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px` }), [
      { opacity: 0, transform: 'scale(.5)' }, { offset: .15, opacity: 1, transform: 'scale(.8)' }, { opacity: 0, transform: `scale(${1.9 + i * .5})` },
    ], { duration: 620 + i * 120, delay: i * 90, easing: 'cubic-bezier(.15,.75,.3,1)' });
  }
  run(add('ko-ability-column', { left: `${x - size * .45}px`, top: `${y - size * 1.4}px`, width: `${size * .9}px`, height: `${size * 1.6}px` }), [
    { opacity: 0, transform: 'scaleY(.3)' }, { offset: .2, opacity: .9, transform: 'scaleY(1)' }, { opacity: 0, transform: 'scaleY(1.1)' },
  ], { duration: 700, easing: 'ease-out' });
  const n = p.low ? 8 : 16;
  for (let i = 0; i < n; i++) {
    const s = 3 + Math.random() * 3, px = x + (Math.random() - .5) * size * .8, py = y + (Math.random() - .2) * size * .4;
    run(add('ko-ability-mote', { left: `${px}px`, top: `${py}px`, width: `${s}px`, height: `${s}px` }), [
      { opacity: 0, transform: 'translateY(0)' }, { offset: .2, opacity: 1 }, { opacity: 0, transform: `translate(${(Math.random() - .5) * 24}px,${-size * (.5 + Math.random() * .6)}px)` },
    ], { duration: 700 + Math.random() * 400, delay: Math.random() * 160, easing: 'cubic-bezier(.2,.6,.4,1)' });
  }
}

/** A heavy hit to a champion briefly cracks the glass over its portrait. */
export function spawnPortraitCracks(portrait: HTMLElement | null, damage: number) {
  const p = prefs();
  if (!p || p.reduced || !portrait || damage < 5) return;
  const r = portrait.getBoundingClientRect();
  const el = add('ko-portrait-cracks', { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  el.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(crackSvg(Math.floor(Math.random() * 1e6) + 1))}")`;
  const mask = getComputedStyle(portrait).maskImage;
  if (mask && mask !== 'none') { el.style.maskImage = mask; el.style.maskSize = '100% 100%'; }
  const big = damage >= 10;
  run(el, [{ opacity: 0, clipPath: 'circle(5% at 50% 50%)' }, { offset: .08, opacity: 1, clipPath: `circle(${big ? 80 : 50}% at 50% 50%)` }, { offset: .6, opacity: .85 }, { opacity: 0, clipPath: `circle(${big ? 80 : 50}% at 50% 50%)` }], { duration: big ? 1100 : 750, easing: 'ease-out' });
}

// ------------------------------------------------------------------ board taps

const INTERACTIVE = 'button,a,input,select,textarea,[role=button],[role=menu],[role=dialog],.ko-board-slot,.ko-board-slot-wrapper,[data-card-instance-id],.ko-player-hand,.ko-opponent-hand,.ko-game-controls,.ko-player-champion,.ko-opponent-champion,.ko-deck-stack,[data-resource]';
let lastTap = 0;
/** Tapping bare board makes a little thud and puff of dust, like poking the Hearthstone table. */
export function installBoardTaps(stage: HTMLElement, play: () => boolean) {
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element) || event.target.closest(INTERACTIVE)) return;
    const now = performance.now();
    if (now - lastTap < 160) return;
    lastTap = now;
    const p = prefs();
    if (!play() || !p || p.reduced) return;
    const x = event.clientX, y = event.clientY;
    run(add('ko-board-tap', { left: `${x - 30}px`, top: `${y - 30}px`, width: '60px', height: '60px' }), [
      { opacity: .9, transform: 'scaleY(.5) scale(.3)' }, { opacity: 0, transform: 'scaleY(.5) scale(1.6)' },
    ], { duration: 420, easing: 'ease-out' });
    for (let i = 0; i < 5; i++) {
      const s = 10 + Math.random() * 12;
      run(add('ko-retire-puff', { left: `${x - s / 2}px`, top: `${y - s / 2}px`, width: `${s}px`, height: `${s}px` }), [
        { opacity: 0, transform: 'translate(0,0) scale(.5)' }, { offset: .2, opacity: .45 },
        { opacity: 0, transform: `translate(${(Math.random() - .5) * 46}px,${-6 - Math.random() * 16}px) scale(1.4)` },
      ], { duration: 520 + Math.random() * 260, easing: 'ease-out' });
    }
  };
  stage.addEventListener('pointerdown', down);
  return () => stage.removeEventListener('pointerdown', down);
}


// ------------------------------------------------------------------ first player: coin toss

const tossedGames = new Set<string>();
/** Who goes first: a coin spins up and lands on 선공 / 후공. Once per match. */
export function spawnCoinToss(gameId: string, mineFirst: boolean, play: (sound: 'flip' | 'land') => void) {
  const p = prefs();
  if (!p || tossedGames.has(gameId)) return;
  tossedGames.add(gameId);
  const life = p.reduced ? 900 : 1900;
  coinTossUntil = Date.now() + life - 250;
  const root = add(`ko-coin-toss${mineFirst ? ' ko-coin-toss--first' : ''}`);
  const coin = document.createElement('div'); coin.className = 'ko-coin';
  const front = document.createElement('div'); front.className = 'ko-coin__face ko-coin__face--front'; front.textContent = mineFirst ? '선' : '후';
  const back = document.createElement('div'); back.className = 'ko-coin__face ko-coin__face--back'; back.textContent = mineFirst ? '후' : '선';
  coin.append(front, back);
  const label = document.createElement('div'); label.className = 'ko-coin-toss__label'; label.textContent = mineFirst ? '내가 선공!' : '상대가 선공';
  root.append(coin, label);
  window.setTimeout(() => root.remove(), life + 300);
  run(root, [{ opacity: 0 }, { offset: .06, opacity: 1 }, { offset: .86, opacity: 1 }, { opacity: 0 }], { duration: life }, false);
  if (!p.reduced) {
    play('flip');
    run(coin, [
      { transform: 'translateY(60px) rotateY(0deg) scale(.6)' },
      { offset: .3, transform: 'translateY(-110px) rotateY(1260deg) scale(1.1)', easing: 'cubic-bezier(.4,0,.9,.6)' },
      { offset: .55, transform: 'translateY(0) rotateY(2520deg) scale(1)' },
      { offset: .62, transform: 'translateY(-14px) rotateY(2520deg) scale(1.04)' },
      { offset: .68, transform: 'translateY(0) rotateY(2520deg) scale(1)' },
      { transform: 'translateY(0) rotateY(2520deg) scale(1)' },
    ], { duration: life, easing: 'linear' }, false);
    window.setTimeout(() => play('land'), life * .55);
  }
  run(label, [{ opacity: 0, transform: 'translate(-50%,0) scale(1.8)' }, { offset: .58, opacity: 0, transform: 'translate(-50%,0) scale(1.8)' }, { offset: .66, opacity: 1, transform: 'translate(-50%,0) scale(.95)' }, { offset: .7, transform: 'translate(-50%,0) scale(1)' }, { opacity: 1, transform: 'translate(-50%,0) scale(1)' }], { duration: life, easing: 'linear' }, false);
}

// ------------------------------------------------------------------ low health warning

/** Below the danger line the screen edges pulse red; returns a stop function. */
export function startDangerPulse(play: () => void): () => void {
  const p = prefs();
  if (!p) return () => {};
  const el = add('ko-danger-pulse');
  let beat: number | undefined;
  if (!p.reduced) {
    play();
    beat = window.setInterval(() => { if (!document.hidden) play(); }, 1600);
  } else el.classList.add('ko-danger-pulse--still');
  return () => { if (beat) window.clearInterval(beat); el.remove(); };
}
