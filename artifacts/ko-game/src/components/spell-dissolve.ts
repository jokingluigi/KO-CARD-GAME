import { readCombatPreferences } from './combat-preferences';
import './spell-dissolve.css';

/**
 * A cast spell card breaks apart into glowing arcane dust, the way spell cards burn
 * away once they resolve. Fire-and-forget layers on document.body; presentation only.
 */
export function spawnSpellDissolve({ left, top, width, height, finisher = false }: {
  left: number; top: number; width: number; height: number; finisher?: boolean;
}): () => void {
  if (typeof document === 'undefined') return () => {};
  const prefs = readCombatPreferences();
  if (prefs.reducedMotion) return () => {};
  const tones = finisher ? ['#fff1d6', '#ffc46b', '#ff7a3a', '#ffe3a0'] : ['#ffffff', '#e6dcff', '#b79bff', '#8fd3ff'];
  const glow = finisher ? '255,150,60' : '170,130,255';
  const els: HTMLElement[] = [];

  // A soft flash where the card was.
  if (prefs.flash > 0) {
    const f = document.createElement('div');
    f.className = 'ko-spell-dissolve-flash';
    f.setAttribute('aria-hidden', 'true');
    Object.assign(f.style, { left: `${left - width * .4}px`, top: `${top - height * .3}px`, width: `${width * 1.8}px`, height: `${height * 1.6}px` });
    f.style.setProperty('--glow', glow);
    document.body.appendChild(f);
    try { f.animate([{ opacity: 0, transform: 'scale(.8)' }, { offset: .2, opacity: .9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.25)' }], { duration: 520, easing: 'ease-out', fill: 'both' }).onfinish = () => f.remove(); } catch { /* visual only */ }
    window.setTimeout(() => f.remove(), 800);
    els.push(f);
  }

  // Dust: sampled over the card face, lifting and spiralling away.
  const W = width * 2.6, H = height * 2.2, ox = left + width / 2 - W / 2, oy = top + height * .62 - H * .62;
  const canvas = document.createElement('canvas');
  canvas.className = 'ko-spell-dissolve';
  canvas.setAttribute('aria-hidden', 'true');
  const ratio = Math.min(1.5, window.devicePixelRatio || 1);
  Object.assign(canvas.style, { left: `${ox}px`, top: `${oy}px`, width: `${W}px`, height: `${H}px` });
  canvas.width = Math.round(W * ratio); canvas.height = Math.round(H * ratio);
  document.body.appendChild(canvas);
  els.push(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return () => els.forEach((el) => el.remove()); }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const count = prefs.quality === 'LOW' ? 70 : finisher ? 240 : 180;
  const cx = left + width / 2 - ox, cy = top + height / 2 - oy;
  const parts = Array.from({ length: count }, () => {
    const px = left - ox + Math.random() * width, py = top - oy + Math.random() * height;
    // Burns from the bottom edge up: lower particles leave first.
    const delay = (1 - (py - (top - oy)) / height) * 220 + Math.random() * 60;
    const a = Math.atan2(py - cy, px - cx);
    const speed = 30 + Math.random() * 90;
    return { x: px, y: py, vx: Math.cos(a) * speed * .7, vy: Math.sin(a) * speed * .4 - (40 + Math.random() * 90), delay, life: 520 + Math.random() * 600, size: .8 + Math.random() * 2, tone: tones[Math.floor(Math.random() * tones.length)]!, swirl: (Math.random() - .5) * 4 };
  });
  const t0 = performance.now();
  let last = t0;
  const step = (now: number) => {
    const t = now - t0, dt = Math.max(0, Math.min(40, now - last)) / 1000; last = now;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    let alive = 0;
    for (const p of parts) {
      const age = t - p.delay;
      if (age < 0) { alive++; continue; }
      if (age > p.life) continue;
      alive++;
      const k = age / p.life;
      const vx = p.vx + Math.cos(age / 120) * p.swirl * 18;
      p.x += vx * dt; p.y += p.vy * dt; p.vy -= 30 * dt;
      const a = (1 - k) * (k < .08 ? k / .08 : 1);
      ctx.fillStyle = p.tone;
      ctx.globalAlpha = a * .25; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, 7); ctx.fill();
      ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * .5), 0, 7); ctx.fill();
    }
    if (alive && t < 1600) requestAnimationFrame(step); else canvas.remove();
  };
  requestAnimationFrame(step);
  window.setTimeout(() => canvas.remove(), 1900);
  return () => els.forEach((el) => el.remove());
}

/** The card itself: flares bright, then burns away bottom-up while the dust takes over. */
export function spellBurnFrames(finisher = false): Keyframe[] {
  const tint = finisher ? 'rgba(255,150,60,.9)' : 'rgba(170,130,255,.9)';
  return [
    { offset: 0, opacity: 1, filter: `drop-shadow(0 0 6px ${tint}) brightness(1)`, maskPosition: '0 0%', webkitMaskPosition: '0 0%' },
    { offset: .22, opacity: 1, filter: `drop-shadow(0 0 22px ${tint}) brightness(1.7)`, maskPosition: '0 0%', webkitMaskPosition: '0 0%' },
    { offset: 1, opacity: 0, filter: `drop-shadow(0 0 30px ${tint}) brightness(2.2)`, maskPosition: '0 100%', webkitMaskPosition: '0 100%' },
  ];
}
