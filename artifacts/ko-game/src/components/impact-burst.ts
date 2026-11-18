import { readCombatPreferences } from './combat-preferences';
import { crackShapes, damageSplashPath, impactBurstProfile, type ImpactBurstProfile } from './impact-burst-model';
import './impact-burst.css';

/**
 * Slam effects are fire-and-forget DOM layers on document.body: the dust and the
 * damage badge must keep playing after the attack card has already gone home,
 * so they cannot live inside the attack portal. Presentation only; nothing here
 * reads or changes battle state.
 */

const SVG = 'http://www.w3.org/2000/svg';
let sequence = 0;

function profileFor(damage: number, finisher: boolean, reduced: boolean): ImpactBurstProfile | null {
  const prefs = readCombatPreferences();
  return impactBurstProfile(damage, finisher, {
    quality: prefs.quality,
    flash: prefs.flash,
    reduced: reduced || prefs.reducedMotion,
    viewportMin: Math.min(window.innerWidth, window.innerHeight),
  });
}

type Dust = { x: number; y: number; vx: number; vy: number; r: number; grow: number; life: number; age: number; shade: number };
type Chip = { x: number; y: number; vx: number; vy: number; size: number; angle: number; spin: number; life: number; age: number; tone: string };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; age: number };

export function spawnImpactBurst({ x, y, dx, dy, damage, finisher = false, reduced = false, crackAt }: {
  x: number; y: number; dx: number; dy: number; damage: number; finisher?: boolean; reduced?: boolean;
  /** Where the floor cracks spread from (the struck card's centre). Defaults to the contact point. */
  crackAt?: { x: number; y: number };
}): () => void {
  const profile = profileFor(damage, finisher, reduced);
  if (!profile || typeof document === 'undefined') return () => {};
  const id = ++sequence;
  const travel = Math.atan2(dy, dx);

  const root = document.createElement('div');
  root.className = `ko-impact-burst ko-impact-burst--${profile.tier.toLowerCase()}`;
  root.setAttribute('aria-hidden', 'true');
  root.dataset.impactTier = profile.tier;
  root.style.setProperty('--ib-x', `${x}px`);
  root.style.setProperty('--ib-y', `${y}px`);
  root.style.setProperty('--ib-flash', String(profile.screenFlash));
  root.style.setProperty('--ib-flash-size', `${profile.flashSize}px`);

  if (profile.screenFlash > 0) root.appendChild(Object.assign(document.createElement('div'), { className: 'ko-impact-burst__screen' }));
  const canvas = document.createElement('canvas');
  canvas.className = 'ko-impact-burst__particles';
  root.appendChild(canvas);
  root.appendChild(Object.assign(document.createElement('div'), { className: 'ko-impact-burst__flash' }));
  root.appendChild(Object.assign(document.createElement('div'), { className: 'ko-impact-burst__ring' }));

  document.body.appendChild(root);

  const context = canvas.getContext('2d');
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  context?.scale(ratio, ratio);

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  // Dust is pushed out in every direction along the board, a little more forward.
  const dust: Dust[] = Array.from({ length: profile.dust }, () => {
    const angle = Math.random() < .6 ? travel + rand(-1.4, 1.4) : rand(0, Math.PI * 2);
    const speed = profile.speed * rand(.18, .42);
    return { x: x + Math.cos(angle) * 10, y: y + Math.sin(angle) * 10, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - .03, r: rand(14, 24) * (profile.flashSize / 220), grow: rand(.035, .07), life: profile.life * rand(.6, 1), age: 0, shade: rand(0, 1) };
  });
  const chips: Chip[] = Array.from({ length: profile.debris }, () => {
    const angle = travel + rand(-1.5, 1.5);
    const speed = profile.speed * rand(.45, 1);
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - rand(.15, .45), size: rand(3, 7) + (profile.tier === 'LIGHT' ? 0 : 2), angle: rand(0, Math.PI), spin: rand(-.025, .025), life: profile.life * rand(.55, .85), age: 0, tone: Math.random() < .5 ? '#7d6a55' : '#a08b70' };
  });
  const sparks: Spark[] = Array.from({ length: profile.sparks }, () => {
    const angle = travel + rand(-1.2, 1.2);
    const speed = profile.speed * rand(.9, 1.6);
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(120, 260), age: 0 };
  });
  // Floor cracks: drawn on a layer inside the board (so they shake with it) and cut out
  // wherever a card or the battle UI sits, so they read as cracks in the floor beneath.
  const crackReach = profile.flashSize * .5;
  const stage = profile.cracks ? document.querySelector<HTMLElement>('.ko-game-stage') : null;
  const stageRect = stage?.getBoundingClientRect();
  const ox = stageRect?.left ?? 0, oy = stageRect?.top ?? 0;
  const centre = crackAt ?? { x, y };
  const cracks = crackShapes(centre.x - ox, centre.y - oy, profile.cracks ? 4 + Math.round(profile.cracks / 3) : 0, crackReach, 8 + profile.cracks * .45, Math.random() * 1000 + 1);
  const covers = cracks.length && stage
    ? Array.from(stage.querySelectorAll<HTMLElement>('[data-card-instance-id], .ko-game-controls, .ko-player-hand, .ko-opponent-hand'))
      .map(node => node.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0)
      .map(r => ({ x: r.left - ox, y: r.top - oy, w: r.width, h: r.height }))
    : [];
  let crackCanvas: HTMLCanvasElement | null = null, crackContext: CanvasRenderingContext2D | null = null;
  if (cracks.length) {
    crackCanvas = document.createElement('canvas');
    crackCanvas.className = 'ko-impact-cracks';
    const width = stageRect?.width ?? window.innerWidth, height = stageRect?.height ?? window.innerHeight;
    crackCanvas.width = Math.round(width * ratio);
    crackCanvas.height = Math.round(height * ratio);
    crackCanvas.style.width = `${width}px`;
    crackCanvas.style.height = `${height}px`;
    (stage ?? root).appendChild(crackCanvas);
    crackContext = crackCanvas.getContext('2d');
    crackContext?.scale(ratio, ratio);
  }
  // The scar outlives the dust a little, like a dent left in the floor.
  const crackLife = profile.life * 1.5;

  const start = performance.now();
  let last = start, frame = 0, done = false;
  const end = start + Math.max(profile.life, cracks.length ? crackLife : 0);
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    root.remove();
    crackCanvas?.remove();
  };
  const draw = () => {
    const now = performance.now();
    const step = Math.max(0, Math.min(34, now - last));
    last = now;
    if (context) {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const elapsed = (now - start) / profile.life;
      // Cracks split open fast (revealed outward from the centre), hold, then fade.
      if (crackContext && crackCanvas) {
        const g = crackContext, cx0 = centre.x - ox, cy0 = centre.y - oy, t = (now - start) / crackLife;
        g.clearRect(0, 0, crackCanvas.width, crackCanvas.height);
        const open = Math.min(1, t / .07);
        const alpha = t < .6 ? 1 : Math.max(0, 1 - (t - .6) / .4);
        g.save();
        g.beginPath();
        g.arc(cx0, cy0, crackReach * 1.2 * (1 - Math.pow(1 - open, 3)) + 1, 0, Math.PI * 2);
        g.clip();
        // Dented crater.
        const crater = g.createRadialGradient(cx0, cy0, 0, cx0, cy0, crackReach * .45);
        crater.addColorStop(0, `rgba(16,9,4,${alpha * .55})`);
        crater.addColorStop(.55, `rgba(16,9,4,${alpha * .25})`);
        crater.addColorStop(1, 'rgba(16,9,4,0)');
        g.fillStyle = crater;
        g.beginPath();
        g.arc(cx0, cy0, crackReach * .45, 0, Math.PI * 2);
        g.fill();
        for (const crack of cracks) {
          // Lit lip first, offset up-left, then the dark fissure over it: a bevelled split.
          g.beginPath();
          crack.outline.forEach(([px, py], i) => i ? g.lineTo(px - 1.2, py - 1.2) : g.moveTo(px - 1.2, py - 1.2));
          g.closePath();
          g.fillStyle = `rgba(255,226,180,${alpha * .28})`;
          g.fill();
          g.beginPath();
          crack.outline.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py));
          g.closePath();
          g.fillStyle = `rgba(12,6,3,${alpha * .95})`;
          g.shadowColor = `rgba(0,0,0,${alpha * .6})`;
          g.shadowBlur = 4;
          g.shadowOffsetY = 1;
          g.fill();
          g.shadowBlur = 0;
          g.shadowOffsetY = 0;
        }
        g.restore();
        // Cards and the battle UI sit on top of the floor: cut them out of the cracks.
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = '#000';
        for (const r of covers) {
          g.beginPath();
          g.roundRect(r.x, r.y, r.w, r.h, 8);
          g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      }
      for (const d of dust) {
        d.age += step;
        if (d.age >= d.life) continue;
        const drag = Math.pow(.992, step);
        d.vx *= drag; d.vy = d.vy * drag - .00006 * step;
        d.x += d.vx * step; d.y += d.vy * step;
        d.r += d.grow * step;
        const t = d.age / d.life;
        const alpha = (t < .12 ? t / .12 : 1 - (t - .12) / .88) * .8;
        // Warm grey board dust; some puffs darker so they read on light parchment too.
        const tone = Math.round(150 + d.shade * 75);
        const gradient = context.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        gradient.addColorStop(0, `rgba(${tone},${tone - 14},${tone - 34},${alpha})`);
        gradient.addColorStop(.55, `rgba(${tone},${tone - 14},${tone - 34},${alpha * .6})`);
        gradient.addColorStop(1, `rgba(${tone},${tone - 14},${tone - 34},0)`);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        context.fill();
      }
      for (const c of chips) {
        c.age += step;
        if (c.age >= c.life) continue;
        c.vx *= Math.pow(.996, step);
        c.vy += .0028 * step;
        c.x += c.vx * step; c.y += c.vy * step; c.angle += c.spin * step;
        const t = c.age / c.life;
        context.save();
        context.globalAlpha = t < .75 ? 1 : 1 - (t - .75) / .25;
        context.translate(c.x, c.y);
        context.rotate(c.angle);
        context.beginPath();
        context.moveTo(-c.size, -c.size * .4); context.lineTo(c.size * .3, -c.size * .8); context.lineTo(c.size, c.size * .3); context.lineTo(-c.size * .2, c.size * .7);
        context.closePath();
        context.fillStyle = c.tone;
        context.fill();
        context.lineWidth = 1.4;
        context.strokeStyle = '#2b2118';
        context.stroke();
        context.restore();
      }
      context.globalCompositeOperation = 'lighter';
      context.lineCap = 'round';
      for (const s of sparks) {
        s.age += step;
        if (s.age >= s.life) continue;
        s.vx *= Math.pow(.99, step); s.vy *= Math.pow(.99, step);
        s.x += s.vx * step; s.y += s.vy * step;
        const t = s.age / s.life;
        context.strokeStyle = t < .3 ? `rgba(255,255,240,${1 - t})` : `rgba(255,200,110,${1 - t})`;
        context.lineWidth = 2.6 * (1 - t * .6);
        context.beginPath();
        context.moveTo(s.x, s.y);
        context.lineTo(s.x - s.vx * 16, s.y - s.vy * 16);
        context.stroke();
      }
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
    }
    if (now < end) frame = requestAnimationFrame(draw);
    else finish();
  };
  frame = requestAnimationFrame(draw);
  // Safety net if animation frames stop (background tab).
  window.setTimeout(finish, profile.life + 400);
  return finish;
}

/** Fiery orange damage splash with the number, slammed onto the struck card. */
export function spawnDamageBadge({ x, y, damage, finisher = false, reduced = false }: {
  x: number; y: number; damage: number; finisher?: boolean; reduced?: boolean;
}): () => void {
  const profile = profileFor(damage, finisher, reduced);
  if (!profile || typeof document === 'undefined') return () => {};
  const id = ++sequence;
  const size = profile.badgeSize, r = size / 2;
  const f1 = (n: number) => n.toFixed(1);
  const badge = document.createElement('div');
  badge.className = `ko-damage-badge ko-damage-badge--${profile.tier.toLowerCase()}`;
  badge.setAttribute('aria-hidden', 'true');
  badge.style.left = `${x}px`;
  badge.style.top = `${y}px`;
  badge.style.width = `${size}px`;
  badge.style.height = `${size}px`;
  badge.style.setProperty('--badge-tilt', `${Math.round((Math.random() - .5) * 16)}deg`);
  badge.innerHTML = `
    <svg viewBox="${-r - 4} ${-r - 4} ${size + 8} ${size + 8}">
      <defs><radialGradient id="ko-db-${id}" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#ffc061"/><stop offset=".55" stop-color="#ff8a2a"/><stop offset="1" stop-color="#e05510"/></radialGradient></defs>
      <path d="${damageSplashPath(r, id * 2.9 + Math.random() * 40)}" fill="url(#ko-db-${id})" stroke="#6e2604" stroke-width="3" stroke-linejoin="round"/>
      <ellipse cx="${f1(-r * .22)}" cy="${f1(-r * .28)}" rx="${f1(r * .34)}" ry="${f1(r * .17)}" fill="#fff" opacity=".35" transform="rotate(-25 ${f1(-r * .22)} ${f1(-r * .28)})"/>
    </svg>
    <span>-${Math.max(0, Math.round(damage))}</span>`;
  document.body.appendChild(badge);
  let done = false;
  const finish = () => { if (!done) { done = true; badge.remove(); } };
  badge.addEventListener('animationend', event => { if (event.target === badge) finish(); });
  window.setTimeout(finish, reduced ? 900 : 1300);
  return finish;
}

/**
 * Landing dust for a card set down on the board: puffs roll out sideways from under
 * the card's bottom edge (more, bigger and faster for heavier cards), a flat dust ring
 * spreads across the table and heavy cards kick up a few stone chips.
 */
export function spawnLandingDust({ left, top, width, height, weight }: {
  left: number; top: number; width: number; height: number; weight: number;
}): () => void {
  const prefs = readCombatPreferences();
  if (typeof document === 'undefined' || prefs.reducedMotion || weight <= 0) return () => {};
  const w = Math.max(0, Math.min(5, weight)), detail = prefs.quality === 'LOW' ? .4 : prefs.quality === 'MEDIUM' ? .7 : 1;
  const root = document.createElement('div');
  root.className = 'ko-impact-burst ko-landing-dust';
  root.setAttribute('aria-hidden', 'true');
  const bottom = top + height, cx = left + width / 2;
  root.style.setProperty('--ld-x', `${cx}px`);
  root.style.setProperty('--ld-y', `${bottom - height * .06}px`);
  root.style.setProperty('--ld-w', `${width * (1.5 + w * .35)}px`);
  if (w >= 2) root.appendChild(Object.assign(document.createElement('div'), { className: 'ko-landing-dust__ring' }));
  const canvas = document.createElement('canvas');
  canvas.className = 'ko-impact-burst__particles';
  root.appendChild(canvas);
  document.body.appendChild(root);
  const context = canvas.getContext('2d');
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  context?.scale(ratio, ratio);
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const life = 520 + w * 120;
  const puffs = Array.from({ length: Math.round((6 + w * 6) * detail) }, () => {
    const side = Math.random() < .5 ? -1 : 1;
    const fromEdge = Math.random() < .7;
    const x = fromEdge ? cx + side * rand(.1, .5) * width : cx + side * width * .5;
    const y = fromEdge ? bottom - rand(0, .08) * height : bottom - rand(.05, .45) * height;
    const speed = rand(.08, .2) * (1 + w * .35);
    return { x, y, vx: side * speed, vy: -rand(.005, .04) * (1 + w * .2), r: rand(8, 15) * (width / 120) * (1 + w * .12), grow: rand(.03, .06), life: life * rand(.6, 1), age: 0, shade: rand(0, 1) };
  });
  const chips = Array.from({ length: w >= 3 ? Math.round((w - 2) * 5 * detail) : 0 }, () => {
    const side = Math.random() < .5 ? -1 : 1;
    return { x: cx + side * rand(.2, .5) * width, y: bottom, vx: side * rand(.15, .4), vy: -rand(.35, .7), size: rand(2.5, 5), angle: rand(0, 6), spin: rand(-.02, .02), life: rand(380, 600), age: 0 };
  });
  const start = performance.now();
  let last = start, frame = 0, done = false;
  const finish = () => { if (!done) { done = true; cancelAnimationFrame(frame); root.remove(); } };
  const draw = () => {
    const now = performance.now(), step = Math.max(0, Math.min(34, now - last));
    last = now;
    if (context) {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const d of puffs) {
        d.age += step;
        if (d.age >= d.life) continue;
        const drag = Math.pow(.993, step);
        d.vx *= drag; d.vy = d.vy * drag - .00004 * step;
        d.x += d.vx * step; d.y += d.vy * step; d.r += d.grow * step;
        const t = d.age / d.life, alpha = (t < .1 ? t / .1 : 1 - (t - .1) / .9) * .7;
        const tone = Math.round(150 + d.shade * 75);
        const g = context.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        g.addColorStop(0, `rgba(${tone},${tone - 14},${tone - 34},${alpha})`);
        g.addColorStop(.55, `rgba(${tone},${tone - 14},${tone - 34},${alpha * .55})`);
        g.addColorStop(1, `rgba(${tone},${tone - 14},${tone - 34},0)`);
        context.fillStyle = g;
        context.beginPath(); context.arc(d.x, d.y, d.r, 0, Math.PI * 2); context.fill();
      }
      for (const c of chips) {
        c.age += step;
        if (c.age >= c.life) continue;
        c.vy += .0028 * step; c.x += c.vx * step; c.y += c.vy * step; c.angle += c.spin * step;
        context.save();
        context.globalAlpha = c.age / c.life < .75 ? 1 : 1 - (c.age / c.life - .75) / .25;
        context.translate(c.x, c.y); context.rotate(c.angle);
        context.fillStyle = '#8a7660'; context.strokeStyle = '#2b2118'; context.lineWidth = 1.2;
        context.beginPath(); context.moveTo(-c.size, -c.size * .4); context.lineTo(c.size * .3, -c.size * .8); context.lineTo(c.size, c.size * .3); context.lineTo(-c.size * .2, c.size * .7); context.closePath();
        context.fill(); context.stroke(); context.restore();
      }
      context.globalAlpha = 1;
    }
    if (now < start + life) frame = requestAnimationFrame(draw); else finish();
  };
  frame = requestAnimationFrame(draw);
  window.setTimeout(finish, life + 400);
  return finish;
}
