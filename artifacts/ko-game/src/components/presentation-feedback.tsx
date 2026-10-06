import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import type { PresentationCueDraft } from "./presentation-feedback-utils";
import { BattleVfx } from './battle-vfx';

export type PresentationCue = PresentationCueDraft & {
  left: number;
  top: number;
  sourceLeft?: number;
  sourceTop?: number;
  previousArtwork?: string;
  nextArtwork?: string;
};

const toneClass: Record<PresentationCue["kind"], string> = {
  DAMAGE: "presentation-feedback--damage",
  DODGE: "presentation-feedback--dodge",
  BLOCK: "presentation-feedback--dodge",
  HEAL: "presentation-feedback--heal",
  BUFF: "presentation-feedback--buff",
  DEBUFF: "presentation-feedback--debuff",
  RETIRE: "presentation-feedback--retire",
  DESTROY: "presentation-feedback--destroy",
  REMOVE: "presentation-feedback--remove",
  DRAW: "presentation-feedback--draw",
  GENERATE: "presentation-feedback--generate",
  TRANSFORM: "presentation-feedback--transform",
  QUEST_PROGRESS: "presentation-feedback--quest",
  QUEST_COMPLETE: "presentation-feedback--quest-complete",
  GOLD: "presentation-feedback--gold",
  TURN: "presentation-feedback--turn",
};

export function PresentationFeedback({
  cue,
  onComplete,
  onStart,
}: {
  cue: PresentationCue;
  onComplete: () => void;
  onStart?: (cue: PresentationCue) => void;
}) {
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onStartRef=useRef(onStart);
  const startedCueRef=useRef('');
  onStartRef.current=onStart;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    completedRef.current = false;
    if(startedCueRef.current!==cue.id){startedCueRef.current=cue.id;onStartRef.current?.(cue);}
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
    "--presentation-source-x": `${(cue.sourceLeft ?? cue.left) - cue.left}px`,
    "--presentation-source-y": `${(cue.sourceTop ?? cue.top) - cue.top}px`,
  } as CSSProperties;

  return (
    <>
    {(cue.kind==='DAMAGE'&&!cue.combat || cue.kind==='DESTROY' || cue.kind==='BLOCK') &&
      <BattleVfx kind={cue.kind==='DAMAGE'?'IMPACT':cue.kind==='BLOCK'?'BLOCK':'DESTROY'}
        left={cue.left} top={cue.top} strength={Math.abs(cue.value??3)} seed={cue.id} duration={cue.duration} />}
    <div
      aria-hidden="true"
      className={`presentation-feedback ${toneClass[cue.kind]}`}
      data-impact={cue.kind==='DAMAGE' ? (cue.value??0)>=8?'heavy':'normal' : undefined}
      style={style}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (completedRef.current) return;
        completedRef.current = true;
        onCompleteRef.current();
      }}
    >
      {cue.kind==='DAMAGE'&&!cue.combat&&<i className="presentation-feedback__effect-hit"/>}
      {cue.sourceLeft !== undefined && cue.sourceTop !== undefined &&
        (Math.abs(cue.sourceLeft - cue.left) + Math.abs(cue.sourceTop - cue.top) > 30) &&
        <i className="presentation-feedback__transfer" />}
      {cue.kind === "TRANSFORM" && cue.previousArtwork && cue.nextArtwork &&
        <span className="presentation-feedback__morph" aria-hidden="true">
          <img src={cue.previousArtwork} alt="" className="presentation-feedback__morph-before" />
          <img src={cue.nextArtwork} alt="" className="presentation-feedback__morph-after" />
        </span>}
      <span className="presentation-feedback__label">{cue.label}</span>
      {cue.kind === "QUEST_PROGRESS" && cue.value ? <small>+{cue.value}</small> : null}
    </div>
    </>
  );
}
