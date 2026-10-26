import { ChampionSpeechBubble } from "./champion-speech-bubble";
import type { KoChampionLine } from "./champion-ko-lines";
import { useEffect, useRef, type RefObject } from "react";
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
  return createPortal(
    <div
      ref={root}
      className="ko-champion-dialogue"
      role="status"
      aria-label="챔피언 승패 대사"
    >
      {lines.map((line) => (
        <ChampionSpeechBubble
          key={line.playerId}
          anchor={line.playerId === selfId ? selfAnchor : opponentAnchor}
          playerId={line.playerId}
          speaker={line.speaker}
          text={line.text}
          portal={false}
          ko
          outcome={line.outcome}
          label={line.outcome === "VICTORY" ? "승리 / 챔피언" : "패배 / 챔피언"}
        />
      ))}
    </div>,
    document.body,
  );
}
