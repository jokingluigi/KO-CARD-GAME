import { useEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";
import { getLegalActions, type GameState } from "@/game";
import {
  rectSnapshot,
  type CardAnimationRect,
} from "./card-play-animation-utils";

type Props = {
  state: GameState;
  enabled: boolean;
  selectedAttackerId: string | null;
  cards: RefObject<Map<string, HTMLDivElement>>;
  champion: RefObject<HTMLDivElement | null>;
  select: (id: string) => void;
  attackCard: (
    id: string,
    geometry: { source: CardAnimationRect; target: CardAnimationRect },
  ) => void;
  attackChampion: (geometry: {
    source: CardAnimationRect;
    target: CardAnimationRect;
  }) => void;
};
/** Pointer input only. Both legal targets and execution use the existing tap attack path. */
export function BattleAttackDrag(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const cancelRef = useRef(() => {});
  useEffect(() => {
    cancelRef.current();
  }, [props.enabled, props.state.gameId, props.state.turn]);
  useEffect(() => {
    let gesture: {
      id: string;
      pointer: number;
      node: HTMLDivElement;
      x: number;
      y: number;
      started: boolean;
      ghost?: HTMLElement;
    } | null = null;
    let suppressUntil = 0;
    const actions = (id: string) =>
      getLegalActions(
        latest.current.state,
        latest.current.state.players[0].id,
      ).filter(
        (action) =>
          action.type === "ATTACK" && action.attackerInstanceId === id,
      );
    const clean = () => {
      const old = gesture;
      gesture = null;
      old?.ghost?.remove();
      if (old) delete old.node.dataset.attackDragSource;
      if (old?.started) suppressUntil = performance.now() + 450;
      for (const node of latest.current.cards.current.values())
        delete node.dataset.attackDragHover;
      if (latest.current.champion.current)
        delete latest.current.champion.current.dataset.attackDragHover;
      try {
        if (old?.node.hasPointerCapture(old.pointer))
          old.node.releasePointerCapture(old.pointer);
      } catch {}
      return old;
    };
    const cancel = () => {
      const old = clean();
      if (old?.started && latest.current.selectedAttackerId === old.id)
        latest.current.select(old.id);
    };
    cancelRef.current = cancel;
    const targetAt = (x: number, y: number) => {
      const p = latest.current,
        hit = document.elementFromPoint(x, y);
      if (!gesture || !hit) return;
      return actions(gesture.id).flatMap((action) => {
        if (action.type !== "ATTACK") return [];
        const node =
          action.target.type === "WRESTLER"
            ? p.cards.current.get(action.target.cardInstanceId)
            : p.champion.current;
        if (!node) return [];
        const r = node.getBoundingClientRect();
        const gap = Math.hypot(
          Math.max(r.left - x, 0, x - r.right),
          Math.max(r.top - y, 0, y - r.bottom),
        );
        const publicField = hit.closest(
          ".ko-opponent-board-row,.ko-opponent-champion",
        );
        return node.contains(hit) || (publicField && gap <= 8)
          ? [{ action, node }]
          : [];
      })[0];
    };
    const down = (event: PointerEvent) => {
      suppressUntil = 0;
      if (
        !latest.current.enabled ||
        !event.isPrimary ||
        event.button !== 0 ||
        gesture
      )
        return;
      const target = event.target as Element;
      const info = target.closest("[data-touch-inspect-trigger]");
      if (!info && target.closest("button,a,input,select")) return;
      const ownIds = new Set(
        latest.current.state.players[0].board.flatMap((card) =>
          card ? [card.instanceId] : [],
        ),
      );
      const entry = [...latest.current.cards.current].find(
        ([id, node]) =>
          ownIds.has(id) &&
          (node.contains(target) ||
            Boolean(
              info && node.closest(".ko-board-slot-wrapper")?.contains(info),
            )),
      );
      if (!entry || !actions(entry[0]).length) return;
      gesture = {
        id: entry[0],
        node: entry[1],
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        started: false,
      };
    };
    const move = (event: PointerEvent) => {
      const g = gesture;
      if (!g || g.pointer !== event.pointerId) return;
      if (!latest.current.enabled) {
        cancel();
        return;
      }
      if (!g.started) {
        if (
          Math.hypot(event.clientX - g.x, event.clientY - g.y) <
          (event.pointerType === "touch" ? 6 : 9)
        )
          return;
        g.started = true;
        const r = g.node.getBoundingClientRect();
        const ghost = g.node.cloneNode(true) as HTMLElement;
        ghost.removeAttribute("id");
        ghost.removeAttribute("role");
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        ghost.classList.add("ko-attack-drag-ghost");
        Object.assign(ghost.style, {
          position: "fixed",
          left: "0",
          top: "0",
          width: r.width + "px",
          height: r.height + "px",
          pointerEvents: "none",
          zIndex: "195",
          transition: "none",
          animation: "none",
          margin: "0",
        });
        document.body.appendChild(ghost);
        g.ghost = ghost;
        g.node.dataset.attackDragSource = "true";
        if (latest.current.selectedAttackerId !== g.id)
          flushSync(() => latest.current.select(g.id));
        try {
          g.node.setPointerCapture(event.pointerId);
        } catch {}
      }
      event.preventDefault();
      if (g.ghost)
        g.ghost.style.transform = `translate3d(${event.clientX - g.ghost.offsetWidth / 2}px,${event.clientY - g.ghost.offsetHeight * 0.7}px,0)`;
      for (const node of latest.current.cards.current.values())
        delete node.dataset.attackDragHover;
      if (latest.current.champion.current)
        delete latest.current.champion.current.dataset.attackDragHover;
      const target = targetAt(event.clientX, event.clientY);
      if (target) target.node.dataset.attackDragHover = "true";
    };
    const up = (event: PointerEvent) => {
      const g = gesture;
      if (!g || g.pointer !== event.pointerId) return;
      if (!g.started) {
        clean();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const p = latest.current,
        target = targetAt(event.clientX, event.clientY);
      if (!p.enabled || p.selectedAttackerId !== g.id || !target) {
        cancel();
        return;
      }
      const geometry = {
        source: rectSnapshot(g.node.getBoundingClientRect()),
        target: rectSnapshot(target.node.getBoundingClientRect()),
      };
      clean();
      if (target.action.target.type === "WRESTLER")
        p.attackCard(target.action.target.cardInstanceId, geometry);
      else p.attackChampion(geometry);
    };
    const click = (event: MouseEvent) => {
      if (performance.now() < suppressUntil && event.detail !== 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const lost = (event: PointerEvent) => {
      if (gesture?.pointer === event.pointerId && gesture.node === event.target)
        cancel();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
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
