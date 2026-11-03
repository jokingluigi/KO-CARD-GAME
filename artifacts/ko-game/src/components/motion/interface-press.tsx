import { useEffect } from "react";
import { useLocation } from "wouter";
import { interfaceRoute } from "./interface-motion-policy";

/** Keeps the button box and hit area fixed; only its face/glyphs compress. */
export function InterfacePressBridge() {
  const [path] = useLocation();
  useEffect(() => {
    if (!interfaceRoute(path)) return;
    const pressed = new Set<HTMLElement>();
    const release = () => {
      for (const node of pressed) delete node.dataset.uiPressed;
      pressed.clear();
    };
    const down = (event: PointerEvent | KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event instanceof KeyboardEvent) {
        if (event.repeat || !["Enter", " "].includes(event.key)) return;
      } else if (event.button !== 0 || !event.isPrimary) return;
      const node = event.target instanceof Element
        ? event.target.closest<HTMLElement>('button,a[href],summary') : null;
      if (!node || node.matches(':disabled,[aria-disabled="true"]') || node.closest('.ko-game-shell,[data-admin-shell]')) return;
      release();
      node.dataset.uiPressed = "true";
      pressed.add(node);
    };
    const hidden = () => { if (document.hidden) release(); };
    document.addEventListener("pointerdown",down);
    document.addEventListener("keydown",down);
    document.addEventListener("pointerup",release);
    document.addEventListener("pointercancel",release);
    document.addEventListener("keyup",release);
    window.addEventListener("blur",release);
    document.addEventListener("visibilitychange",hidden);
    return () => {
      release();
      document.removeEventListener("pointerdown",down);
      document.removeEventListener("keydown",down);
      document.removeEventListener("pointerup",release);
      document.removeEventListener("pointercancel",release);
      document.removeEventListener("keyup",release);
      window.removeEventListener("blur",release);
      document.removeEventListener("visibilitychange",hidden);
    };
  },[path]);
  return null;
}
