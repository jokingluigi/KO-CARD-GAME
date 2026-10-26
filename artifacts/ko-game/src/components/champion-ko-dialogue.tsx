import type { KoChampionLine } from "./champion-ko-lines";
import { useLayoutEffect, useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./champion-ko-dialogue.css";
/** Text is independent of the shattered portrait's visibility. Both champions speak together. */
export function ChampionKoDialogue({
  id,
  lines,
  selfId,
  selfAnchor,
  opponentAnchor,
  onComplete,
}: {
  id: string;
  lines: KoChampionLine[];
  selfId: string;
  selfAnchor: RefObject<HTMLDivElement | null>;
  opponentAnchor: RefObject<HTMLDivElement | null>;
  onComplete: () => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    complete = useRef(onComplete);
  complete.current = onComplete;
  useEffect(() => {
    const timer = window.setTimeout(() => complete.current(), 2600);
    return () => clearTimeout(timer);
  }, [id]);
  useLayoutEffect(() => {
    const position = () => {
      const nodes = Array.from(
        root.current?.querySelectorAll<HTMLElement>("[data-ko-speaker]") ?? [],
      );
      const positions = nodes.map((node) => {
        const mine = node.dataset.koSpeaker === selfId;
        const anchor = (
          mine ? selfAnchor : opponentAnchor
        ).current?.getBoundingClientRect();
        const width = node.offsetWidth,
          height = node.offsetHeight;
        const clampY = (y: number) =>
          Math.max(8, Math.min(innerHeight - height - 8, y));
        const left = Math.max(
          8,
          Math.min(
            innerWidth - width - 8,
            (anchor ? anchor.left + anchor.width / 2 : innerWidth / 2) -
              width / 2,
          ),
        );
        const top = clampY(
          anchor
            ? mine
              ? anchor.top - height - 8
              : anchor.bottom + 8
            : mine
              ? innerHeight - height - 16
              : 16,
        );
        return { node, mine, left, top, height, width, clampY };
      });
      if (positions.length === 2) {
        const [a, b] = positions;
        if (
          a!.top < b!.top + b!.height + 8 &&
          b!.top < a!.top + a!.height + 8 &&
          a!.left < b!.left + b!.width &&
          b!.left < a!.left + a!.width
        )
          for (const p of positions)
            p.top = p.clampY(
              p.mine ? innerHeight / 2 + 8 : innerHeight / 2 - p.height - 8,
            );
      }
      for (const p of positions) {
        p.node.style.left = p.left + "px";
        p.node.style.top = p.top + "px";
      }
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [id, lines, selfId, selfAnchor, opponentAnchor]);
  return createPortal(
    <div
      ref={root}
      className="ko-champion-dialogue"
      role="status"
      aria-label="챔피언 승패 대사"
    >
      {lines.map((line) => (
        <div
          key={line.playerId}
          className="ko-champion-dialogue__line"
          data-ko-speaker={line.playerId}
          data-ko-outcome={line.outcome}
        >
          <span className="ko-champion-dialogue__speaker">{line.speaker}</span>
          <span>{line.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
