import { audioManager } from '../audio/audio-manager';
import { readCombatPreferences } from './combat-preferences';
import './battle-juice.css';

/**
 * 타격감·연출 모음 (화면 연출 전용).
 * 게임 규칙·카드 정보·서버와는 전혀 상관없고, 화면과 소리만 만든다.
 * 모든 연출은 document.body 위에 잠깐 붙었다가 스스로 사라진다.
 */

type Prefs = { reduced: boolean; low: boolean; flash: number };
function prefs(): Prefs {
  if (typeof document === 'undefined') return { reduced: true, low: true, flash: 0 };
  const p = readCombatPreferences();
  const media = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { reduced: p.reducedMotion || media, low: p.quality === 'LOW', flash: p.flash };
}
const live = () => typeof document !== 'undefined' && !document.hidden;

export function synth(name: string) { return `${import.meta.env.BASE_URL}vendor/ko-synth/${name}`; }
/** 화면 왼쪽에서 난 소리는 왼쪽 스피커에서 더 크게 (43). */
export function panAt(x: number | undefined) {
  if (x === undefined || typeof innerWidth !== 'number' || !innerWidth) return undefined;
  return Math.max(-1, Math.min(1, (x / innerWidth) * 2 - 1)) * .7;
}
export function juiceSound(name: string, volume: number, priority = 3, x?: number, pitch?: number) {
  if (!live()) return;
  audioManager.playImpactOverlay(name.includes('/') ? name : synth(name), volume, priority, { pan: panAt(x), pitch });
}

function layer(className: string, style: Record<string, string> = {}, parent: Element = document.body, html = '') {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  for (const [k, v] of Object.entries(style)) el.style.setProperty(k, v);
  if (html) el.innerHTML = html;
  parent.appendChild(el);
  return el;
}
function play(el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions, remove = true) {
  let done = false;
  const end = () => { if (done) return; done = true; if (remove) el.remove(); };
  try { const a = el.animate(frames, { fill: 'both', ...options }); if (remove) a.onfinish = end; } catch { /* visual only */ }
  if (remove) window.setTimeout(end, Number(options.duration ?? 0) + Number(options.delay ?? 0) + 250);
  return el;
}
const px = (n: number) => `${Math.round(n)}px`;

export function cardElement(id?: string | null): HTMLElement | null {
  if (!id || typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(`[data-card-instance-id="${CSS.escape(id)}"]`);
}
function centerOf(el: Element | null) {
  const r = el?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, r } : null;
}

// ─────────────────────────────── 2. 콤보 표시
let combo = { count: 0, at: 0 };
export function resetCombo() { combo = { count: 0, at: 0 }; document.querySelectorAll('.kj-combo').forEach(n => n.remove()); }
/** 한 턴 안에서 같은 편이 연속으로 때리면 2 HIT!, 3 HIT!… */
export function registerComboHit(mine: boolean) {
  combo.count += 1; combo.at = Date.now();
  if (combo.count < 2 || !live()) return combo.count;
  const n = combo.count;
  document.querySelectorAll('.kj-combo').forEach(node => node.remove());
  const el = layer(`kj-combo ${mine ? 'kj-combo--mine' : 'kj-combo--foe'}`, { '--kj-size': `${Math.min(1.7, 1 + (n - 2) * .14)}` }, document.body,
    `<b>${n}</b><span>HIT${n >= 5 ? '!!' : '!'}</span>`);
  const { reduced } = prefs();
  play(el, reduced
    ? [{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .8 }, { opacity: 0 }]
    : [{ opacity: 0, transform: 'translate(-50%,-50%) scale(2.2) rotate(-8deg)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(.92) rotate(-4deg)', offset: .08 },
      { transform: 'translate(-50%,-50%) scale(1.06) rotate(-5deg)', offset: .14 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(-5deg)', offset: .8 },
      { opacity: 0, transform: 'translate(-50%,-62%) scale(.96) rotate(-5deg)' }], { duration: 1500, easing: 'ease-out' });
  juiceSound('combo-hit.mp3', 30 + Math.min(20, n * 4), 3, mine ? innerWidth * .3 : innerWidth * .7, 1 + Math.min(.4, (n - 2) * .08));
  return n;
}

// ─────────────────────────────── 4. 큰 타격의 색 갈라짐
export function spawnChromaSplit(power: number) {
  const { reduced, low, flash } = prefs();
  if (reduced || low || flash <= 0 || !live()) return;
  const el = layer('kj-chroma', { '--kj-chroma': `${Math.min(1, power) * flash}` });
  play(el, [{ opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
  const stage = document.querySelector<HTMLElement>('.ko-game-stage');
  if (stage) try {
    stage.animate([{ filter: 'none' }, { filter: `drop-shadow(${3 * power}px 0 0 rgba(255,40,60,.55)) drop-shadow(${-3 * power}px 0 0 rgba(40,200,255,.5))`, offset: .1 }, { filter: 'none' }],
      { duration: 260, easing: 'ease-out' });
  } catch { /* visual only */ }
}

// ─────────────────────────────── 6. 맞은 자리 조명 / 32. 그을린 자국
export function spawnTableLight(x: number, y: number, damage: number) {
  if (!live()) return;
  const { reduced, flash } = prefs();
  const size = Math.min(620, 220 + damage * 34);
  const table = document.querySelector('.ko-table-scene');
  if (table) play(layer('kj-table-light', { left: px(x), top: px(y), '--kj-size': px(size) }, table),
    [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.55)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .14 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.15)' }],
    { duration: reduced ? 260 : 620, easing: 'ease-out' });
  if (flash > 0) play(layer('kj-card-light', { left: px(x), top: px(y), '--kj-size': px(size * 1.25), '--kj-flash': `${Math.min(1, flash)}` }),
    [{ opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 0 }], { duration: reduced ? 220 : 520, easing: 'ease-out' });
}
export function spawnScorch(x: number, y: number, damage: number) {
  const table = document.querySelector('.ko-table-scene');
  if (!table || !live() || prefs().low) return;
  const old = table.querySelectorAll('.kj-scorch');
  if (old.length >= 6) old[0]?.remove();
  const size = Math.min(260, 110 + damage * 12);
  const seed = Math.random() * 360;
  const el = layer('kj-scorch', { left: px(x), top: px(y), '--kj-size': px(size), '--kj-rot': `${seed}deg` }, table);
  play(el, [{ opacity: 0, transform: 'translate(-50%,-50%) rotate(var(--kj-rot)) scale(.6)' }, { opacity: .95, transform: 'translate(-50%,-50%) rotate(var(--kj-rot)) scale(1)', offset: .25 }, { opacity: .8, transform: 'translate(-50%,-50%) rotate(var(--kj-rot)) scale(1)' }],
    { duration: 700, easing: 'ease-out' }, false);
}
/** 다음 턴이 오면 그을음이 천천히 사라진다. */
export function fadeScorches() {
  document.querySelectorAll<HTMLElement>('.kj-scorch').forEach(el => play(el, [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: 1600, easing: 'ease-in' }));
}

// ─────────────────────────────── 9. 관중 반응
let lastCrowd = 0;
export function crowdReact(level: 1 | 2) {
  if (!live() || Date.now() - lastCrowd < 900) return;
  lastCrowd = Date.now();
  juiceSound(level === 2 ? 'crowd-cheer.mp3' : 'crowd-roar.mp3', level === 2 ? 46 : 30, 2);
  const { reduced, low, flash } = prefs();
  if (level < 2 || reduced || low || flash <= 0) return;
  for (let i = 0; i < 9; i++) {
    const el = layer('kj-camera-flash', { left: `${6 + Math.random() * 88}%`, top: `${Math.random() < .5 ? 2 + Math.random() * 10 : 88 + Math.random() * 10}%` });
    play(el, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.3)' }, { opacity: flash, transform: 'translate(-50%,-50%) scale(1)', offset: .15 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.2)' }],
      { duration: 260, delay: 120 + i * 110 + Math.random() * 80, easing: 'ease-out' });
  }
}

// ─────────────────────────────── 21. 반격 불꽃
export function spawnClashSparks(x: number, y: number, power: number) {
  if (!live()) return;
  const { reduced, low } = prefs();
  const count = reduced ? 0 : low ? 6 : 14;
  const ring = layer('kj-clash', { left: px(x), top: px(y) });
  play(ring, [{ opacity: 1, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.6)' }], { duration: 360, easing: 'ease-out' });
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * (50 + power * 6);
    const s = layer('kj-spark', { left: px(x), top: px(y), '--kj-rot': `${a}rad` });
    play(s, [{ opacity: 1, transform: `translate(-50%,-50%) rotate(${a}rad) translateX(0) scaleX(1.6)` }, { opacity: 0, transform: `translate(-50%,-50%) rotate(${a}rad) translateX(${d}px) scaleX(.4)` }],
      { duration: 260 + Math.random() * 220, easing: 'cubic-bezier(.1,.8,.3,1)' });
  }
  juiceSound('armor-ting.mp3', 22, 3, x, 1.25);
}

// ─────────────────────────────── 22. 아머로 막음: 팅!
export function spawnShieldTing(x: number, y: number) {
  if (!live()) return;
  const { reduced, low } = prefs();
  const el = layer('kj-shield', { left: px(x), top: px(y) }, document.body,
    '<svg viewBox="-50 -50 100 100"><path d="M0-44 38-22 38 22 0 44-38 22-38-22Z"/></svg>');
  play(el, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.7)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.08)', offset: .16 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.3)' }],
    { duration: 520, easing: 'ease-out' });
  if (!reduced) for (let i = 0; i < (low ? 3 : 7); i++) {
    const a = -Math.PI / 2 + (Math.random() - .5) * 2.6, d = 50 + Math.random() * 50;
    const s = layer('kj-shard', { left: px(x), top: px(y) });
    play(s, [{ opacity: 1, transform: 'translate(-50%,-50%) rotate(0deg)' }, { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 40}px)) rotate(${(Math.random() - .5) * 540}deg)` }],
      { duration: 520 + Math.random() * 200, easing: 'cubic-bezier(.2,.6,.4,1)' });
  }
  juiceSound('armor-ting.mp3', 40, 4, x);
}

// ─────────────────────────────── 23. 회피 성공: MISS + 잔상
export function spawnMiss(x: number, y: number, card: HTMLElement | null) {
  if (!live()) return;
  const { reduced } = prefs();
  const word = layer('kj-miss', { left: px(x), top: px(y) }, document.body, 'MISS');
  play(word, [{ opacity: 0, transform: 'translate(-50%,-50%) skewX(-14deg) translateX(-30px)' }, { opacity: 1, transform: 'translate(-50%,-50%) skewX(-14deg) translateX(0)', offset: .18 },
    { opacity: 1, transform: 'translate(-50%,-50%) skewX(-14deg) translateX(6px)', offset: .7 }, { opacity: 0, transform: 'translate(-50%,-70%) skewX(-14deg) translateX(14px)' }], { duration: 900, easing: 'ease-out' });
  if (card && !reduced) {
    const r = card.getBoundingClientRect();
    const ghost = layer('kj-ghost', { left: px(r.left), top: px(r.top), width: px(r.width), height: px(r.height) });
    play(ghost, [{ opacity: .55, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-18px)' }], { duration: 420, easing: 'ease-out' });
    try { card.animate([{ translate: '0 0' }, { translate: `${Math.min(34, r.width * .3)}px 0`, offset: .3 }, { translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1)', composite: 'add' }); } catch { /* visual only */ }
  }
  juiceSound('dodge-whoosh.mp3', 44, 4, x);
}

// ─────────────────────────────── 24. 과잉 데미지
export function spawnOverkill(x: number, y: number, extra: number) {
  if (!live() || extra <= 0) return;
  const el = layer('kj-overkill', { left: px(x), top: px(y) }, document.body, `<small>OVERKILL</small><b>+${extra}</b>`);
  play(el, [{ opacity: 0, transform: 'translate(-50%,-50%) rotate(6deg) scale(2)' }, { opacity: 1, transform: 'translate(-50%,-50%) rotate(6deg) scale(.95)', offset: .12 },
    { opacity: 1, transform: 'translate(-50%,-50%) rotate(6deg) scale(1)', offset: .75 }, { opacity: 0, transform: 'translate(-50%,-90%) rotate(6deg) scale(1)' }], { duration: 1300, delay: 160, easing: 'ease-out' });
}

// ─────────────────────────────── 38. 공격력·체력 강화/약화 숫자
export function spawnStatPop(cardId: string | undefined, stat: string | undefined, delta: number, fallback: { x: number; y: number }) {
  if (!live() || !delta) return;
  const key = stat === 'attack' ? 'attack' : stat === 'cost' ? 'cost' : 'health';
  const node = cardElement(cardId)?.querySelector<HTMLElement>(`[data-card-stat="${key}"]`) ?? null;
  const at = centerOf(node) ?? fallback;
  const up = delta > 0;
  const { reduced, low } = prefs();
  if (node && !reduced) try {
    node.animate(up
      ? [{ scale: '1' }, { scale: '1.9', filter: 'drop-shadow(0 0 8px #ffd36a) brightness(1.6)', offset: .22 }, { scale: '1.15', offset: .55 }, { scale: '1', filter: 'none' }]
      : [{ scale: '1' }, { scale: '.55', filter: 'grayscale(1) brightness(.7)', offset: .3 }, { scale: '1.08', offset: .65 }, { scale: '1', filter: 'none' }],
    { duration: 720, easing: 'ease-out' });
  } catch { /* visual only */ }
  if (up && !reduced) for (let i = 0; i < (low ? 4 : 9); i++) {
    const a = -Math.PI / 2 + (Math.random() - .5) * 2.2, d = 18 + Math.random() * 28;
    const s = layer('kj-ember', { left: px(at.x), top: px(at.y) });
    play(s, [{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - 16}px)) scale(.3)` }],
      { duration: 520 + Math.random() * 260, easing: 'ease-out' });
  }
  juiceSound(up ? 'stat-up.mp3' : 'stat-down.mp3', 26, 2, at.x);
}

// ─────────────────────────────── 39. 침묵: 잉크로 글자가 지워짐
export function spawnSilenceInk(cardId: string | undefined, fallback: { x: number; y: number }) {
  if (!live()) return;
  const card = cardElement(cardId);
  const r = card?.getBoundingClientRect();
  const box = r && r.width ? r : { left: fallback.x - 50, top: fallback.y - 70, width: 100, height: 140 };
  const blots = Array.from({ length: 7 }, (_, i) => {
    const cx = 15 + Math.random() * 70, cy = 48 + Math.random() * 40, rr = 10 + Math.random() * 16;
    return `<circle cx="${cx}" cy="${cy}" r="${rr}" style="animation-delay:${i * 45}ms"/>`;
  }).join('');
  const el = layer('kj-ink', { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) }, document.body,
    `<svg viewBox="0 0 100 140" preserveAspectRatio="none"><defs><filter id="kj-ink-f"><feTurbulence baseFrequency=".09" numOctaves="2" seed="${Math.floor(Math.random() * 99)}"/><feDisplacementMap in="SourceGraphic" scale="9"/></filter></defs><g filter="url(#kj-ink-f)">${blots}</g></svg>`);
  play(el, [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .65 }, { opacity: 0 }], { duration: 1400, easing: 'ease-out' });
  if (card && !prefs().reduced) try { card.animate([{ filter: 'none' }, { filter: 'grayscale(1) brightness(.75)', offset: .4 }, { filter: 'none' }], { duration: 1300, easing: 'ease-out' }); } catch { /* visual only */ }
  juiceSound('silence-smear.mp3', 34, 3, box.left + box.width / 2);
}

// ─────────────────────────────── 18. 역전!
export function spawnReversal(mine: boolean) {
  if (!live()) return;
  const { reduced } = prefs();
  const el = layer(`kj-reversal ${mine ? '' : 'kj-reversal--foe'}`, {}, document.body, `<i></i><b>${mine ? '역전!' : '역전당했다!'}</b>`);
  play(el, reduced ? [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }]
    : [{ opacity: 0, transform: 'translateX(-30%)' }, { opacity: 1, transform: 'translateX(0)', offset: .14 }, { opacity: 1, transform: 'translateX(2%)', offset: .78 }, { opacity: 0, transform: 'translateX(30%)' }],
  { duration: 1700, easing: 'cubic-bezier(.2,.8,.2,1)' });
  juiceSound('reversal-sting.mp3', mine ? 52 : 38, 5);
  if (mine) crowdReact(2);
}

// ─────────────────────────────── 15. 쓴 코스트가 동전처럼 카드로
export function spawnCostCoins(from: DOMRect | null | undefined, to: { x: number; y: number }, count: number) {
  if (!from || !from.width || !live() || count <= 0) return;
  const { reduced } = prefs();
  if (reduced) return;
  const n = Math.min(8, count);
  const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
  for (let i = 0; i < n; i++) {
    const el = layer('kj-coin', { left: px(fx), top: px(fy) });
    const mx = (fx + to.x) / 2 + (Math.random() - .5) * 80, my = Math.min(fy, to.y) - 60 - Math.random() * 40;
    play(el, [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' },
      { opacity: 1, transform: `translate(calc(-50% + ${mx - fx}px), calc(-50% + ${my - fy}px)) scale(1.1) rotateY(360deg)`, offset: .5 },
      { opacity: .9, transform: `translate(calc(-50% + ${to.x - fx}px), calc(-50% + ${to.y - fy}px)) scale(.5) rotateY(720deg)` },
    ], { duration: 520, delay: i * 55, easing: 'cubic-bezier(.4,0,.6,1)' });
    window.setTimeout(() => juiceSound('coin-tick.mp3', 18, 1, to.x, 1 + i * .05), 470 + i * 55);
  }
}

// ─────────────────────────────── 46. 보스 등장
export function spawnBossIntro(name: string, subtitle = 'BOSS BATTLE') {
  if (!live()) return;
  const { reduced } = prefs();
  const safe = name.replace(/[<>&"]/g, '');
  const el = layer('kj-boss', {}, document.body, `<i class="kj-boss__bar"></i><i class="kj-boss__bar kj-boss__bar--b"></i><div><small>${subtitle}</small><b>${safe}</b></div>`);
  play(el, [{ opacity: 0 }, { opacity: 1, offset: .08 }, { opacity: 1, offset: .82 }, { opacity: 0 }], { duration: reduced ? 1800 : 3000, easing: 'ease-out' });
  juiceSound('boss-siren.mp3', 42, 7);
}

// ─────────────────────────────── 35. 턴 넘김 금빛 띠
export function spawnTurnSweep(mine: boolean) {
  if (!live() || prefs().reduced) return;
  const el = layer(`kj-sweep ${mine ? '' : 'kj-sweep--foe'}`);
  play(el, [{ transform: `translateX(${mine ? '-110%' : '110%'}) skewX(-18deg)`, opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .7 }, { transform: `translateX(${mine ? '110%' : '-110%'}) skewX(-18deg)`, opacity: 0 }],
    { duration: 820, easing: 'cubic-bezier(.5,0,.3,1)' });
}

// ─────────────────────────────── 47. 오늘의 첫 승리 / 44. 연승 기록 (이 기기에만 저장)
const RECORD_KEY = 'ko-juice-record-v1';
export type JuiceRecord = { streak: number; best: number; lastWinDay: string; lastGame: string };
export function readJuiceRecord(): JuiceRecord {
  try { const raw = JSON.parse(localStorage.getItem(RECORD_KEY) ?? 'null'); if (raw && typeof raw.streak === 'number') return raw; } catch { /* storage may be blocked */ }
  return { streak: 0, best: 0, lastWinDay: '', lastGame: '' };
}
export function localDay(date = new Date()) { return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`; }
/** 같은 경기를 두 번 세지 않는다. 결과: 연승 수와 오늘 첫 승리 여부. */
export function recordMatchResult(gameId: string, victory: boolean): { streak: number; firstWinToday: boolean; counted: boolean } {
  const rec = readJuiceRecord();
  if (rec.lastGame === gameId) return { streak: rec.streak, firstWinToday: false, counted: false };
  const today = localDay();
  const firstWinToday = victory && rec.lastWinDay !== today;
  const next: JuiceRecord = victory
    ? { streak: rec.streak + 1, best: Math.max(rec.best, rec.streak + 1), lastWinDay: today, lastGame: gameId }
    : { ...rec, streak: 0, lastGame: gameId };
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(next)); } catch { /* storage may be blocked */ }
  return { streak: next.streak, firstWinToday, counted: true };
}

// ─────────────────────────────── 45. 경기 최고의 한 방 기록
export type BestHit = { damage: number; attacker: string; art?: string | null; target: string; finisher: boolean };
let bestHit: { game: string; hit: BestHit } | null = null;
export function noteHit(game: string, hit: BestHit) {
  if (!bestHit || bestHit.game !== game || hit.damage > bestHit.hit.damage || (hit.finisher && !bestHit.hit.finisher && hit.damage >= bestHit.hit.damage)) bestHit = { game, hit };
}
export function bestHitOf(game: string) { return bestHit?.game === game ? bestHit.hit : null; }

// ─────────────────────────────── 41. 버튼 손맛
export function pressButton(el: HTMLElement | null) {
  if (!el) return;
  if (!prefs().reduced) try { el.animate([{ scale: '1', filter: 'brightness(1)' }, { scale: '.9', filter: 'brightness(.8)', offset: .3 }, { scale: '1.04', filter: 'brightness(1.25)', offset: .7 }, { scale: '1', filter: 'brightness(1)' }], { duration: 260, easing: 'ease-out' }); } catch { /* visual only */ }
  const r = el.getBoundingClientRect();
  juiceSound('button-clunk.mp3', 44, 3, r.left + r.width / 2);
}

// ─────────────────────────────── 37. 손패 카드가 빠지면 나머지가 출렁이며 자리를 메움
const handRects = new WeakMap<Element, DOMRect>();
export function springHandReflow(root: HTMLElement | null) {
  if (!root) return;
  const reduced = prefs().reduced;
  for (const el of Array.from(root.children)) {
    const now = el.getBoundingClientRect();
    const before = handRects.get(el);
    handRects.set(el, now);
    if (!before || reduced || !live()) continue;
    const dx = before.left - now.left;
    if (Math.abs(dx) < 3 || Math.abs(dx) > 400 || Math.abs(before.top - now.top) > 40) continue;
    try {
      (el as HTMLElement).animate([{ translate: `${dx}px 0` }, { translate: `${-dx * .09}px 0`, offset: .62 }, { translate: `${dx * .03}px 0`, offset: .85 }, { translate: '0 0' }],
        { duration: 460, easing: 'cubic-bezier(.25,.8,.3,1)', composite: 'add' });
    } catch { /* visual only */ }
  }
}
