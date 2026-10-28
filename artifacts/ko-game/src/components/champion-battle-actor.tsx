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
import {
  ChampionSpriteVisual,
  useMotionExpression,
} from "./champion-sprite-visual";
import {
  CHAMPION_MOTION,
  type ChampionMotionCue,
} from "./champion-sprite-motion";
import { prefersReducedMotion } from "./presentation-config";
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
  const [displayAwakened, setDisplayAwakened] = useState(
    Boolean(player.champion?.questCompleted),
  );
  const lastAppearance = useRef({
    game: state.gameId,
    awake: Boolean(player.champion?.questCompleted),
  });
  useEffect(() => {
    const awake = Boolean(player.champion?.questCompleted),
      prior = lastAppearance.current;
    lastAppearance.current = { game: state.gameId, awake };
    if (prior.game !== state.gameId || !awake || prior.awake) {
      setDisplayAwakened(awake);
      return;
    }
    const fresh = state.events
      .slice(cursor.current.count)
      .some(
        (e) => e.type === "CHAMPION_QUEST_COMPLETED" && e.playerId === playerId,
      );
    if (!fresh) {
      setDisplayAwakened(awake);
      return;
    }
    const timer = setTimeout(
      () => setDisplayAwakened(awake),
      prefersReducedMotion() ? 70 : CHAMPION_MOTION.awakeSwapMs,
    );
    return () => clearTimeout(timer);
  }, [state.gameId, player.champion?.questCompleted]);
  const appearance = championSpriteSkin({
    championId: player.champion?.id ?? "",
    loadout,
    base: player.champion?.presentationLines?.BATTLE_SPRITE,
    normal: player.champion?.imageUrl ?? original,
    awakenedPortrait: player.champion?.questCompletedPortraitEnabled
      ? player.champion.questCompletedPortraitUrl
      : original,
    awakened: displayAwakened,
  });
  const config = appearance.config;
  const identity = appearance.id;
  const setIdentity =
    identity +
    ":" +
    (displayAwakened && config?.awakening === "REPLACE"
      ? "awakened"
      : "normal");
  const [reaction, setReaction] = useState<{
    event: SpriteEvent;
    until: number;
    cue?: ChampionMotionCue;
  }>({ event: "IDLE", until: 0 });
  const pendingHit = useRef<ChampionMotionCue | null>(null);
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
    const cues: ChampionMotionCue[] = [];
    const priorState = previous.current;
    championSpriteEvents(priorState, state, playerId, cursor.current, cues);
    previous.current = state;
    if (state.status === "FINISHED" && priorState.status !== "FINISHED") {
      const win = state.winnerId === playerId;
      cues.push({
        id: `${state.gameId}:result:${playerId}`,
        event: win ? "VICTORY" : "DEFEAT",
        kind: win ? "VICTORY" : "DEFEAT",
      });
    }
    const currentSet =
      displayAwakened && config?.awakening === "REPLACE"
        ? config.awakened
        : config;
    const visible = cues.filter((cue) => {
      if (
        cue.kind === "EMOTE" &&
        currentSet?.emotes?.[
          cue.emote as
            "HELLO" | "THANKS" | "WELL_PLAYED" | "SORRY" | "OOPS" | "THREATEN"
        ] === null
      )
        return false;
      if (
        (cue.event === "HIT" || cue.event === "HEAVY_HIT") &&
        attackActive &&
        !hitContact
      ) {
        if (pendingHit.current?.event !== "HEAVY_HIT") pendingHit.current = cue;
        return false;
      }
      return true;
    });
    setReaction((current) => {
      let next: typeof current =
        changed && current.event !== "AWAKEN"
          ? { event: "IDLE", until: 0 }
          : current;
      for (const cue of visible) {
        if (cue.kind === "TURN") {
          if (next.until <= Date.now() && state.status !== "FINISHED")
            next = { ...next, cue };
          continue;
        }
        const accepted = reactSprite(
          next,
          cue.event,
          Date.now(),
          config ?? undefined,
        );
        if (accepted !== next) next = { ...accepted, cue };
      }
      return next;
    });
  }, [state, playerId, setIdentity, attackActive, hitContact]);
  useEffect(() => {
    if (pendingHit.current && (hitContact || !attackActive)) {
      const cue = pendingHit.current;
      pendingHit.current = null;
      setReaction((current) => {
        const next = reactSprite(
          current,
          cue.event,
          Date.now(),
          config ?? undefined,
        );
        return next === current ? current : { ...next, cue };
      });
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
  const motionSet =
    displayAwakened && config?.awakening === "REPLACE"
      ? config.awakened
      : config;
  const motionSettings = {
    ...appearance.motionDefaults,
    ...config?.motion,
    ...motionSet?.motion,
  };
  const expressionEvent = useMotionExpression(
    reaction.event,
    reaction.cue,
    motionSettings,
  );
  const candidates = championSpriteCandidates(appearance, {
    awakened: displayAwakened,
    low: spriteIsLow(getPlayerSurvivalHealth(state, playerId)),
    outcome,
    reaction: expressionEvent,
    emote: reaction.cue?.emote,
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
    displayAwakened && config?.awakening === "REPLACE"
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
      <ChampionSpriteVisual
        cue={reaction.cue}
        motion={motionSettings}
        setIdentity={setIdentity}
        state={
          outcome ??
          (spriteIsLow(getPlayerSurvivalHealth(state, playerId))
            ? "LOW"
            : "IDLE")
        }
        self={self}
        identity={`${state.gameId}:${identity}`}
        reacting={reaction.event !== "IDLE"}
        image={displayUrl}
        display={
          displayFrame
            ? {
                imageDisplayMode: placement?.crop ? "COVER" : "CONTAIN",
                imageScale: placement?.scale,
                imagePositionX: placement?.x,
                imagePositionY: placement?.y,
              }
            : (fallbackDisplay ?? {
                imageDisplayMode: framed ? "CONTAIN" : "COVER",
              })
        }
        accent={currentSet?.effects?.accent}
        origin={currentSet?.effects?.origin?.[self ? "self" : "opponent"]}
        viewerPlayerId={state.players[0].id}
        playerId={playerId}
      >
        {selected ? (
          <div
            className="ko-battle-actor__body"
            style={
              {
                transform: `scaleX(${self ? 1 : -1})`,
                "--actor-fit": displayFrame
                  ? placement?.crop
                    ? "cover"
                    : "contain"
                  : framed || fallbackDisplay?.imageDisplayMode === "CONTAIN"
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
                displayFrame
                  ? placement?.crop
                    ? "COVER"
                    : "CONTAIN"
                  : framed
                    ? "CONTAIN"
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
      </ChampionSpriteVisual>
    </div>
  );
}
