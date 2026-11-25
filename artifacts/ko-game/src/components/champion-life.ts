import { readCombatPreferences } from './combat-preferences';
import { spawnLandingDust } from './impact-burst';
import './champion-life.css';

/**
 * 챔피언 스프라이트 생동감 (새 그림 없이, 지금 그림으로만).
 * 화면 연출 전용: 게임 규칙·타이밍과 무관하고, 움직임 줄이기 설정을 따른다.
 */
function calm() {
  if (typeof document === 'undefined' || document.hidden) return true;
  const p = readCombatPreferences();
  return p.reducedMotion || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function run(el: Element | null | undefined, frames: Keyframe[], options: KeyframeAnimationOptions) {
  try { return (el as HTMLElement | null)?.animate?.(frames, options); } catch { return undefined; }
}

/** 6. 잔상 돌진: 공격·기술 때 반투명 잔상이 남는다. */
export function spawnAfterimages(body: HTMLElement | null, accent: string) {
  if (!body || calm() || readCombatPreferences().quality === 'LOW') return;
  [70, 150, 230].forEach((delay, i) => window.setTimeout(() => {
    if (!body.isConnected) return;
    const r = body.getBoundingClientRect();
    if (!r.width) return;
    const ghost = body.cloneNode(true) as HTMLElement;
    ghost.classList.add('kj-afterimage');
    ghost.setAttribute('aria-hidden', 'true');
    const box = body.closest('.ko-battle-actor')?.getBoundingClientRect();
    Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, transform: getComputedStyle(body).transform,
      clipPath: box ? `inset(${Math.max(0, box.top - r.top)}px ${Math.max(0, r.right - box.right)}px ${Math.max(0, r.bottom - box.bottom)}px ${Math.max(0, box.left - r.left)}px)` : '' });
    ghost.style.setProperty('--kj-ghost', accent);
    document.body.appendChild(ghost);
    const a = run(ghost, [{ opacity: .55 - i * .12 }, { opacity: 0 }], { duration: 300, easing: 'ease-out', fill: 'both' });
    const done = () => ghost.remove();
    if (a) a.onfinish = done;
    window.setTimeout(done, 450);
  }, delay));
}

/** 7. 무게 실린 착지: 살짝 떴다가 '쿵' 내려앉고 발밑 먼지. */
export function landingThud(host: HTMLElement | null) {
  if (!host || calm()) return;
  run(host, [
    { translate: '0 0', scale: '1 1' },
    { translate: '0 -12px', scale: '.98 1.03', offset: .38, easing: 'cubic-bezier(.5,0,.9,.4)' },
    { translate: '0 2px', scale: '1.05 .94', offset: .56 },
    { translate: '0 0', scale: '.99 1.01', offset: .74 },
    { translate: '0 0', scale: '1 1' },
  ], { duration: 620, composite: 'add' });
  window.setTimeout(() => {
    const r = host.getBoundingClientRect();
    if (r.width) try { spawnLandingDust({ left: r.left + r.width * .15, top: r.bottom - r.height * .25, width: r.width * .7, height: r.height * .25, weight: 3 }); } catch { /* visual only */ }
  }, 350);
}

/** 9. 상대 턴에 가끔 어깨를 으쓱하듯 까딱. */
export function idleFidget(host: HTMLElement | null, self: boolean) {
  if (!host || calm()) return;
  const s = self ? 1 : -1;
  const kind = Math.floor(Math.random() * 3);
  const frames: Keyframe[][] = [
    [{ rotate: '0deg', translate: '0 0' }, { rotate: `${1.4 * s}deg`, translate: '0 -3px', offset: .3 }, { rotate: `${-.8 * s}deg`, translate: '0 0', offset: .6 }, { rotate: '0deg', translate: '0 0' }],
    [{ translate: '0 0' }, { translate: '0 -5px', offset: .25 }, { translate: '0 1px', offset: .5 }, { translate: '0 -2px', offset: .7 }, { translate: '0 0' }],
    [{ translate: '0 0', rotate: '0deg' }, { translate: `${4 * s}px 0`, rotate: `${.6 * s}deg`, offset: .4 }, { translate: '0 0', rotate: '0deg' }],
  ];
  run(host, frames[kind]!, { duration: 900 + kind * 120, easing: 'ease-in-out', composite: 'add' });
}

/** 12. 피격 순간 하얀 실루엣 → 붉은 기운 → 원래대로. */
export function hitSilhouette(host: HTMLElement | null, heavy: boolean) {
  const shade = host?.querySelector<HTMLElement>('.kj-sprite-flash');
  if (!shade) return;
  const reduced = calm();
  run(shade, reduced
    ? [{ opacity: 0 }, { opacity: .5, background: '#fff', offset: .2 }, { opacity: 0 }]
    : [{ opacity: 1, background: '#fff' }, { opacity: 1, background: '#fff', offset: heavy ? .22 : .16 }, { opacity: .75, background: '#ff3a24', offset: heavy ? .34 : .28 }, { opacity: 0, background: '#ff3a24' }],
  { duration: heavy ? 360 : 260, easing: 'ease-out' });
}

/** 14. 말할 때 몸이 글자 박자에 맞춰 통통. */
export function speakBounce(host: HTMLElement | null, chars: number) {
  if (!host || calm()) return;
  const beats = Math.max(3, Math.min(10, Math.round(chars / 4)));
  const frames: Keyframe[] = [{ translate: '0 0' }];
  for (let i = 0; i < beats; i++) frames.push({ translate: `0 ${-(2.5 + (i % 3 === 0 ? 1.5 : 0))}px`, offset: (i + .4) / beats }, { translate: '0 0', offset: Math.min(1, (i + .9) / beats) });
  run(host, frames, { duration: beats * 150, easing: 'ease-out', composite: 'add' });
}

/** 19. 내 턴이 시작되면 챔피언이 화면 쪽으로 살짝 다가왔다 돌아감. */
export function turnLean(host: HTMLElement | null) {
  if (!host || calm()) return;
  run(host, [{ scale: '1', translate: '0 0' }, { scale: '1.06', translate: '0 -4px', offset: .35, easing: 'cubic-bezier(.2,.8,.2,1)' }, { scale: '1.04', translate: '0 -3px', offset: .7 }, { scale: '1', translate: '0 0' }],
    { duration: 900, composite: 'add' });
}

/** 18. 스킨마다 다른 기운: 이름으로 연기·불씨·번개 중 하나를 고른다. */
export function auraStyle(identity: string) {
  const n = Array.from(identity).reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381);
  return (['smoke', 'embers', 'sparks'] as const)[n % 3];
}
