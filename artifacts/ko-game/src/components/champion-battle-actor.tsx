import { useEffect, useRef, useState } from "react";
import {
  championSpriteSkin,
  championSpriteCandidates,
  spriteFrames,
  reactSprite,
  type SpriteEvent,
  type CosmeticLoadout,
} from "@workspace/cosmetics";
import { getPlayerSurvivalHealth, type GameState } from "@/game";
import {
  championSpriteEvents,
  spriteEventCursor,
  spriteIsLow,
} from "./champion-sprite-events";
import { CardArtwork } from "./card-artwork";
import "./champion-battle-actor.css";
/** Lives inside the existing champion target/ref: all targeting geometry stays real. */
export function ChampionBattleActor({
  state,
  playerId,
  self,
  loadout,
  portrait,
  original,
  name,
  attackActive = false,
  hitContact = false,
  framed = false,
}: {
  state: GameState;
  playerId: string;
  self: boolean;
  loadout?: CosmeticLoadout;
  portrait?: string | null;
  original?: string | null;
  name: string;
  attackActive?: boolean;
  hitContact?: boolean;
  framed?: boolean;
}) {
  const player = state.players.find((p) => p.id === playerId)!;
  const appearance = championSpriteSkin({
    championId: player.champion?.id ?? "",
    loadout,
    base: player.champion?.presentationLines?.BATTLE_SPRITE,
    normal: player.champion?.imageUrl ?? original,
    awakenedPortrait: player.champion?.questCompletedPortraitEnabled
      ? player.champion.questCompletedPortraitUrl
      : original,
    awakened: Boolean(player.champion?.questCompleted),
  });
  const config = appearance.config;
  const identity = appearance.id;
  const setIdentity =
    identity +
    ":" +
    (player.champion?.questCompleted && config?.awakening === "REPLACE"
      ? "awakened"
      : "normal");
  const [reaction, setReaction] = useState<{
    event: SpriteEvent;
    until: number;
  }>({ event: "IDLE", until: 0 });
  const pendingHit = useRef<SpriteEvent | null>(null);
  const previous = useRef(state);
  const cursor = useRef(spriteEventCursor(state));
  const appearanceKey = useRef(state.gameId + ":" + setIdentity);
  useEffect(() => {
    const key = state.gameId + ":" + setIdentity;
    if (
      cursor.current.game !== state.gameId ||
      state.events.length < cursor.current.count
    ) {
      pendingHit.current = null;
      cursor.current = spriteEventCursor(state);
      previous.current = state;
      appearanceKey.current = key;
      setReaction({ event: "IDLE", until: 0 });
      return;
    }
    const changed = appearanceKey.current !== key;
    if (changed) pendingHit.current = null;
    appearanceKey.current = key;
    const events = championSpriteEvents(
      previous.current,
      state,
      playerId,
      cursor.current,
    );
    previous.current = state;
    const visibleEvents = events.filter((event) => {
      if (
        (event === "HIT" || event === "HEAVY_HIT") &&
        attackActive &&
        !hitContact
      ) {
        if (pendingHit.current !== "HEAVY_HIT") pendingHit.current = event;
        return false;
      }
      return true;
    });
    setReaction((current) => {
      let next = changed ? { event: "IDLE" as SpriteEvent, until: 0 } : current;
      for (const event of visibleEvents)
        next = reactSprite(next, event, Date.now(), config ?? undefined);
      return next;
    });
  }, [state, playerId, setIdentity, attackActive, hitContact]);
  useEffect(() => {
    if (pendingHit.current && (hitContact || !attackActive)) {
      const event = pendingHit.current;
      pendingHit.current = null;
      setReaction((current) =>
        reactSprite(current, event, Date.now(), config ?? undefined),
      );
    }
  }, [hitContact, attackActive, state.gameId, setIdentity]);
  useEffect(() => {
    if (
      !reaction.until ||
      reaction.event === "VICTORY" ||
      reaction.event === "DEFEAT"
    )
      return;
    const timer = setTimeout(
      () => setReaction({ event: "IDLE", until: 0 }),
      Math.max(0, reaction.until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [reaction]);
  const outcome =
    state.status === "FINISHED"
      ? state.winnerId === playerId
        ? ("VICTORY" as const)
        : ("DEFEAT" as const)
      : undefined;
  const candidates = championSpriteCandidates(appearance, {
    awakened: Boolean(player.champion?.questCompleted),
    low: spriteIsLow(getPlayerSurvivalHealth(state, playerId)),
    outcome,
    reaction: reaction.event,
  });
  const [failed, setFailed] = useState<Set<string>>(new Set());
  useEffect(
    () => setFailed(new Set()),
    [
      state.gameId,
      identity,
      config ? JSON.stringify(config) : "",
      portrait,
      original,
    ],
  );
  const selected = candidates.find((c) => !failed.has(c.url));
  const [loaded, setLoaded] = useState({ id: "", url: "" });
  const loadIdentity = `${state.gameId}:${playerId}:${setIdentity}`;
  const ready = loaded.id === loadIdentity ? loaded.url : "";
  const setReady = (url: string) => setLoaded({ id: loadIdentity, url });
  const displayUrl = ready || selected?.url;
  const currentSet =
    player.champion?.questCompleted && config?.awakening === "REPLACE"
      ? config.awakened
      : config;
  const displayFrame =
    displayUrl === selected?.url
      ? selected?.frame
      : Object.values(currentSet?.frames ?? {}).find(
          (frame) => frame.url === displayUrl,
        );
  const placement = displayFrame?.[self ? "self" : "opponent"];
  useEffect(() => {
    let cancelled = false;
    if (selected) {
      const image = new Image();
      image.src = selected.url;
      image
        .decode()
        .then(() => {
          if (!cancelled) setReady(selected.url);
        })
        .catch(() => {
          if (!cancelled) setFailed((old) => new Set([...old, selected.url]));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [selected?.url, loadIdentity]);
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    for (const config of [appearance.config])
      for (const f of config ? spriteFrames(config) : []) {
        const image = new Image();
        image.src = f.url;
        images.push(image);
      }
    return () => {
      for (const image of images) image.src = "";
    };
  }, [state.gameId, identity, config ? JSON.stringify(config) : ""]);
  const fallbackDisplay =
    displayUrl && !displayFrame ? appearance.display(displayUrl) : undefined;
  return (
    <div
      className="ko-champion-portrait-art ko-battle-actor absolute inset-0"
      data-sprite-source={displayFrame ? "registered" : "illustration-fallback"}
      data-reaction={outcome ?? reaction.event}
      data-sprite-state={
        outcome ??
        (spriteIsLow(getPlayerSurvivalHealth(state, playerId)) ? "LOW" : "IDLE")
      }
      data-sprite-skin={identity}
      data-sprite-set={
        setIdentity.endsWith(":awakened") ? "awakened" : "normal"
      }
      aria-hidden="true"
    >
      {selected ? (
        <div
          className="ko-battle-actor__body"
          style={
            {
              transform: `scaleX(${self ? 1 : -1})`,
              "--actor-fit": framed
                ? "contain"
                : displayFrame
                  ? placement?.crop
                    ? "cover"
                    : "contain"
                  : fallbackDisplay?.imageDisplayMode === "CONTAIN"
                    ? "contain"
                    : "cover",
            } as React.CSSProperties
          }
        >
          <CardArtwork
            key={`${loadIdentity}:${displayUrl}`}
            src={displayUrl}
            displayOverride={fallbackDisplay}
            alt=""
            imageDisplayMode={
              framed
                ? "CONTAIN"
                : displayFrame
                  ? placement?.crop
                    ? "COVER"
                    : "CONTAIN"
                  : "COVER"
            }
            imageScale={placement?.scale ?? 1}
            imagePositionX={placement?.x ?? 50}
            imagePositionY={placement?.y ?? (displayFrame ? 50 : 0)}
            className="h-full w-full"
          />
        </div>
      ) : (
        <span>{name}</span>
      )}
    </div>
  );
}
