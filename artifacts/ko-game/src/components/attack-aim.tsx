import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
export function AttackAim({
  source,
  targets,
  champion,
  championId,
  valid,
}: {
  source: HTMLElement | null;
  targets: RefObject<Map<string, HTMLDivElement>>;
  champion: HTMLElement | null;
  championId: string;
  valid: Set<string>;
}) {
  const line = useRef<SVGLineElement>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!source || !line.current) return;
      const node = [
        ...targets.current.entries(),
        [championId, champion] as const,
      ].find(([id, n]) => {
        if (!n || !valid.has(id)) return false;
        const r = n.getBoundingClientRect();
        return (
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        );
      })?.[1];
      line.current.style.opacity = node ? "1" : "0";
      if (node) {
        const s = source.getBoundingClientRect(),
          t = node.getBoundingClientRect();
        for (const [k, v] of Object.entries({
          x1: s.left + s.width / 2,
          y1: s.top + s.height * 0.3,
          x2: t.left + t.width / 2,
          y2: t.top + t.height * 0.7,
        }))
          line.current.setAttribute(k, String(v));
      }
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [source, targets, champion, championId, valid]);
  return createPortal(
    <svg aria-hidden="true" className="ko-attack-aim">
      <line
        ref={line}
        stroke="#e8c367"
        strokeWidth="3"
        strokeDasharray="8 4"
        style={{ opacity: 0 }}
      />
    </svg>,
    document.body,
  );
}
