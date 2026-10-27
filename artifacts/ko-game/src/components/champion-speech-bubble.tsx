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
      const offscreen =
        rect.width < 8 ||
        rect.height < 8 ||
        rect.bottom <= 0 ||
        rect.top >= innerHeight;
      if (offscreen && ko) {
        // A finished mobile match can show only one HUD at a time. Keep both
        // final lines readable without moving or resurrecting the shattered HUD.
        signature = "";
        const width = Math.min(290, innerWidth - 16);
        node.style.width = width + "px";
        node.style.maxHeight = Math.min(160, (innerHeight - 32) / 2) + "px";
        node.style.left = Math.max(8, innerWidth - width - 8) + "px";
        node.style.visibility = "visible";
        node.style.top =
          (portrait.classList.contains("ko-player-champion")
            ? Math.max(8, innerHeight - node.offsetHeight - 8)
            : 8) + "px";
        outline.style.visibility = "hidden";
        return;
      }
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
        node.offsetHeight,
      ].join(":");
      if (signature === nextSignature) return;
      signature = nextSignature;
      const width = Math.min(560, innerWidth - 24);
      node.style.width = width + "px";
      node.style.maxHeight = "144px";
      node.dataset.compact = "false";
      const height = Math.min(144, node.offsetHeight);
      const above = rect.top - height - 10;
      const below = rect.bottom + 10;
      const top =
        above >= 8 ? above : below + height <= innerHeight - 8 ? below : null;
      // Never cover the portrait, even when the HUD is partially offscreen.
      if (top === null) {
        node.style.visibility = "hidden";
        outline.style.visibility = "hidden";
        return;
      }
      node.style.left = (innerWidth - width) / 2 + "px";
      node.style.top = top + "px";
      node.style.visibility = "visible";
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
    if (bubble.current) observer?.observe(bubble.current);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, text, ko]);
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
