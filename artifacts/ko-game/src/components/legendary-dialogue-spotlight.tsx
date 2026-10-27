import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CardArtwork } from "./card-artwork";
import {
  cosmeticImage,
  cosmeticImageSettings,
  type MatchCosmetics,
} from "@workspace/cosmetics";
import type { CardDefinition } from "../game/cards/types";
import type { WrestlerSpeech } from "./wrestler-dialogue";
import "./legendary-dialogue-spotlight.css";
import { legendaryDialogueDuration } from "./wrestler-dialogue-timing";
/** An entrance beat, not an instruction toast or a new input/presentation lock. */
export function LegendaryDialogueSpotlight({
  speech,
  definition,
  cosmetics,
  selfId,
  onComplete,
}: {
  speech: WrestlerSpeech;
  definition: CardDefinition;
  cosmetics: MatchCosmetics;
  selfId: string;
  onComplete: () => void;
}) {
  const duration = legendaryDialogueDuration(speech.text);
  const root = useRef<HTMLDivElement>(null),
    done = useRef(onComplete);
  done.current = onComplete;
  useEffect(() => {
    const finish = () => done.current();
    const outsideInput = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) finish();
    };
    // Capture the user's next input, then let the original event reach its target.
    document.addEventListener("pointerdown", outsideInput, true);
    document.addEventListener("keydown", finish, true);
    return () => {
      document.removeEventListener("pointerdown", outsideInput, true);
      document.removeEventListener("keydown", finish, true);
    };
  }, [speech.id, duration]);
  useLayoutEffect(() => {
    let signature = "";
    const place = () => {
      const node = root.current;
      if (!node) return;
      const width = Math.min(680, innerWidth - 24);
      // Viewport overlay: independent of board layout, camera motion and scroll.
      const height = innerWidth > 768 ? 132 : 152;
      const left = (innerWidth - width) / 2;
      let top = Math.max(
        12,
        parseFloat(
          getComputedStyle(node).getPropertyValue("--spotlight-safe-top"),
        ) || 0,
      );
      // Browser focus may scroll the turn controls to the viewport's top.
      // Keep the entrance above play, but leave those live controls exposed.
      for (const control of document.querySelectorAll(".ko-game-controls")) {
        const r = control.getBoundingClientRect();
        if (
          r.width &&
          r.bottom > top &&
          r.top < top + height &&
          r.left < left + width &&
          r.right > left
        ) {
          top = Math.min(innerHeight - height - 8, r.bottom + 8);
        }
      }
      const next = [left, top, width, height].join(":");
      if (next === signature) return;
      signature = next;
      node.style.left = left + "px";
      node.style.top = top + "px";
      node.style.width = width + "px";
      node.style.height = height + "px";
      node.dataset.compact = height < 140 ? "true" : "false";
      const quote = node.querySelector<HTMLElement>(
        ".ko-legendary-spotlight__line",
      );
      if (quote) {
        quote.style.fontSize = "";
        quote.style.lineHeight = "";
        let size = parseFloat(getComputedStyle(quote).fontSize);
        while (size > 12 && quote.scrollHeight > quote.clientHeight + 1) {
          size -= 1;
          quote.style.fontSize = size + "px";
          quote.style.lineHeight = "1.28";
        }
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true, capture: true });
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [speech.id]);
  const src = cosmeticImage(
    cosmetics[speech.playerId],
    "CARD_SKIN",
    definition.id,
    "art",
    definition.imageUrl,
  );
  return createPortal(
    <div
      ref={root}
      onPointerDown={(event) => {
        event.stopPropagation();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* Optional browser capability. */
        }
      }}
      onPointerCancel={() => done.current()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        done.current();
      }}
      role="status"
      aria-label="선수 대사"
      className="ko-legendary-spotlight"
      data-legendary-spotlight
      data-wrestler-speaker={speech.instanceId}
      data-dialogue-event={speech.id}
      data-side={speech.playerId === selfId ? "self" : "opponent"}
      style={
        {
          "--legendary-dialogue-duration": duration + "ms",
        } as React.CSSProperties
      }
    >
      <div className="ko-legendary-spotlight__art" aria-hidden="true">
        <CardArtwork
          src={src}
          fallbackSrc={definition.imageUrl}
          displayOverride={cosmeticImageSettings(
            cosmetics[speech.playerId],
            "CARD_SKIN",
            definition.id,
            "art",
          )}
          imageDisplayMode="COVER"
          imagePositionY={20}
          alt=""
          className="h-full w-full"
        />
      </div>
      <div className="ko-legendary-spotlight__copy">
        <span className="ko-legendary-spotlight__rarity">
          LEGENDARY{" "}
          <span>
            / {speech.playerId === selfId ? "내 선수" : "상대 선수"} 등장
          </span>
        </span>
        <strong className="ko-legendary-spotlight__name">
          {speech.speaker}
        </strong>
        <div className="ko-legendary-spotlight__line">{speech.text}</div>
      </div>
      <span className="ko-legendary-spotlight__quotation" aria-hidden="true">
        “
      </span>
    </div>,
    document.body,
  );
}
