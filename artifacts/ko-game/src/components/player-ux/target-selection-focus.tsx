import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { clipFocusRect, type FocusRect } from "./target-focus-policy";
type Props = {
  active: boolean;
  ids: string[];
  selfId: string;
  opponentId: string;
  hand: RefObject<Map<string, HTMLDivElement>>;
  board: RefObject<Map<string, HTMLDivElement>>;
  self: RefObject<HTMLDivElement | null>;
  opponent: RefObject<HTMLDivElement | null>;
};
type Hole = FocusRect & { id: string; kind: "target" | "command" };
function visibleBox(node: HTMLElement, viewport: FocusRect): FocusRect | null {
  const style = getComputedStyle(node);
  if (style.visibility === "hidden" || style.display === "none") return null;
  const r = node.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  let box = clipFocusRect(
    { x: r.x - 3, y: r.y - 3, width: r.width + 6, height: r.height + 6 },
    viewport,
  );
  for (
    let parent = node.parentElement;
    box && parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    const css = getComputedStyle(parent),
      px = /(hidden|clip|scroll|auto)/.test(css.overflowX),
      py = /(hidden|clip|scroll|auto)/.test(css.overflowY);
    if (px || py) {
      const r = parent.getBoundingClientRect();
      box = clipFocusRect(box, {
        x: px ? r.x : viewport.x,
        y: py ? r.y : viewport.y,
        width: px ? r.width : viewport.width,
        height: py ? r.height : viewport.height,
      });
    }
  }
  return box;
}
/** A visual mask only. Original targets, hitboxes and focus order remain in place. */
export function TargetSelectionFocus({
  active,
  ids,
  selfId,
  opponentId,
  hand,
  board,
  self,
  opponent,
}: Props) {
  const host = useRef<HTMLSpanElement>(null),
    maskId = "ko-effect-focus-" + useId().replace(/:/g, "");
  const [scene, setScene] = useState<{
    width: number;
    height: number;
    holes: Hole[];
  } | null>(null);
  const signature = ids.join("\u0000");
  useLayoutEffect(() => {
    if (!active) {
      setScene(null);
      return;
    }
    const root = host.current?.closest(".ko-game-stage");
    if (!root) return;
    let frame = 0;
    const collectNodes = () => {
      const targets = Array.from(new Set(ids)).flatMap((id) => {
        const node =
          id === selfId
            ? self.current
            : id === opponentId
              ? opponent.current
              : (board.current.get(id) ?? hand.current.get(id));
        return node ? [{ id, node, kind: "target" as const }] : [];
      });
      const command =
        root.querySelector<HTMLElement>(".ko-battle-command") ??
        root.querySelector<HTMLElement>(".ko-game-controls");
      return [
        ...targets,
        ...(command
          ? [{ id: "command", node: command, kind: "command" as const }]
          : []),
      ];
    };
    let resize: ResizeObserver | null = null;
    const observed = new Set<HTMLElement>();
    const measure = () => {
      const viewport = { x: 0, y: 0, width: innerWidth, height: innerHeight };
      const nodes = collectNodes();
      if (resize) {
        const current = new Set(nodes.map((n) => n.node));
        for (const node of observed)
          if (!current.has(node)) {
            resize.unobserve(node);
            observed.delete(node);
          }
        for (const node of current)
          if (!observed.has(node)) {
            resize.observe(node);
            observed.add(node);
          }
      }
      const next = {
        width: viewport.width,
        height: viewport.height,
        holes: nodes.flatMap(({ node, id, kind }) => {
          const box = node.isConnected ? visibleBox(node, viewport) : null;
          return box ? [{ ...box, id, kind }] : [];
        }),
      };
      setScene((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
    };
    measure();
    resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    resize?.observe(root);
    collectNodes().forEach(({ node }) => {
      resize?.observe(node);
      observed.add(node);
    });
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    document.fonts?.addEventListener("loadingdone", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      document.fonts?.removeEventListener("loadingdone", schedule);
    };
  }, [active, signature, selfId, opponentId, hand, board, self, opponent]);
  return (
    <>
      <span ref={host} hidden />
      {active &&
        scene &&
        createPortal(
          <svg
            data-testid="effect-target-focus"
            aria-hidden="true"
            className="ko-effect-target-focus"
            viewBox={`0 0 ${scene.width} ${scene.height}`}
          >
            <defs>
              <mask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={scene.width}
                height={scene.height}
              >
                <rect width="100%" height="100%" fill="white" />
                {scene.holes.map((h) => (
                  <rect
                    key={h.kind + h.id}
                    data-focus-target={h.kind === "target" ? h.id : undefined}
                    x={h.x}
                    y={h.y}
                    width={h.width}
                    height={h.height}
                    rx="3"
                    fill="black"
                  />
                ))}
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="black"
              opacity=".38"
              mask={`url(#${maskId})`}
            />
            {scene.holes
              .filter((h) => h.kind === "target")
              .map((h) => (
                <rect
                  key={h.id}
                  x={h.x}
                  y={h.y}
                  width={h.width}
                  height={h.height}
                  rx="3"
                  fill="none"
                  stroke="#e4c37a"
                  strokeWidth="1.5"
                />
              ))}
          </svg>,
          document.body,
        )}
    </>
  );
}
