import { audioManager } from '../audio/audio-manager';
import { readCombatPreferences } from './combat-preferences';
import { juiceSound } from './battle-juice';
import './hit-feel.css';

/**
 * 타격감 2차 (화면·소리 연출 전용 — 게임 규칙·카드 정보와 무관).
 * 번호는 사용자에게 설명한 목록 번호.
 */
type Prefs = { reduced: boolean; low: boolean; flash: number; colorblind: boolean };
function prefs(): Prefs {
  if (typeof document === 'undefined') return { reduced: true, low: true, flash: 0, colorblind: false };
  const p = readCombatPreferences();
  const media = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { reduced: p.reducedMotion || media, low: p.quality === 'LOW', flash: p.flash, colorblind: p.colorblind };
}
const live = () => typeof document !== 'undefined' && !document.hidden;
const px = (n: number) => `${Math.round(n)}px`;
function layer(className: string, style: Record<string, string> = {}, html = '') {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  for (const [k, v] of Object.entries(style)) el.style.setProperty(k, v);
  if (html) el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}
function play(el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
  let done = false;
  const end = () => { if (!done) { done = true; el.remove(); } };
  try { el.animate(frames, { fill: 'both', ...options }).onfinish = end; } catch { /* 연출 */ }
  window.setTimeout(end, Number(options.duration ?? 0) + Number(options.delay ?? 0) + 250);
  return el;
}
const SYN = (name: string) => `${import.meta.env.BASE_URL}vendor/ko-synth/${name}`;

// ─────────────────────────────── 1. 소리 지연 보정
/** 이 기기에서 소리를 화면보다 몇 ms 먼저 틀어야 하는지 */
export function soundLead() {
  try { return audioManager.soundLeadMs(); } catch { return 0; }
}

// ─────────────────────────────── 2. 큰 타격 직전 '진공'
/** 맞기 직전 음악을 확 줄였다가 맞는 순간 돌려놓는다 (결정타는 원래 연출이 따로 있음). */
export function preImpactVacuum(damage: number) {
  if (!live() || damage < 6) return;
  try { audioManager.duckForPresentation(damage >= 10 ? .22 : .35, 140); } catch { /* 소리 */ }
}

// ─────────────────────────────── 4. 만화 집중선
export function spawnFocusLines(x: number, y: number, power: number) {
  const { reduced, low } = prefs();
  if (!live() || reduced || low || power < 6) return;
  const strong = power >= 10;
  const el = layer('kh-focus', { '--x': px(x), '--y': px(y), '--hole': strong ? '15%' : '20%' });
  play(el, [
    { opacity: 0, transform: 'scale(1.25)' },
    { opacity: strong ? .95 : .75, transform: 'scale(1)', offset: .25 },
    { opacity: 0, transform: 'scale(.96)' },
  ], { duration: strong ? 260 : 190, easing: 'ease-out' });
}

// ─────────────────────────────── 5. 내 챔피언이 맞으면 화면 가장자리 붉은 번쩍
export function spawnHurtVignette(damage: number) {
  const { reduced, flash, colorblind } = prefs();
  if (!live() || damage <= 0 || flash <= 0) return;
  const strength = Math.min(1, .35 + damage * .07) * flash;
  const el = layer(`kh-hurt${colorblind ? ' kh-hurt--cb' : ''}`);
  play(el, reduced
    ? [{ opacity: 0 }, { opacity: strength * .6, offset: .2 }, { opacity: 0 }]
    : [{ opacity: 0 }, { opacity: strength, offset: .12 }, { opacity: strength * .55, offset: .4 }, { opacity: 0 }],
  { duration: damage >= 6 ? 700 : 480, easing: 'ease-out' });
}

/** 화면의 이 위치가 '내' 챔피언 초상화 위인지 (화면 배치와 상관없이 실제 위치로 판단) */
export function isMyChampionAt(x: number, y: number) {
  if (typeof document === 'undefined') return false;
  const r = document.querySelector('.ko-player-champion')?.getBoundingClientRect();
  return Boolean(r && r.width && x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8);
}

// ─────────────────────────────── 6. 쓰러뜨림 확인 (K.O.)
let lastKo = 0;
export function spawnKoStamp(x: number, y: number) {
  if (!live()) return;
  const now = Date.now();
  // 광역으로 여러 장이 한꺼번에 쓰러지면 소리는 한 번만
  if (now - lastKo > 250) juiceSound(SYN('ko-bell.mp3'), 34, 3, x);
  lastKo = now;
  const { reduced } = prefs();
  const el = layer('kh-ko', { left: px(x), top: px(y) }, '<b>K.O.</b>');
  play(el, reduced
    ? [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .75 }, { opacity: 0 }]
    : [{ opacity: 0, transform: 'translate(-50%,-50%) rotate(-12deg) scale(2.6)' },
      { opacity: 1, transform: 'translate(-50%,-50%) rotate(-12deg) scale(.9)', offset: .1 },
      { opacity: 1, transform: 'translate(-50%,-50%) rotate(-12deg) scale(1.04)', offset: .18 },
      { opacity: 1, transform: 'translate(-50%,-50%) rotate(-12deg) scale(1)', offset: .78 },
      { opacity: 0, transform: 'translate(-50%,-50%) rotate(-12deg) scale(1.1)' }],
  { duration: 1000, easing: 'ease-out' });
}

// ─────────────────────────────── 9. 아머가 깨지는 순간
export function spawnArmorShatter(x: number, y: number) {
  if (!live()) return;
  juiceSound(SYN('armor-shatter.mp3'), 42, 4, x);
  const { reduced, low } = prefs();
  if (reduced) return;
  const count = low ? 6 : 12;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * .4;
    const dist = 50 + Math.random() * 60;
    const shard = layer('kh-shard', { left: px(x), top: px(y), '--r': `${Math.round(Math.random() * 360)}deg` });
    play(shard, [
      { opacity: 1, transform: `translate(-50%,-50%) rotate(var(--r)) scale(1)` },
      { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist + 30}px)) rotate(calc(var(--r) + ${Math.round(Math.random() * 300 - 150)}deg)) scale(.6)` },
    ], { duration: 520 + Math.random() * 200, easing: 'cubic-bezier(.2,.7,.4,1)' });
  }
  const ring = layer('kh-shield-break', { left: px(x), top: px(y) });
  play(ring, [{ opacity: 1, transform: 'translate(-50%,-50%) scale(.8)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.5)' }], { duration: 360, easing: 'ease-out' });
}

// ─────────────────────────────── 10. 경기장 울림
let lastTail = 0;
export function arenaTail(damage: number, x?: number, finisher = false) {
  if (!live() || (damage < 6 && !finisher)) return;
  const now = Date.now();
  if (now - lastTail < 400) return;
  lastTail = now;
  juiceSound(SYN('arena-tail.mp3'), finisher ? 40 : damage >= 10 ? 32 : 22, 2, x);
}

// ─────────────────────────────── 11. 회피 순간 슬로우 + 잔상
export function dodgeMoment(card: HTMLElement | null) {
  const { reduced, low } = prefs();
  if (!live() || reduced || !card) return;
  const r = card.getBoundingClientRect();
  if (!r.width) return;
  if (!low) for (let i = 0; i < 2; i++) {
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-card-instance-id');
    ghost.querySelectorAll('[data-card-instance-id]').forEach((n) => n.removeAttribute('data-card-instance-id'));
    ghost.className += ' kh-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, { position: 'fixed', left: px(r.left), top: px(r.top), width: px(r.width), height: px(r.height), margin: '0', pointerEvents: 'none', zIndex: '214' });
    document.body.appendChild(ghost);
    const side = i === 0 ? -1 : 1;
    play(ghost, [
      { opacity: .55, transform: 'translateX(0)', filter: 'grayscale(1) brightness(1.6)' },
      { opacity: 0, transform: `translateX(${side * (26 + i * 14)}px)`, filter: 'grayscale(1) brightness(1.6)' },
    ], { duration: 420, delay: i * 50, easing: 'ease-out' });
  }
  // 아주 잠깐 화면 속 움직임을 느리게 (0.2초) — 진행 중인 연출만, 게임 시간은 그대로
  try {
    const running = document.getAnimations().filter((a) => a.playState === 'running');
    running.forEach((a) => { a.updatePlaybackRate?.(.3); });
    window.setTimeout(() => running.forEach((a) => { try { a.updatePlaybackRate?.(1); } catch { /* 끝난 연출 */ } }), 200);
  } catch { /* 연출 */ }
}

// ─────────────────────────────── 12. 누적 피해 숫자
let streak = { key: '', total: 0, hits: 0, at: 0 };
export function resetDamageStreak() { streak = { key: '', total: 0, hits: 0, at: 0 }; }
/** 같은 대상을 같은 턴에 연달아(8초 안) 때리면 합계를 보여준다. 턴이 바뀌면 초기화. */
export function noteTargetDamage(key: string | undefined, damage: number, x: number, y: number) {
  if (!key || damage <= 0 || !live()) return;
  const now = Date.now();
  if (streak.key === key && now - streak.at < 8000) { streak.total += damage; streak.hits += 1; }
  else streak = { key, total: damage, hits: 1, at: now };
  streak.at = now;
  if (streak.hits < 2) return;
  document.querySelectorAll('.kh-total').forEach((n) => n.remove());
  const { reduced } = prefs();
  const el = layer('kh-total', { left: px(x), top: px(y - 62) }, `<small>누적</small><b>${streak.total}</b>`);
  play(el, reduced
    ? [{ opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 1, offset: .8 }, { opacity: 0 }]
    : [{ opacity: 0, transform: 'translate(-50%,-50%) scale(1.8)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(.95)', offset: .1 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .8 }, { opacity: 0, transform: 'translate(-50%,-80%) scale(1)' }],
  { duration: 1400, delay: 140, easing: 'ease-out' });
}

// ─────────────────────────────── 7. 조준할 때 긴장감
let aim: { audio: HTMLAudioElement | null; card: HTMLElement | null; fade: number | null } | null = null;
export function startAimTension(card: HTMLElement | null) {
  if (!live()) return;
  if (aim?.card === card && aim) return;
  stopAimTension();
  const { reduced } = prefs();
  card?.classList.toggle('kh-aiming', !reduced);
  let audio: HTMLAudioElement | null = null;
  try {
    const target = Math.min(1, .14 * audioManager.getSfxVolume() / 100);
    if (target > 0) {
      audio = new Audio(SYN('aim-tension.wav'));
      audio.loop = true; audio.volume = 0;
      void audio.play().catch(() => undefined);
    }
    aim = { audio, card, fade: null };
    // 1.5초에 걸쳐 서서히 커진다
    const started = performance.now();
    const tick = () => {
      if (!aim || aim.audio !== audio || !audio) return;
      audio.volume = target * Math.min(1, (performance.now() - started) / 1500);
      if (audio.volume < target) aim.fade = requestAnimationFrame(tick);
    };
    if (audio) aim.fade = requestAnimationFrame(tick);
  } catch { aim = { audio: null, card, fade: null }; }
}
export function stopAimTension() {
  if (!aim) return;
  if (aim.fade) cancelAnimationFrame(aim.fade);
  aim.audio?.pause();
  aim.card?.classList.remove('kh-aiming');
  aim = null;
}

// ─────────────────────────────── 8. 맞을 대상이 움찔
const lastFlinch = new WeakMap<Element, number>();
export function flinch(target: HTMLElement | null) {
  const { reduced } = prefs();
  if (!live() || reduced || !target) return;
  const now = Date.now();
  if (now - (lastFlinch.get(target) ?? 0) < 500) return;
  lastFlinch.set(target, now);
  try {
    target.animate([
      { translate: '0 0', scale: '1' },
      { translate: '-2px 1px', scale: '.965', offset: .25 },
      { translate: '2px 0', scale: '.975', offset: .5 },
      { translate: '0 0', scale: '1' },
    ], { duration: 220, easing: 'ease-out' });
  } catch { /* 연출 */ }
}

// ─────────────────────────────── 13. 반격받는 공격자 튕김
export function counterRecoil(attacker: HTMLElement | null, dx: number, dy: number, counter: number) {
  const { reduced } = prefs();
  if (!attacker || reduced || counter <= 0) return;
  const len = Math.hypot(dx, dy) || 1;
  const push = Math.min(34, 10 + counter * 3);
  const bx = (-dx / len) * push, by = (-dy / len) * push;
  try {
    attacker.animate([
      { translate: '0 0', rotate: '0deg' },
      { translate: `${bx.toFixed(1)}px ${by.toFixed(1)}px`, rotate: `${dx > 0 ? -4 : 4}deg`, offset: .3 },
      { translate: `${(bx * .25).toFixed(1)}px ${(by * .25).toFixed(1)}px`, rotate: '0deg', offset: .7 },
      { translate: '0 0', rotate: '0deg' },
    ], { duration: 300, easing: 'cubic-bezier(.2,.8,.3,1)' });
  } catch { /* 연출 */ }
}
