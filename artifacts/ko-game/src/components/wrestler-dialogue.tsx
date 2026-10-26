import { useEffect, useRef } from "react";
import { CardArtwork } from "./card-artwork";
import {
  cosmeticImage,
  cosmeticImageSettings,
  type MatchCosmetics,
} from "@workspace/cosmetics";
import type { CardDefinition } from "../game/cards/types";
import "./battle-dialogue.css";
export type WrestlerSpeech = {
  id: string;
  text: string;
  speaker: string;
  playerId: string;
  definitionId: string;
  instanceId: string;
  phase: "ENTER_FIELD" | "CARD_RETIRED" | "CARD_DESTROYED";
  ready: boolean;
};
export function WrestlerDialogue({
  speech,
  definition,
  cosmetics,
  selfId,
  onComplete,
}: {
  speech: WrestlerSpeech;
  definition?: CardDefinition;
  cosmetics: MatchCosmetics;
  selfId: string;
  onComplete: () => void;
}) {
  const done = useRef(onComplete);
  done.current = onComplete;
  useEffect(() => {
    const timer = window.setTimeout(() => done.current(), 2600);
    return () => clearTimeout(timer);
  }, [speech.id]);
  const legendary = definition?.rarity === "LEGENDARY";
  const label =
    speech.phase === "CARD_RETIRED"
      ? "리타이어"
      : speech.phase === "CARD_DESTROYED"
        ? "파괴"
        : legendary
          ? "LEGENDARY / 등장"
          : definition?.isChampionToken
            ? "챔피언 토큰 / 등장"
            : "선수 / 등장";
  const image = cosmeticImage(
    cosmetics[speech.playerId],
    "CARD_SKIN",
    speech.definitionId,
    "art",
    definition?.imageUrl,
  );
  return (
    <div
      role="status"
      aria-label="선수 대사"
      className={`ko-wrestler-cutin${legendary ? " ko-wrestler-cutin--legendary" : ""}`}
      data-wrestler-speaker={speech.instanceId}
      data-dialogue-event={speech.id}
    >
      <div className="ko-wrestler-cutin__art" aria-hidden="true">
        <CardArtwork
          src={image}
          fallbackSrc={definition?.imageUrl}
          displayOverride={cosmeticImageSettings(
            cosmetics[speech.playerId],
            "CARD_SKIN",
            speech.definitionId,
            "art",
          )}
          alt=""
          className="h-full w-full"
          imageDisplayMode="COVER"
          imagePositionY={20}
        />
      </div>
      <div className="ko-wrestler-cutin__body">
        <div className="ko-wrestler-cutin__header">
          <strong>{speech.speaker}</strong>
          <span>
            {speech.playerId === selfId ? "내" : "상대"} {label}
          </span>
        </div>
        <div className="ko-wrestler-cutin__text">{speech.text}</div>
      </div>
    </div>
  );
}
