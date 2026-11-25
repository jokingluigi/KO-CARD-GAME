import { readCombatPreferences } from './combat-preferences';
import './visual-polish.css';

/**
 * 비주얼 완성도 연출 모음 (화면 연출 전용 — 게임 규칙과 무관).
 * 10. 피니셔 게이지 흡수 · 12. 조명 따라가기 · 14. 결과 숫자 올라가기
 */
function calm() {
  if (typeof document === 'undefined' || document.hidden) return true;
  const p = readCombatPreferences();
  return p.reducedMotion || p.quality === 'LOW' || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** 10. 피니셔 준비가 오르면 주변의 빛 알갱이가 게이지로 빨려 들어가고 게이지가 번쩍인다. */
export function spawnGaugeAbsorb(meter: Element | null | undefined, from?: { x: number; y: number }) {
  if (!meter || calm()) return;
  const r = meter.getBoundingClientRect();
  if (!r.width) return;
  const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
  const count = 10;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * .5;
    const dist = 70 + Math.random() * 60;
    const sx = (from?.x ?? tx) + Math.cos(a) * dist, sy = (from?.y ?? ty) + Math.sin(a) * dist * .7;
    const p = document.createElement('i');
    p.className = 'kv-mote';
    p.style.left = `${sx}px`; p.style.top = `${sy}px`;
    document.body.appendChild(p);
    const anim = p.animate([
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: .25 },
      { transform: `translate(calc(-50% + ${tx - sx}px), calc(-50% + ${ty - sy}px)) scale(.5)`, opacity: .9 },
    ], { duration: 520 + Math.random() * 160, delay: i * 28, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'both' });
    anim.onfinish = () => p.remove();
    window.setTimeout(() => p.remove(), 1200);
  }
  window.setTimeout(() => {
    try {
      (meter as HTMLElement).animate([
        { boxShadow: '0 0 0 0 rgba(246,220,142,0)', filter: 'brightness(1)' },
        { boxShadow: '0 0 0 2px rgba(246,220,142,.9),0 0 14px 4px rgba(214,170,70,.7)', filter: 'brightness(1.8)', offset: .3 },
        { boxShadow: '0 0 0 0 rgba(246,220,142,0)', filter: 'brightness(1)' },
      ], { duration: 650, easing: 'ease-out' });
    } catch { /* 연출 */ }
  }, 560);
}

/** 12. 테이블 조명이 마우스 쪽으로 살짝 따라온다 (터치·저사양·움직임 줄이기에서는 꺼짐).
 *  화면 전체를 다시 그리지 않도록, 빛 한 장을 만들어 위치만 옮긴다 (GPU 이동만). */
export function installCursorLight(stage: HTMLElement | null) {
  if (!stage || typeof window === 'undefined' || !matchMedia('(pointer:fine)').matches) return () => {};
  const light = document.createElement('div');
  light.className = 'kv-cursor-light';
  light.setAttribute('aria-hidden', 'true');
  document.body.appendChild(light);
  let frame = 0, x = 0, y = 0;
  const apply = () => { frame = 0; light.style.transform = `translate3d(${x - 360}px, ${y - 260}px, 0)`; };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || calm()) { light.dataset.on = 'false'; return; }
    x = e.clientX; y = e.clientY;
    light.dataset.on = 'true';
    if (!frame) frame = requestAnimationFrame(apply);
  };
  const leave = () => { light.dataset.on = 'false'; };
  stage.addEventListener('pointermove', move, { passive: true });
  stage.addEventListener('pointerleave', leave);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    stage.removeEventListener('pointermove', move);
    stage.removeEventListener('pointerleave', leave);
    light.remove();
  };
}

/** 14. 결과 화면의 기록 숫자가 0부터 올라간다 (경기가 끝난 뒤의 기록이라 마지막엔 실제 값만 남는다).
 *  React가 관리하는 글자 노드의 값만 바꾼다 (노드를 갈아끼우지 않음). */
export function countUp(root: HTMLElement | null, selector: string, delay = 500) {
  if (!root || calm()) return () => {};
  const frames: number[] = [];
  const restores: Array<() => void> = [];
  Array.from(root.querySelectorAll<HTMLElement>(selector)).forEach((node, index) => {
    const textNode = node.childNodes.length === 1 && node.firstChild?.nodeType === Node.TEXT_NODE ? node.firstChild as Text : null;
    const text = textNode?.nodeValue ?? '';
    if (!textNode || !/^\s*\d+\s*$/.test(text)) return;
    const target = Number(text);
    if (target <= 0) return;
    textNode.nodeValue = '0';
    restores.push(() => { textNode.nodeValue = text; });
    const start = performance.now() + delay + index * 90;
    const duration = Math.min(900, 380 + target * 18);
    const step = () => {
      const t = Math.min(1, Math.max(0, (performance.now() - start) / duration));
      textNode.nodeValue = t >= 1 ? text : String(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frames.push(requestAnimationFrame(step));
      else try { node.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' }); } catch { /* 연출 */ }
    };
    frames.push(requestAnimationFrame(step));
  });
  return () => { frames.forEach((f) => cancelAnimationFrame(f)); restores.forEach((r) => r()); };
}
