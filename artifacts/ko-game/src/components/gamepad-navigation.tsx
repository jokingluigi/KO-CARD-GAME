import { useEffect, useState } from 'react';
import { audioManager } from '@/audio/audio-manager';

type Direction = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE = 'button:not(:disabled), a[href], [role="button"][tabindex], [data-gamepad-target]';

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' &&
    !element.closest('[inert], [aria-hidden="true"]') && !element.classList.contains('ko-hand-inspect-button');
}

function candidates(): HTMLElement[] {
  // Keep controls behind an open dialog out of the navigation order.
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].filter(isVisible);
  const root = dialogs.at(-1) ?? document.querySelector<HTMLElement>('.ko-game-shell') ?? document.body;
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
}

function moveFocus(direction: Direction, current: HTMLElement | null): void {
  const items = candidates();
  if (!items.length) return;
  const from = current && items.includes(current) ? current : null;
  if (!from) { focusTarget(items[0]); return; }
  const origin = from?.getBoundingClientRect();
  const x = origin ? origin.left + origin.width / 2 : 0;
  const y = origin ? origin.top + origin.height / 2 : 0;
  const ranked = items.filter((element) => element !== from).map((element) => {
    const rect = element.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - x;
    const dy = rect.top + rect.height / 2 - y;
    const forward = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    return { element, forward, score: forward + cross * 2 };
  }).filter(({ forward }) => !from || forward > 4).sort((a, b) => a.score - b.score);
  if (ranked[0]) focusTarget(ranked[0].element);
}

function focusTarget(element: HTMLElement | null): void {
  document.querySelector<HTMLElement>('[data-gamepad-focused]')?.removeAttribute('data-gamepad-focused');
  if (!element) return;
  element.dataset.gamepadFocused = 'true';
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function pressed(gamepad: Gamepad, index: number): boolean {
  return gamepad.buttons[index]?.pressed ?? false;
}

export function GamepadNavigation() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof navigator.getGamepads !== 'function') return;
    let frame = 0;
    let disconnectedTimer = 0;
    let active: HTMLElement | null = null;
    let previous = new Set<number>();
    let previousDirection: Direction | null = null;
    let nextMoveAt = 0;
    let wasConnected = false;

    const clearFocus = () => {
      document.querySelector<HTMLElement>('[data-gamepad-focused]')?.removeAttribute('data-gamepad-focused');
      active = null;
    };
    document.addEventListener('pointerdown', clearFocus, { passive: true });

    const tick = (time: number) => {
      try {
        // Android browsers often expose Bluetooth pads with an empty mapping.
        const pad = [...navigator.getGamepads()].find((entry) => entry?.connected);
        if (!pad) {
          if (wasConnected) { setConnected(false); clearFocus(); }
          wasConnected = false;
          previous.clear();
          previousDirection = null;
        } else {
          if (!wasConnected) setConnected(true);
          wasConnected = true;
          const held = new Set(pad.buttons.flatMap((button, index) => button.pressed ? [index] : []));
          const justPressed = (index: number) => held.has(index) && !previous.has(index);
          if ([0, 1, 2, 9].some(justPressed)) {
            // A pad can be the first user interaction on a mobile device.
            audioManager.unlockAudio();
          }
          const horizontal = pad.axes[0] ?? 0;
          const vertical = pad.axes[1] ?? 0;
          const direction: Direction | null =
            pressed(pad, 14) || horizontal < -0.55 ? 'left' :
            pressed(pad, 15) || horizontal > 0.55 ? 'right' :
            pressed(pad, 12) || vertical < -0.55 ? 'up' :
            pressed(pad, 13) || vertical > 0.55 ? 'down' : null;

          if (direction && (direction !== previousDirection || time >= nextMoveAt)) {
            moveFocus(direction, active);
            active = document.querySelector<HTMLElement>('[data-gamepad-focused]');
            nextMoveAt = time + (direction === previousDirection ? 180 : 330);
          }
          previousDirection = direction;

          if (justPressed(0)) {
            const target = active && candidates().includes(active) ? active : candidates()[0];
            if (target) { focusTarget(target); active = target; target.click(); }
          }
          if (justPressed(1)) {
            const inspectorClose = document.querySelector<HTMLButtonElement>('.ko-touch-inspector .ko-touch-inspector-close');
            const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].filter(isVisible).at(-1);
            const close = dialog?.querySelector<HTMLButtonElement>('button[aria-label*="닫기"], button[aria-label*="Close"]');
            if (inspectorClose) inspectorClose.click();
            else if (close) close.click();
            else window.dispatchEvent(new Event('ko-gamepad-cancel'));
          }
          if (justPressed(2)) {
            (active?.closest('.ko-board-slot-wrapper') ?? active?.parentElement)
              ?.querySelector<HTMLButtonElement>('[data-touch-inspect-trigger]')?.click();
          }
          if (justPressed(9) && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
            window.dispatchEvent(new Event('ko-gamepad-settings'));
          }
          previous = held;
        }
      } catch {
        // Some embedded browsers deny the Gamepad API even when the method exists.
      }
      if (wasConnected) frame = requestAnimationFrame(tick);
      else disconnectedTimer = window.setTimeout(() => { frame = requestAnimationFrame(tick); }, 250);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(disconnectedTimer);
      document.removeEventListener('pointerdown', clearFocus);
      clearFocus();
    };
  }, []);

  return connected ? <div className="ko-gamepad-hint" role="status">패드 연결됨 · 방향 이동 · A/× 선택 · B/○ 취소 · X/□ 정보 · START 설정</div> : null;
}
