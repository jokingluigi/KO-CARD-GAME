import { readCombatPreferences } from './combat-preferences';
import './card-arrival.css';

/**
 * Legendary / champion arrivals. Fire-and-forget DOM layers on document.body that sit
 * just under the card-play layer (z-index 300), so the hovering card stays on top.
 * Presentation only; nothing here reads or changes battle state.
 *
 * The two have different identities, not just different colours:
 *  - LEGENDARY is radiant: soft dimming, turning golden rays, then a pillar of light
 *    drops onto the slot and sparkles float upward.
 *  - CHAMPION is the trump card: the screen goes black with cinema bars and the card's
 *    name, a red vortex and lightning gather behind the trembling card, then it hits
 *    with a shockwave, flying rubble, floor cracks and falling embers.
 */

export type ArrivalKind = 'LEGENDARY' | 'CHAMPION';

const GOLD = { core: '255,246,214', glow: '255,192,64', ray: '255,210,110' };
const RED = { core: '255,232,214', glow: '214,34,30', hot: '255,120,48' };

function allowed() {
  if (typeof document === 'undefined') return null;
  const prefs = readCombatPreferences();
  if (prefs.reducedMotion) return null;
  return { low: prefs.quality === 'LOW', flash: prefs.flash > 0 };
}

function layer(className: string, style: Record<string, string> = {}, tag = 'div') {
  const el = document.createElement(tag);
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  for (const [key, value] of Object.entries(style)) el.style.setProperty(key.startsWith('--') ? key : key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), value);
  document.body.appendChild(el);
  return el;
}

function play(el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
  let animation: Animation | undefined;
  try { animation = el.animate(frames, { fill: 'both', ...options }); } catch { /* visual only */ }
  const total = Number(options.duration ?? 0) + Number(options.delay ?? 0);
  const remove = () => el.remove();
  if (animation) animation.onfinish = remove;
  window.setTimeout(remove, total + 250);
  return el;
}

const box = (x: number, y: number, w: number, h = w) => ({ left: `${x - w / 2}px`, top: `${y - h / 2}px`, width: `${w}px`, height: `${h}px` });

/** Clamp keyframe offsets so they always ascend. */
function offsets(frames: Keyframe[]) {
  let last = 0;
  return frames.map((f) => {
    if (typeof f.offset !== 'number') return f;
    last = Math.min(1, Math.max(last, f.offset));
    return { ...f, offset: last };
  });
}

// ---------------------------------------------------------------- build-up

export function spawnArrivalBuildup({ x, y, size, kind, start, landing, title, tag }: {
  /** Hover point (centre of the hovering card). */
  x: number; y: number; size: number; kind: ArrivalKind;
  /** When the build-up should begin and when the card lands, in ms from now. */
  start: number; landing: number;
  /** Card name, shown in the champion's cinema bars. */
  title?: string;
  /** Small caption above the title in the cinema bars (default CHAMPION). */
  tag?: string;
}): () => void {
  const ok = allowed();
  if (!ok) return () => {};
  return kind === 'CHAMPION'
    ? championBuildup(x, y, size, Math.max(0, start), landing, ok.low, title, tag)
    : legendaryBuildup(x, y, size, Math.max(0, start), landing, ok.low);
}

function legendaryBuildup(x: number, y: number, size: number, start: number, landing: number, low: boolean) {
  const total = landing + 260, s = start / total, hit = landing / total;
  const els: HTMLElement[] = [];
  els.push(play(layer('ko-arrival-dim ko-arrival-dim--legendary', { '--x': `${x}px`, '--y': `${y}px` }), offsets([
    { offset: 0, opacity: 0 }, { offset: s, opacity: 0 },
    { offset: s + 180 / total, opacity: .85, easing: 'ease-in' },
    { offset: hit, opacity: .9 }, { offset: hit + 60 / total, opacity: .3 }, { offset: 1, opacity: 0 },
  ]), { duration: total }));
  if (!low) {
    const raySize = size * 3.1;
    els.push(play(layer('ko-arrival-rays', { ...box(x, y, raySize), '--ray': GOLD.ray, '--count': '18' }), offsets([
      { offset: 0, opacity: 0, transform: 'scale(.35) rotate(0deg)' }, { offset: s, opacity: 0, transform: 'scale(.45) rotate(0deg)' },
      { offset: s + 220 / total, opacity: .85, transform: 'scale(.95) rotate(28deg)', easing: 'ease-out' },
      { offset: hit, opacity: 1, transform: 'scale(1.05) rotate(52deg)' },
      { offset: hit + 120 / total, opacity: 0, transform: 'scale(1.9) rotate(60deg)' }, { offset: 1, opacity: 0, transform: 'scale(1.9) rotate(60deg)' },
    ]), { duration: total }));
    // Motes of light drifting up past the hovering card.
    els.push(motes(x, y, size, start, landing));
  }
  els.push(play(layer('ko-arrival-halo', { ...box(x, y, size * 1.9), '--glow': GOLD.glow, '--core': GOLD.core }), offsets([
    { offset: 0, opacity: 0, transform: 'scale(.4)' }, { offset: s, opacity: 0, transform: 'scale(.5)' },
    { offset: s + 200 / total, opacity: .8, transform: 'scale(1)' },
    { offset: hit, opacity: 1, transform: 'scale(1.15)' },
    { offset: hit + 80 / total, opacity: 0, transform: 'scale(1.6)' }, { offset: 1, opacity: 0, transform: 'scale(1.6)' },
  ]), { duration: total }));
  return () => els.forEach((el) => el.remove());
}

function championBuildup(x: number, y: number, size: number, start: number, landing: number, low: boolean, title?: string, caption = 'CHAMPION') {
  const total = landing + 520, s = start / total, hit = landing / total;
  const els: HTMLElement[] = [];
  // The lights go out: near-black with a dying red glow behind the card.
  els.push(play(layer('ko-arrival-dim ko-arrival-dim--champion', { '--x': `${x}px`, '--y': `${y}px` }), offsets([
    { offset: 0, opacity: 0 }, { offset: s, opacity: 0 },
    { offset: s + 260 / total, opacity: 1, easing: 'cubic-bezier(.5,0,.8,.4)' },
    { offset: hit, opacity: 1 }, { offset: hit + 40 / total, opacity: .2 }, { offset: 1, opacity: 0 },
  ]), { duration: total }));

  // Cinema bars slide in with the card's name, then pull away after the hit.
  const bars = layer('ko-arrival-bars');
  const top = document.createElement('div'); top.className = 'ko-arrival-bars__top';
  const bottom = document.createElement('div'); bottom.className = 'ko-arrival-bars__bottom';
  const label = document.createElement('div'); label.className = 'ko-arrival-bars__label';
  const tag = document.createElement('span'); tag.textContent = caption;
  const name = document.createElement('strong'); name.textContent = title ?? '';
  label.append(tag, name); bottom.append(label); bars.append(top, bottom);
  const barFrames = (from: string) => offsets([
    { offset: 0, transform: from }, { offset: s, transform: from },
    { offset: s + 240 / total, transform: 'translateY(0)', easing: 'cubic-bezier(.2,.8,.2,1)' },
    { offset: hit + 280 / total, transform: 'translateY(0)', easing: 'cubic-bezier(.6,0,.8,.4)' },
    { offset: 1, transform: from },
  ]);
  try {
    top.animate(barFrames('translateY(-100%)'), { duration: total, fill: 'both' });
    bottom.animate(barFrames('translateY(100%)'), { duration: total, fill: 'both' });
    label.animate(offsets([
      { offset: 0, opacity: 0, letterSpacing: '.6em' }, { offset: s + 160 / total, opacity: 0, letterSpacing: '.6em' },
      { offset: s + 420 / total, opacity: 1, letterSpacing: '.08em', easing: 'ease-out' },
      { offset: hit + 200 / total, opacity: 1, letterSpacing: '.08em' }, { offset: 1, opacity: 0, letterSpacing: '.08em' },
    ]), { duration: total, fill: 'both' });
  } catch { /* visual only */ }
  window.setTimeout(() => bars.remove(), total + 250);
  els.push(bars);

  if (!low) {
    // A spinning vortex of dark red energy sucked in behind the card.
    els.push(play(layer('ko-arrival-vortex', box(x, y, size * 3)), offsets([
      { offset: 0, opacity: 0, transform: 'scale(1.6) rotate(0deg)' }, { offset: s, opacity: 0, transform: 'scale(1.6) rotate(0deg)' },
      { offset: s + 260 / total, opacity: .9, transform: 'scale(1.05) rotate(-200deg)' },
      { offset: hit - 10 / total, opacity: 1, transform: 'scale(.62) rotate(-560deg)', easing: 'cubic-bezier(.5,0,1,1)' },
      { offset: hit + 30 / total, opacity: 0, transform: 'scale(.3) rotate(-620deg)' }, { offset: 1, opacity: 0, transform: 'scale(.3) rotate(-620deg)' },
    ]), { duration: total }));
    els.push(lightning(x, y, size, start + 160, landing));
  }
  els.push(play(layer('ko-arrival-halo ko-arrival-halo--champion', { ...box(x, y, size * 1.7), '--glow': RED.glow, '--core': RED.hot }), offsets([
    { offset: 0, opacity: 0, transform: 'scale(.5)' }, { offset: s + 120 / total, opacity: 0, transform: 'scale(.5)' },
    { offset: s + 360 / total, opacity: .7, transform: 'scale(1)' },
    { offset: hit - 60 / total, opacity: .55, transform: 'scale(.85)' },
    { offset: hit, opacity: 1, transform: 'scale(1.2)' },
    { offset: hit + 60 / total, opacity: 0, transform: 'scale(1.5)' }, { offset: 1, opacity: 0, transform: 'scale(1.5)' },
  ]), { duration: total }));
  return () => els.forEach((el) => el.remove());
}

/** The aura on the card itself while it hangs, peaking just before the slam. */
export function arrivalAuraFrames(kind: ArrivalKind, start: number, landing: number, duration: number): Keyframe[] {
  const d = Math.max(1, duration);
  const s = Math.min(.9, Math.max(0, start / d)), l = Math.min(.98, Math.max(s + .02, landing / d));
  const shadow = 'drop-shadow(0 15px 22px rgba(0,0,0,.7))';
  if (kind === 'CHAMPION') {
    const glow = (a: number, r: number) => `drop-shadow(0 0 ${r}px rgba(${RED.glow},${a})) drop-shadow(0 0 ${Math.round(r / 4)}px rgba(${RED.hot},${a})) ${shadow}`;
    return offsets([
      { offset: 0, filter: glow(0, 2) }, { offset: s, filter: glow(0, 4) },
      { offset: s + (l - s) * .3, filter: `${glow(.9, 22)} contrast(1.12) saturate(1.2)` },
      { offset: s + (l - s) * .55, filter: `${glow(.55, 14)} contrast(1.05)` },
      { offset: s + (l - s) * .8, filter: `${glow(1, 30)} contrast(1.15) saturate(1.3)` },
      { offset: l - .005, filter: `${glow(1, 38)} brightness(1.3)` },
      { offset: l, filter: `${glow(1, 44)} brightness(2)` },
      { offset: Math.min(1, l + .08), filter: `${glow(.5, 16)} brightness(1.1)` },
      { offset: 1, filter: glow(0, 4) },
    ]);
  }
  const glow = (a: number, r: number) => `drop-shadow(0 0 ${r}px rgba(${GOLD.glow},${a})) drop-shadow(0 0 ${Math.round(r / 3)}px rgba(${GOLD.core},${a})) ${shadow}`;
  return offsets([
    { offset: 0, filter: glow(0, 2) }, { offset: s, filter: glow(0, 4) },
    { offset: s + (l - s) * .45, filter: `${glow(.9, 26)} brightness(1.08)` },
    { offset: s + (l - s) * .7, filter: `${glow(.6, 18)} brightness(1.04)` },
    { offset: l - .01, filter: `${glow(1, 34)} brightness(1.35)` },
    { offset: l, filter: `${glow(1, 40)} brightness(1.7)` },
    { offset: Math.min(1, l + .1), filter: `${glow(.5, 18)} brightness(1.1)` },
    { offset: 1, filter: glow(0, 4) },
  ]);
}

/** Champion only: the card trembles with held-back power while it hangs (uses `translate`, so it stacks on the flight). */
export function arrivalTremorFrames(start: number, landing: number, duration: number): Keyframe[] {
  const d = Math.max(1, duration), s = start / d, l = landing / d;
  const frames: Keyframe[] = [{ offset: 0, translate: '0 0' }, { offset: Math.max(0, s), translate: '0 0' }];
  const steps = 26;
  for (let i = 1; i <= steps; i++) {
    const t = s + (l - s - .01) * (i / steps), a = .6 + 2.4 * (i / steps);
    frames.push({ offset: t, translate: `${(i % 2 ? 1 : -1) * a}px ${((i * 7) % 3 - 1) * a * .6}px` });
  }
  frames.push({ offset: l, translate: '0 0' }, { offset: 1, translate: '0 0' });
  return offsets(frames);
}

// ---------------------------------------------------------------- the hit

export function spawnArrivalBlast({ x, y, width, height, kind }: { x: number; y: number; width: number; height: number; kind: ArrivalKind }): () => void {
  const ok = allowed();
  if (!ok) return () => {};
  return kind === 'CHAMPION' ? championBlast(x, y, Math.max(width, height), ok) : legendaryBlast(x, y, width, Math.max(width, height), ok);
}

function legendaryBlast(x: number, y: number, width: number, base: number, ok: { low: boolean; flash: boolean }) {
  const els: HTMLElement[] = [];
  // A pillar of light drops onto the slot.
  const beamW = width * 1.5, beamTop = -40, beamH = y + base * .2 - beamTop;
  els.push(play(layer('ko-arrival-pillar', { left: `${x - beamW / 2}px`, top: `${beamTop}px`, width: `${beamW}px`, height: `${beamH}px` }), [
    { opacity: 1, transform: 'scaleX(.15) scaleY(.4)', transformOrigin: '50% 100%' },
    { offset: .1, opacity: 1, transform: 'scaleX(1) scaleY(1)', transformOrigin: '50% 100%' },
    { offset: .45, opacity: .7, transform: 'scaleX(.55) scaleY(1)', transformOrigin: '50% 100%' },
    { opacity: 0, transform: 'scaleX(.05) scaleY(1)', transformOrigin: '50% 100%' },
  ], { duration: 820, easing: 'cubic-bezier(.2,.7,.3,1)' }));
  if (ok.flash) {
    els.push(play(layer('ko-arrival-flash', { ...box(x, y, base * 2.6), '--core': GOLD.core, '--glow': GOLD.glow }), [
      { opacity: 1, transform: 'scale(.35)' }, { offset: .18, opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.7)' },
    ], { duration: 460, easing: 'cubic-bezier(.2,.7,.3,1)' }));
    els.push(play(layer('ko-arrival-screenflash', { '--x': `${x}px`, '--y': `${y}px`, '--core': GOLD.core, '--glow': GOLD.glow }), [{ opacity: .6 }, { opacity: 0 }], { duration: 300, easing: 'ease-out' }));
  }
  if (!ok.low) {
    els.push(play(layer('ko-arrival-rays ko-arrival-rays--burst', { ...box(x, y, base * 3.6), '--ray': GOLD.ray, '--count': '22' }), [
      { opacity: 1, transform: 'scale(.3) rotate(0deg)' }, { offset: .25, opacity: .95, transform: 'scale(.9) rotate(8deg)' }, { opacity: 0, transform: 'scale(1.5) rotate(16deg)' },
    ], { duration: 620, easing: 'cubic-bezier(.2,.7,.3,1)' }));
  }
  for (let i = 0; i < 2; i++) {
    const delay = i * 90, life = 560 + i * 120;
    els.push(play(layer('ko-arrival-ring', { ...box(x, y, base * (1.1 + i * .2)), '--glow': GOLD.glow, '--core': GOLD.core }), [
      { opacity: 0, transform: 'scaleY(.55) scale(.25)', borderWidth: `${9 - i * 3}px` },
      { offset: .08, opacity: 1, transform: 'scaleY(.55) scale(.5)' },
      { opacity: 0, transform: `scaleY(.55) scale(${3.2 + i * 1.2})`, borderWidth: '1px' },
    ], { duration: life, delay, easing: 'cubic-bezier(.15,.75,.3,1)' }));
  }
  els.push(particles(x, y, base, ok.low ? 24 : 64, 'rise'));
  return () => els.forEach((el) => el.remove());
}

function championBlast(x: number, y: number, base: number, ok: { low: boolean; flash: boolean }) {
  const els: HTMLElement[] = [];
  if (ok.flash) {
    // A hard white frame, then red.
    els.push(play(layer('ko-arrival-whiteout'), [{ opacity: .9 }, { offset: .25, opacity: .55 }, { opacity: 0 }], { duration: 240, easing: 'ease-out' }));
    els.push(play(layer('ko-arrival-screenflash ko-arrival-screenflash--champion', { '--x': `${x}px`, '--y': `${y}px` }), [{ opacity: 0 }, { offset: .15, opacity: .85 }, { opacity: 0 }], { duration: 620, easing: 'ease-out' }));
    els.push(play(layer('ko-arrival-flash', { ...box(x, y, base * 2.2), '--core': RED.core, '--glow': RED.hot }), [
      { opacity: 1, transform: 'scale(.4)' }, { offset: .15, opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.5)' },
    ], { duration: 380, easing: 'cubic-bezier(.2,.7,.3,1)' }));
  }
  // A thick, burning shockwave rolling out across the floor, and a second, darker one behind it.
  els.push(play(layer('ko-arrival-shockwave', box(x, y + base * .2, base * 1.2)), [
    { opacity: 1, transform: 'scaleY(.5) scale(.3)' }, { offset: .12, opacity: 1, transform: 'scaleY(.5) scale(1)' },
    { opacity: 0, transform: 'scaleY(.5) scale(6.5)' },
  ], { duration: 760, easing: 'cubic-bezier(.1,.8,.25,1)' }));
  els.push(play(layer('ko-arrival-shockwave ko-arrival-shockwave--dark', box(x, y + base * .2, base * 1.2)), [
    { opacity: 0, transform: 'scaleY(.5) scale(.3)' }, { offset: .1, opacity: .9, transform: 'scaleY(.5) scale(.8)' },
    { opacity: 0, transform: 'scaleY(.5) scale(4.2)' },
  ], { duration: 900, delay: 90, easing: 'cubic-bezier(.1,.8,.25,1)' }));
  // Vertical fire burst from the slot.
  els.push(play(layer('ko-arrival-eruption', { left: `${x - base * .55}px`, top: `${y - base * 1.6}px`, width: `${base * 1.1}px`, height: `${base * 1.9}px` }), [
    { opacity: 0, transform: 'scaleY(.1) scaleX(.6)', transformOrigin: '50% 100%' },
    { offset: .12, opacity: 1, transform: 'scaleY(1) scaleX(1)', transformOrigin: '50% 100%' },
    { opacity: 0, transform: 'scaleY(1.2) scaleX(.3)', transformOrigin: '50% 100%' },
  ], { duration: 560, easing: 'cubic-bezier(.2,.7,.3,1)' }));
  els.push(particles(x, y, base, ok.low ? 30 : 110, 'blast'));
  return () => els.forEach((el) => el.remove());
}

// ---------------------------------------------------------------- canvases

function localCanvas(className: string, x: number, y: number, w: number, h: number, ay = .5) {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.setAttribute('aria-hidden', 'true');
  const ratio = Math.min(1.5, window.devicePixelRatio || 1);
  const ox = x - w / 2, oy = y - h * ay;
  Object.assign(canvas.style, { left: `${ox}px`, top: `${oy}px`, width: `${w}px`, height: `${h}px` });
  canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { canvas, ctx, ox, oy };
}

/** Legendary: gentle motes of light rising around the hovering card. */
function motes(x: number, y: number, size: number, start: number, landing: number) {
  const W = size * 2.6, H = size * 2.2;
  const { canvas, ctx, ox, oy } = localCanvas('ko-arrival-motes', x, y, W, H, .55);
  if (!ctx) { canvas.remove(); return canvas; }
  const t0 = performance.now();
  const parts = Array.from({ length: 34 }, () => ({
    x: x - ox + (Math.random() - .5) * W * .8, y: y - oy + H * (.1 + Math.random() * .45),
    vy: -(18 + Math.random() * 40), born: start + Math.random() * Math.max(1, landing - start - 120), size: .8 + Math.random() * 1.8, tw: Math.random() * 6,
  }));
  const end = landing + 200;
  const step = (now: number) => {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const age = (t - p.born) / 1000;
      if (age < 0) continue;
      const py = p.y + p.vy * age, fade = Math.min(1, age * 3) * (t > landing ? Math.max(0, 1 - (t - landing) / 200) : 1);
      const a = fade * (.55 + .45 * Math.sin(p.tw + t / 90));
      ctx.fillStyle = `rgba(${GOLD.ray},${a * .25})`; ctx.beginPath(); ctx.arc(p.x, py, p.size * 3.2, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(${GOLD.core},${a})`; ctx.beginPath(); ctx.arc(p.x, py, p.size, 0, 7); ctx.fill();
    }
    if (t < end) requestAnimationFrame(step); else canvas.remove();
  };
  requestAnimationFrame(step);
  window.setTimeout(() => canvas.remove(), end + 300);
  return canvas;
}

/** Champion: forked red lightning lashing in towards the card, faster as the drop nears. */
function lightning(x: number, y: number, size: number, start: number, landing: number) {
  const W = size * 3.2, H = size * 3;
  const { canvas, ctx, ox, oy } = localCanvas('ko-arrival-lightning', x, y, W, H);
  if (!ctx) { canvas.remove(); return canvas; }
  const cx = x - ox, cy = y - oy, t0 = performance.now();
  let next = 0, bolts: { pts: [number, number][]; born: number; w: number }[] = [];
  const bolt = (now: number) => {
    const ang = Math.random() * Math.PI * 2, r0 = size * (1.15 + Math.random() * .35), r1 = size * .42;
    const pts: [number, number][] = [];
    const segs = 9;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs, r = r0 + (r1 - r0) * k, j = (i === 0 || i === segs) ? 0 : (Math.random() - .5) * size * .22;
      pts.push([cx + Math.cos(ang) * r - Math.sin(ang) * j, cy + Math.sin(ang) * r + Math.cos(ang) * j]);
    }
    bolts.push({ pts, born: now, w: 1.2 + Math.random() * 1.6 });
  };
  const step = (now: number) => {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    if (t >= start && t < landing) {
      const k = (t - start) / Math.max(1, landing - start);
      if (t >= next) { bolt(t); if (Math.random() < k) bolt(t); next = t + (140 - 110 * k) * (.6 + Math.random() * .8); }
    }
    bolts = bolts.filter((b) => t - b.born < 110);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
    for (const b of bolts) {
      const a = 1 - (t - b.born) / 110;
      for (const [w, c] of [[b.w * 5, `rgba(${RED.glow},${a * .35})`], [b.w * 2, `rgba(${RED.hot},${a * .8})`], [b.w * .7, `rgba(255,240,230,${a})`]] as const) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
        b.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
      }
    }
    if (t < landing + 140) requestAnimationFrame(step); else canvas.remove();
  };
  requestAnimationFrame(step);
  window.setTimeout(() => canvas.remove(), landing + 400);
  return canvas;
}

/** Legendary sparkles float up; champion embers and rubble blast out and rain down. */
function particles(x: number, y: number, base: number, count: number, mode: 'rise' | 'blast') {
  const W = base * (mode === 'blast' ? 6 : 5), H = base * (mode === 'blast' ? 5 : 4.4);
  const { canvas, ctx, ox, oy } = localCanvas('ko-arrival-embers', x, y, W, H, .62);
  if (!ctx) { canvas.remove(); return canvas; }
  const tones = mode === 'rise' ? ['#fff6d6', '#ffe08a', '#ffc94a', '#ffffff'] : ['#ffd9a8', '#ff8a3a', '#ff4a26', '#ffb347'];
  const parts = Array.from({ length: count }, (_, i) => {
    const rock = mode === 'blast' && i % 4 === 0;
    const a = mode === 'rise' ? -Math.PI / 2 + (Math.random() - .5) * 1.4 : -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.7;
    const speed = (mode === 'rise' ? .25 + Math.random() * .5 : .5 + Math.random() * 1.1) * base * 1.6;
    return {
      x: x - ox + (Math.random() - .5) * base * .5, y: y - oy + (Math.random() - .3) * base * .4,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      size: rock ? 2.5 + Math.random() * 4 : 1.1 + Math.random() * 2.4, life: (mode === 'rise' ? 900 : 700) + Math.random() * 900, age: 0,
      tone: rock ? '#2a1712' : tones[Math.floor(Math.random() * tones.length)]!, rock, spin: Math.random() * 6, tw: Math.random() * 6,
    };
  });
  let last = performance.now();
  const step = (now: number) => {
    const dt = Math.max(0, Math.min(40, now - last)) / 1000; last = now;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      p.age += dt * 1000;
      if (p.age >= p.life) continue;
      alive++;
      if (mode === 'rise') { p.vx *= Math.pow(.3, dt); p.vy = p.vy * Math.pow(.4, dt) - base * .25 * dt; }
      else { p.vx *= Math.pow(p.rock ? .5 : .2, dt); p.vy = p.vy * Math.pow(p.rock ? .6 : .3, dt) + base * (p.rock ? 3.2 : 1.1) * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const t = p.age / p.life;
      if (p.rock) {
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, (1 - t) * 1.6);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin + p.age / 120); ctx.fillStyle = p.tone;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .7); ctx.restore();
        continue;
      }
      ctx.globalCompositeOperation = 'lighter';
      const a = (1 - t) * (.6 + .4 * Math.sin(p.tw + p.age / (mode === 'rise' ? 70 : 45))), r = p.size * (1 - t * .4);
      ctx.fillStyle = p.tone;
      ctx.globalAlpha = Math.max(0, a * .22); ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, 7); ctx.fill();
      ctx.globalAlpha = Math.max(0, a); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
    }
    if (alive) requestAnimationFrame(step); else canvas.remove();
  };
  requestAnimationFrame(step);
  window.setTimeout(() => canvas.remove(), 2400);
  return canvas;
}
