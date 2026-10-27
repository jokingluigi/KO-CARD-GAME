import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
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
export const LEGENDARY_DIALOGUE_MS = 2200;
/** An entrance beat, not an instruction toast or a new input/presentation lock. */
export function LegendaryDialogueSpotlight({
  speech,
  definition,
  cosmetics,
  selfId,
  stage,
  alternateStage,
  onComplete,
}: {
  speech: WrestlerSpeech;
  definition: CardDefinition;
  cosmetics: MatchCosmetics;
  selfId: string;
  stage: RefObject<HTMLDivElement | null>;
  alternateStage: RefObject<HTMLDivElement | null>;
  onComplete: () => void;
}) {
  const duration = speech.text.length > 32 ? 2800 : LEGENDARY_DIALOGUE_MS;
  const root = useRef<HTMLDivElement>(null),
    done = useRef(onComplete);
  done.current = onComplete;
  useEffect(() => {
    const finish = () => done.current();
    const timer = window.setTimeout(finish, duration);
    const outsideInput = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) finish();
    };
    // Capture the user's next input, then let the original event reach its target.
    document.addEventListener("pointerdown", outsideInput, true);
    document.addEventListener("keydown", finish, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", outsideInput, true);
      document.removeEventListener("keydown", finish, true);
    };
  }, [speech.id, duration]);
  useLayoutEffect(() => {
    let frame = 0,
      signature = "";
    const place = () => {
      const node = root.current;
      if (!node) return;
      const choices = [stage.current, alternateStage.current]
        .filter(Boolean)
        .map((el) => el!.getBoundingClientRect());
      const rect =
        choices.find(
          (r) => Math.min(innerHeight - 8, r.bottom) - Math.max(8, r.top) >= 96,
        ) ??
        choices.sort(
          (a, b) =>
            Math.min(innerHeight, b.bottom) -
            Math.max(0, b.top) -
            (Math.min(innerHeight, a.bottom) - Math.max(0, a.top)),
        )[0];
      const visibleTop = rect ? Math.max(8, rect.top) : innerHeight * 0.25,
        visibleBottom = rect
          ? Math.min(innerHeight - 8, rect.bottom)
          : innerHeight * 0.75;
      const available = visibleBottom - visibleTop;
      const height = Math.min(210, Math.max(96, available - 8)),
        width = Math.min(760, innerWidth - 24);
      const left = (innerWidth - width) / 2,
        top = Math.max(
          8,
          Math.min(
            innerHeight - height - 8,
            visibleTop + (available - height) / 2,
          ),
        );
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
    const follow = () => {
      place();
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [stage, alternateStage, speech.id]);
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
