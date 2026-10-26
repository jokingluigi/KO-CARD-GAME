import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./battle-dialogue.css";
/** Tethered to the actual HUD. Never moves a target or intercepts battle inputs. */
export function ChampionSpeechBubble({
  anchor,
  speaker,
  text,
  playerId,
  label = "챔피언",
  quest = false,
  ko = false,
  outcome,
  portal = true,
}: {
  anchor: RefObject<HTMLDivElement | null>;
  speaker: string;
  text: string;
  playerId: string;
  label?: string;
  quest?: boolean;
  ko?: boolean;
  outcome?: string;
  portal?: boolean;
}) {
  const bubble = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let signature = "";
    const place = () => {
      const portrait = anchor.current,
        node = bubble.current,
        outline = frame.current;
      if (!node || !outline || !portrait) return;
      const rect = portrait.getBoundingClientRect();
      if (
        rect.width < 8 ||
        rect.height < 8 ||
        rect.bottom < 0 ||
        rect.top > innerHeight
      ) {
        signature = "";
        node.style.visibility = "hidden";
        outline.style.visibility = "hidden";
        return;
      }
      const hud = portrait
        .closest(".ko-player-info,.ko-opponent-hud")
        ?.getBoundingClientRect();
      const ability = portrait
        .closest(".ko-player-info")
        ?.querySelector(".ko-champion-ability")
        ?.getBoundingClientRect();
      const emote = portrait
        .closest(".ko-player-info")
        ?.querySelector(".cosmetic-emote-tools > button")
        ?.getBoundingClientRect();
      const nextSignature = [
        rect.left,
        rect.top,
        rect.width,
        rect.height,
        hud?.right,
        ability?.top,
        emote?.left,
        innerWidth,
        innerHeight,
      ].join(":");
      if (signature === nextSignature) return;
      signature = nextSignature;
      const right = Math.max(
        88,
        Math.min(
          innerWidth - 8,
          emote ? emote.left - 5 : (hud?.right ?? innerWidth - 8),
        ),
      );
      const left = Math.max(
        8,
        Math.min(rect.left + 6, right - 80, innerWidth - 88),
      );
      const top = Math.max(8, Math.min(rect.top + 4, innerHeight - 56)),
        bottom = Math.min(
          innerHeight - 8,
          ability ? ability.top - 5 : rect.bottom - 4,
        );
      if (bottom - top < 44) {
        node.style.visibility = "hidden";
        outline.style.visibility = "hidden";
        return;
      }
      node.style.left = left + "px";
      node.style.top = top + "px";
      node.style.width = Math.max(80, Math.min(290, right - left)) + "px";
      node.style.maxHeight = Math.max(48, bottom - top) + "px";
      node.style.visibility = "visible";
      node.dataset.compact = "false";
      const text = node.querySelector<HTMLElement>(".ko-champion-speech__text");
      if (text && text.scrollHeight > text.clientHeight + 1)
        node.dataset.compact = "true";
      outline.style.left = rect.left + "px";
      outline.style.top = rect.top + "px";
      outline.style.width = rect.width + "px";
      outline.style.height = rect.height + "px";
      outline.style.visibility = "visible";
    };
    let animationFrame = 0;
    const follow = () => {
      place();
      animationFrame = requestAnimationFrame(follow);
    };
    follow();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (anchor.current) observer?.observe(anchor.current);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, text]);
  const content = (
    <>
      <div
        ref={frame}
        className={`ko-champion-speaking-frame${quest ? " ko-champion-speaking-frame--quest" : ""}`}
        aria-hidden="true"
      />
      <div
        ref={bubble}
        className={`ko-champion-speech${quest ? " ko-champion-speech--quest" : ""}`}
        role={ko ? undefined : "status"}
        aria-label={ko ? undefined : "챔피언 대사"}
        data-champion-speaker={playerId}
        data-ko-speaker={ko ? playerId : undefined}
        data-ko-outcome={outcome}
      >
        <div className="ko-champion-speech__header">
          <span>{label}</span>
          <strong>{speaker}</strong>
        </div>
        <div className="ko-champion-speech__text">{text}</div>
      </div>
    </>
  );
  return portal ? createPortal(content, document.body) : content;
}
