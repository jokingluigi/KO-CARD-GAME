import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./targeting-arrow.css";

/**
 * Hearthstone's aiming arrow: while an attacker or an effect is choosing a target, a curved
 * arrow runs from the source to the pointer; over a legal target its head becomes a reticle.
 * Pointer-only and purely visual: it never handles clicks.
 */
export function TargetingArrow({ sourceId, validIds, championValid }: {
  /** data-card-instance-id of the source card, or "champion" for the viewer's champion. */
  sourceId: string | null;
  validIds: ReadonlySet<string>;
  /** Whether the opposing champion is a legal target. */
  championValid: boolean;
}) {
  const [pointer, setPointer] = useState<{ x: number; y: number; valid: boolean } | null>(null);
  const valid = useRef({ validIds, championValid });
  valid.current = { validIds, championValid };
  useEffect(() => {
    setPointer(null);
    if (!sourceId) return;
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const el = event.target instanceof Element ? event.target : null;
      const card = el?.closest<HTMLElement>("[data-card-instance-id]")?.dataset.cardInstanceId;
      const ok = (card !== undefined && card !== sourceId && valid.current.validIds.has(card))
        || (valid.current.championValid && Boolean(el?.closest(".ko-opponent-champion")));
      setPointer({ x: event.clientX, y: event.clientY, valid: ok });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [sourceId]);
  if (!sourceId || !pointer) return null;
  const node = sourceId === "champion"
    ? document.querySelector(".ko-player-champion .ko-portrait-window") ?? document.querySelector(".ko-player-champion")
    : document.querySelector(`[data-card-instance-id="${CSS.escape(sourceId)}"]`);
  const r = node?.getBoundingClientRect();
  if (!r) return null;
  const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
  const dx = pointer.x - sx, dy = pointer.y - sy, dist = Math.hypot(dx, dy);
  if (dist < 40) return null;
  // Bow the arrow upward like a thrown line.
  const cx = sx + dx / 2, cy = sy + dy / 2 - Math.min(140, dist * .35);
  const ex = pointer.x, ey = pointer.y;
  const angle = Math.atan2(ey - cy, ex - cx) * 180 / Math.PI;
  const path = `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  return createPortal(
    <svg className={`ko-target-arrow${pointer.valid ? " ko-target-arrow--locked" : ""}`} aria-hidden="true" width="100%" height="100%">
      <path className="ko-target-arrow__glow" d={path} />
      <path className="ko-target-arrow__body" d={path} />
      {pointer.valid ? (
        <g className="ko-target-arrow__reticle" transform={`translate(${ex} ${ey})`}>
          <circle r="22" /><circle r="9" />
          <path d="M-32 0H-14M14 0H32M0 -32V-14M0 14V32" />
        </g>
      ) : (
        <path className="ko-target-arrow__head" d="M0 -15 L26 0 L0 15 L6 0 Z" transform={`translate(${ex} ${ey}) rotate(${angle.toFixed(1)}) translate(-14 0)`} />
      )}
    </svg>,
    document.body,
  );
}
