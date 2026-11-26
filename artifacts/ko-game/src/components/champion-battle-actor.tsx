import { sizedImage, spriteImageWidth } from "../lib/sized-image";
import { useEffect, useRef, useState } from "react";
import {
  championSpriteSkin,
  championSpriteCandidates,
  spriteFrames,
  spriteAwakeningDelay,
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
  type ChampionMotionCue,
} from "./champion-sprite-motion";
import { prefersReducedMotion } from "./presentation-config";
import { CardArtwork } from "./card-artwork";
import "./champion-battle-actor.css";
import "./champion-life.css";
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
  const appearance = championSpriteSkin({
    championId: player.champion?.id ?? "",
    loadout,
    finisherId:player.champion?.selectedFinisherId,
    base: player.champion?.presentationLines?.BATTLE_SPRITE,
    normal: player.champion?.imageUrl ?? original,
    awakenedPortrait: player.champion?.questCompletedPortraitEnabled
      ? player.champion.questCompletedPortraitUrl
      : original,
    awakened: displayAwakened,
  });
  const config = appearance.config;
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
      spriteAwakeningDelay(config, prefersReducedMotion()),
    );
    return () => clearTimeout(timer);
  }, [state.gameId, player.champion?.questCompleted]);
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
  const pendingSince = useRef(0);
  const [pendingTick, setPendingTick] = useState(0);
  const sawAttack = useRef(false);
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
    let heldNow = false;
    const visible = cues.filter((cue) => {
      if (
        cue.kind === "EMOTE" &&
        currentSet?.emotes?.[
          cue.emote as
            "HELLO" | "THANKS" | "WELL_PLAYED" | "SORRY" | "OOPS" | "THREATEN"
        ] === null
      )
        return false;
      // 공격으로 맞은 경우: 공격 연출이 아직 시작 전이어도(같은 순간에 도착) 맞는 순간까지 피격 표정을 미룬다
      if (
        (cue.event === "HIT" || cue.event === "HEAVY_HIT") &&
        (attackActive || cue.basicAttack) &&
        !hitContact
      ) {
        if (pendingHit.current?.event !== "HEAVY_HIT") pendingHit.current = cue;
        pendingSince.current = Date.now();
        sawAttack.current = attackActive;
        heldNow = true;
        return false;
      }
      return true;
    });
    if (heldNow) setPendingTick((n) => n + 1);
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
          cue.holdMs,
        );
        if (accepted !== next) next = { ...accepted, cue };
      }
      return next;
    });
  }, [state, playerId, setIdentity, attackActive, hitContact]);
  useEffect(() => {
    if (attackActive && pendingHit.current) sawAttack.current = true;
    const release = () => {
      const cue = pendingHit.current;
      if (!cue) return;
      pendingHit.current = null;
      sawAttack.current = false;
      setReaction((current) => {
        const next = reactSprite(
          current,
          cue.event,
          Date.now(),
          config ?? undefined,
        );
        return next === current ? current : { ...next, cue };
      });
    };
    if (!pendingHit.current) return undefined;
    // 맞는 순간이 왔거나, 공격 연출이 끝났는데 맞는 순간을 못 받았으면 지금 보여준다
    if (hitContact || (!attackActive && sawAttack.current)) { release(); return undefined; }
    // 공격 연출이 끝내 오지 않으면(연출 생략 등) 잠시 뒤 그냥 보여준다
    if (!attackActive) {
      const timer = window.setTimeout(release, Math.max(0, 1200 - (Date.now() - pendingSince.current)));
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [hitContact, attackActive, state.gameId, setIdentity, pendingTick]);
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
  // A sprite that failed to load is retried a few times (slow phone networks drop images); it must not
  // leave the champion on its portrait for the rest of the match.
  const retries = useRef(new Map<string, number>());
  useEffect(() => { retries.current.clear(); }, [state.gameId, identity]);

  const selectedRaw = candidates.find((c) => !failed.has(c.url));
  const [loaded, setLoaded] = useState({ id: "", url: "", sprite: false });
  const loadIdentity = `${state.gameId}:${playerId}:${setIdentity}`;
  const ready = loaded.id === loadIdentity ? loaded.url : "";
  // Once a real sprite has shown, a sprite that is still loading/retrying never downgrades to the portrait:
  // keep the last sprite that did load (idle preferred) until the retry lands.
  const decoded = useRef(new Set<string>());
  const isSprite = (c?: { frame?: unknown }) => Boolean(c?.frame && c.frame !== appearance.portraitFrame);
  // 대신 보여줄 그림: '지금 상태' 그림(저체력 등) → 기본 → 반응 순서로, 이미 불러온 것 중에서.
  const spriteCandidates = candidates.filter(isSprite);
  const fallbackSprite = selectedRaw && !isSprite(selectedRaw)
    ? [...spriteCandidates.slice(1), ...spriteCandidates.slice(0, 1)].find(c => decoded.current.has(c.url))
    : undefined;
  const selected = fallbackSprite ?? selectedRaw;
  const setReady = (url: string, sprite: boolean) => setLoaded({ id: loadIdentity, url, sprite });
  const displayUrl = ready || selected?.url;
  // 화면에 그릴 땐 줄인 그림 (휴대폰 메모리 절약). 표정 판단은 원래 주소로.
  const spriteW = useRef(spriteImageWidth());
  const shownUrl = sizedImage(displayUrl, spriteW.current);
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
    if (selected && decoded.current.has(selected.url)) {
      // 이미 준비된 그림(경기 시작 때 미리 풀어 둔 반응 그림 등)은 기다리지 않고 바로 바꾼다
      setReady(selected.url, Boolean(selected.frame && selected.frame !== appearance.portraitFrame));
    } else if (selected) {
      const image = new Image();
      image.src = sizedImage(selected.url, spriteW.current);
      const url = selected.url, sprite = Boolean(selected.frame && selected.frame !== appearance.portraitFrame);
      // 휴대폰에서는 그림이 다 받아졌는데도 decode()가 가끔 실패한다 → 실제로 그려질 수 있으면 성공으로 본다.
      const loadedAnyway = () =>
        new Promise<void>((resolve, reject) => {
          const ok = () => (image.naturalWidth > 0 ? resolve() : reject(new Error("image failed")));
          if (image.complete) ok();
          else { image.onload = ok; image.onerror = () => reject(new Error("image failed")); }
        });
      image
        .decode()
        .catch(loadedAnyway)
        .then(() => {
          decoded.current.add(url);
          if (!cancelled) setReady(url, sprite);
        })
        .catch(() => {
          if (cancelled) return;
          setFailed((old) => new Set([...old, url]));
          const tries = (retries.current.get(url) ?? 0) + 1;
          retries.current.set(url, tries);
          if (tries <= 4) window.setTimeout(() => setFailed((old) => { if (!old.has(url)) return old; const next = new Set(old); next.delete(url); return next; }), 800 * tries * tries);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [selected?.url, loadIdentity]);
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    for (const config of [appearance.config])
      for (const f of [...(config ? spriteFrames({...config,finishers:undefined}) : []),...(appearance.portraitFrame?[appearance.portraitFrame]:[])]) {
        const image = new Image();
        image.src = sizedImage(f.url, spriteW.current);
        images.push(image);
        // 미리 받아서 '그릴 준비'까지 끝내 둔다 → 피격·공격 반응이 늦지 않게 바로 바뀜
        const url = f.url;
        image.decode().then(() => { decoded.current.add(url); }, () => {
          if (image.complete && image.naturalWidth > 0) decoded.current.add(url);
          else image.addEventListener("load", () => { if (image.naturalWidth > 0) decoded.current.add(url); }, { once: true });
        });
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
      data-active-turn={state.status === "IN_PROGRESS" && state.activePlayerId === playerId}
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
        image={shownUrl}
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
        waiting={state.status === "IN_PROGRESS" && state.activePlayerId !== playerId}
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
              src={shownUrl}
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
              maxImageScale={displayFrame ? 3 : 2}
              imageScale={placement?.scale ?? 1}
              imagePositionX={placement?.x ?? 50}
              imagePositionY={placement?.y ?? (displayFrame ? 50 : 0)}
              className="h-full w-full"
            />
            {displayFrame && displayUrl && (() => {
              // 12·13: 그림 모양 그대로 오려낸 명암·피격 실루엣 층
              const fit = placement?.crop ? "cover" : "contain";
              const x = placement?.x ?? 50, y = placement?.y ?? 50, scale = Math.min(3, Math.max(.1, placement?.scale ?? 1));
              const mask = { WebkitMaskImage: `url("${shownUrl}")`, maskImage: `url("${shownUrl}")`, WebkitMaskSize: fit, maskSize: fit,
                WebkitMaskPosition: `${x}% ${y}%`, maskPosition: `${x}% ${y}%`, transform: `scale(${scale})`, transformOrigin: `${x}% ${y}%` } as React.CSSProperties;
              return <><i className="kj-sprite-shade" style={mask} /><i className="kj-sprite-flash" style={mask} /></>;
            })()}
          </div>
        ) : (
          <span>{name}</span>
        )}
      </ChampionSpriteVisual>
    </div>
  );
}
