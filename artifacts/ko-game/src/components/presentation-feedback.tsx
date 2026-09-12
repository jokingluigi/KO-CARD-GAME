import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import type { PresentationCueDraft } from "./presentation-feedback-utils";

export type PresentationCue = PresentationCueDraft & {
  left: number;
  top: number;
};

const toneClass: Record<PresentationCue["kind"], string> = {
  DAMAGE: "presentation-feedback--damage",
  HEAL: "presentation-feedback--heal",
  BUFF: "presentation-feedback--buff",
  DEBUFF: "presentation-feedback--debuff",
  RETIRE: "presentation-feedback--retire",
  DESTROY: "presentation-feedback--destroy",
  REMOVE: "presentation-feedback--remove",
  DRAW: "presentation-feedback--draw",
  GENERATE: "presentation-feedback--generate",
  QUEST_PROGRESS: "presentation-feedback--quest",
  QUEST_COMPLETE: "presentation-feedback--quest-complete",
  GOLD: "presentation-feedback--gold",
};

export function PresentationFeedback({
  cue,
  onComplete,
}: {
  cue: PresentationCue;
  onComplete: () => void;
}) {
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    completedRef.current = false;
    const timeoutId = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current();
    }, cue.duration);
    return () => window.clearTimeout(timeoutId);
  }, [cue.duration, cue.id]);

  const style = {
    "--presentation-left": `${cue.left}px`,
    "--presentation-top": `${cue.top}px`,
    "--presentation-duration": `${cue.duration}ms`,
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={`presentation-feedback ${toneClass[cue.kind]}`}
      style={style}
      onAnimationEnd={() => {
        if (completedRef.current) return;
        completedRef.current = true;
        onCompleteRef.current();
      }}
    >
      <span>{cue.label}</span>
      {cue.kind === "QUEST_PROGRESS" && cue.value ? <small>+{cue.value}</small> : null}
    </div>
  );
}