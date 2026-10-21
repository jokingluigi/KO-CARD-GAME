import { useEffect, useRef, type RefObject } from "react";
import { getLegalActions, type GameState, type BoardSlot } from "@/game";
import {
  rectSnapshot,
  type CardAnimationRect,
} from "./card-play-animation-utils";
import { prefersReducedMotion } from "./presentation-config";

type Props = {
  state: GameState;
  enabled: boolean;
  selectedCardId: string | null;
  hand: RefObject<Map<string, HTMLDivElement>>;
  slots: RefObject<Map<number, HTMLDivElement>>;
  select: (id: string) => void;
  cancel: (id: string) => void;
  summon: (
    slot: BoardSlot,
    geometry: { source: CardAnimationRect; target: CardAnimationRect },
  ) => void;
  spell: (id: string, source: CardAnimationRect, drop: {x:number;y:number}) => void;
};
/** Local pointer presentation only. Drop calls the same validated actions as tap. */
export function BattleCardDrag(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const cancelRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!props.enabled) cancelRef.current();
  }, [props.enabled, props.state.gameId, props.state.turn]);
  useEffect(() => {
    type Gesture = {
      id: string;
      pointer: number;
      node: HTMLDivElement;
      startX: number;
      startY: number;
      offsetX: number;
      offsetY: number;
      source: CardAnimationRect;
      ghost: HTMLElement | null;
      slot: number | null;
      started: boolean;
      lastX: number;
    };
    let gesture: Gesture | null = null,
      suppressUntil = 0;
    const returns = new Set<HTMLElement>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const clearMarks = () => {
      for (const node of latest.current.slots.current.values()) {
        delete node.dataset.dragValid;
        delete node.dataset.dragHover;
      }
    };
    const allowed = (id: string) =>
      getLegalActions(
        latest.current.state,
        latest.current.state.players[0].id,
      ).filter((a) => "cardInstanceId" in a && a.cardInstanceId === id);
    const clean = (restore = false) => {
      const g = gesture;
      if (!g) return;
      gesture = null;
      clearMarks();
      delete g.node.dataset.dragging;
      try {
        if (g.node.hasPointerCapture(g.pointer))
          g.node.releasePointerCapture(g.pointer);
      } catch {}
      if (g.started) suppressUntil = performance.now() + 450;
      if (restore && g.ghost && !prefersReducedMotion()) {
        const ghost = g.ghost;
        returns.add(ghost);
        const r = g.node.getBoundingClientRect();
        try {
          ghost.animate?.(
            [
              { transform: ghost.style.transform },
              { transform: `translate3d(${r.left}px,${r.top}px,0)` },
            ],
            {
              duration: 160,
              easing: "cubic-bezier(.16,1,.3,1)",
              fill: "forwards",
            },
          );
        } catch {
          /* Timed cleanup still restores the hand. */
        }
        const timer = setTimeout(() => {
          ghost.remove();
          returns.delete(ghost);
          timers.delete(timer);
        }, 180);
        timers.add(timer);
      } else g.ghost?.remove();
    };
    const cancel = () => {
      const g = gesture;
      clean(true);
      if (g?.started) latest.current.cancel(g.id);
    };
    cancelRef.current = cancel;
    const down = (e: PointerEvent) => {
      suppressUntil = 0; // A new gesture must never lose its intentional click.
      if (!latest.current.enabled || e.button !== 0 || !e.isPrimary || gesture)
        return;
      const target = e.target as Element;
      const useButton = target.closest<HTMLElement>('[data-hand-drag-card-id]');
      if (!useButton && target.closest("button,[data-touch-inspect-trigger],a,input,select"))
        return;
      const entry = Array.from(latest.current.hand.current).find(([id, n]) =>
        useButton ? id === useButton.dataset.handDragCardId : n.contains(target),
      );
      if (!entry || allowed(entry[0]).length === 0) return;
      const [id, node] = entry,
        r = node.getBoundingClientRect();
      gesture = {
        id,
        node,
        pointer: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        offsetX: e.clientX - r.left,
        offsetY: e.clientY - r.top,
        source: rectSnapshot(r),
        ghost: null,
        slot: null,
        started: false,
      };
    };
    const move = (e: PointerEvent) => {
      const g = gesture;
      if (!g || e.pointerId !== g.pointer) return;
      const dx = e.clientX - g.startX,
        dy = e.clientY - g.startY;
      if (!g.started) {
        if (Math.hypot(dx, dy) < 9) return;
        // Horizontal touch movement belongs to the hand scroller.
        if (e.pointerType === "touch" && Math.abs(dx) > Math.abs(dy) * 1.1) {
          clean();
          return;
        }
        g.started = true;
        g.node.dataset.dragging = "true";
        const ghost = g.node.cloneNode(true) as HTMLElement;
        g.ghost = ghost;
        ghost.removeAttribute("id");
        ghost.removeAttribute("data-dragging");
        ghost.removeAttribute("role");
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        ghost.classList.add("ko-card-drag-ghost");
        ghost.classList.remove("ko-hand-card--selected");
        Object.assign(ghost.style, {
          position: "fixed",
          left: "0",
          top: "0",
          width: g.source.width + "px",
          height: g.source.height + "px",
          margin: "0",
          transition: "none",
          animation: "none",
          zIndex: "260",
          pointerEvents: "none",
        });
        document.body.appendChild(ghost);
        try {
          g.node.setPointerCapture(e.pointerId);
        } catch {}
        if (latest.current.selectedCardId !== g.id) latest.current.select(g.id);
      }
      e.preventDefault();
      e.stopPropagation();
      const actions = allowed(g.id),
        valid = actions.flatMap((a) =>
          a.type === "PLAY_WRESTLER" ? [a.boardSlot] : [],
        );
      let nearest: number | null = null,
        distance = Infinity;
      for (const [slot, node] of latest.current.slots.current) {
        node.dataset.dragValid = String(valid.includes(slot as BoardSlot));
        delete node.dataset.dragHover;
        const r = node.getBoundingClientRect(),
          gap = Math.hypot(
            Math.max(r.left - e.clientX, 0, e.clientX - r.right),
            Math.max(r.top - e.clientY, 0, e.clientY - r.bottom),
          );
        if (valid.includes(slot as BoardSlot) && gap <= 12 && gap < distance) {
          nearest = slot;
          distance = gap;
        }
      }
      g.slot = nearest;
      if (nearest !== null)
        latest.current.slots.current.get(nearest)!.dataset.dragHover = "true";
      const tilt = prefersReducedMotion()
        ? 0
        : Math.max(-5, Math.min(5, (e.clientX - g.lastX) * 0.24));
      g.lastX = e.clientX;
      const x = Math.max(
          0,
          Math.min(innerWidth - g.source.width, e.clientX - g.offsetX),
        ),
        y = Math.max(
          0,
          Math.min(innerHeight - g.source.height, e.clientY - g.offsetY),
        );
      g.ghost!.style.transform = `translate3d(${x}px,${y}px,0) rotate(${tilt}deg) scale(1.025)`;
    };
    const up = (e: PointerEvent) => {
      const g = gesture;
      if (!g || g.pointer !== e.pointerId) return;
      if (!g.started) {
        clean();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const p = latest.current,
        actions = allowed(g.id),
        slot = g.slot,
        source = g.ghost
          ? rectSnapshot(g.ghost.getBoundingClientRect())
          : g.source;
      const target = slot !== null ? p.slots.current.get(slot) : null;
      if (
        p.enabled &&
        target &&
        actions.some((a) => a.type === "PLAY_WRESTLER" && a.boardSlot === slot)
      ) {
        const geometry = {
          source,
          target: rectSnapshot(target.getBoundingClientRect()),
        };
        clean();
        p.summon(slot as BoardSlot, geometry);
        return;
      }
      // Display:contents has no box. Accept actual fields and both champion
      // portraits, including a spell dropped directly onto a champion.
      const castArea = Array.from(g.node.closest('.ko-game-shell')?.querySelectorAll(
        '.ko-opponent-board-row,.ko-player-board-row,.ko-opponent-champion,.ko-player-champion',
      ) ?? []).some(node => {
        const r=node.getBoundingClientRect();
        return r.width>0&&r.height>0&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
      });
      if (p.enabled && actions.some(a=>a.type==='PLAY_TECHNIQUE') && castArea) {
        clean();
        p.spell(g.id, source, {x:e.clientX,y:e.clientY});
        return;
      }
      cancel();
    };
    const click = (e: MouseEvent) => {
      if (performance.now() < suppressUntil && e.detail !== 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const lost = (e: PointerEvent) => {
      if (gesture && e.pointerId===gesture.pointer && e.target===gesture.node) cancel();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    const hidden = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, {
      capture: true,
      passive: false,
    });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("lostpointercapture", lost, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("resize", cancel);
    window.addEventListener("ko-gamepad-cancel", cancel);
    return () => {
      clean();
      returns.forEach((n) => n.remove());
      timers.forEach(clearTimeout);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("lostpointercapture", lost, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("ko-gamepad-cancel", cancel);
    };
  }, [props.state.gameId]);
  return null;
}
