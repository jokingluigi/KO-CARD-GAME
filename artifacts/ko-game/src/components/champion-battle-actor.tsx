import { useEffect, useRef, useState } from "react";
import {
  championSpriteSkin,
  championSpriteCandidates,
  selectSpriteFrame,
  spriteFrames,
  reactSprite,
  skinKey,
  cosmeticImageSettings,
  type SpriteEvent,
  type BattleSprite,
  type CosmeticLoadout,
} from "@workspace/cosmetics";
import { getPlayerSurvivalHealth, type GameState } from "@/game";
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
  const selfDamage = useRef(false);
  const health = useRef(player.health);
  const pendingHit = useRef(false);
  const cursor = useRef({ game: state.gameId, count: state.events.length });
  useEffect(() => {
    if (
      cursor.current.game !== state.gameId ||
      state.events.length < cursor.current.count
    ) {
      cursor.current = { game: state.gameId, count: state.events.length };
      health.current = player.health;
      pendingHit.current = false;
      setReaction({ event: "IDLE", until: 0 });
      return;
    }
    const events = state.events.slice(cursor.current.count);
    cursor.current.count = state.events.length;
    if (events.length && player.health > health.current)
      setReaction((current) =>
        reactSprite(current, "HEAL", Date.now(), config ?? undefined),
      );
    health.current = player.health;
    for (const e of events) {
      let event: SpriteEvent | undefined;
      if (
        e.type === "STAT_CHANGED" &&
        e.stat === "health" &&
        (e.delta ?? 0) > 0 &&
        e.target?.type === "PLAYER" &&
        e.target.playerId === playerId
      )
        event = "HEAL";
      if (e.type === "ENTER_FIELD" && e.playerId === playerId) event = "SUMMON";
      if (e.type === "ATTACK_DECLARED" && e.playerId === playerId)
        event = "ATTACK";
      if (
        e.type === "DAMAGE_DEALT" &&
        (e.amount ?? 0) > 0 &&
        e.target?.type === "PLAYER" &&
        e.target.playerId === playerId
      ) {
        event = "HIT";
        selfDamage.current = e.sourceContext?.sourcePlayerId === playerId;
      }
      if (
        e.type === "DAMAGE_DEALT" &&
        (e.amount ?? 0) > 0 &&
        (e.amount ?? 0) >= (config?.bigDamage ?? 6) &&
        e.target?.type === "PLAYER" &&
        e.target.playerId !== playerId &&
        e.sourceContext?.sourcePlayerId === playerId
      )
        event = "BIG_HIT";
      if (e.type === "CARD_RETIRED" && e.playerId === playerId) {
        const card = player.graveyard.find(
          (c) => c.instanceId === e.cardInstanceId,
        );
        const d = state.cardPool?.find((d) => d.id === card?.definitionId);
        if (
          d?.rarity === "LEGENDARY" ||
          (d?.cost ?? 0) >= (config?.majorCost ?? 5)
        )
          event = "ALLY_RETIRED";
      }
      if (e.type === "CHAMPION_ABILITY_USED" && e.playerId === playerId)
        event = "ABILITY";
      if (e.type === "CHAMPION_QUEST_COMPLETED" && e.playerId === playerId)
        event = "AWAKEN";
      if (event === "HIT" && attackActive && !hitContact) {
        pendingHit.current = true;
        continue;
      }
      if (event)
        setReaction((current) =>
          reactSprite(current, event!, Date.now(), config ?? undefined),
        );
    }
  }, [state.gameId, state.events, playerId, attackActive, hitContact]);
  useEffect(() => {
    if (pendingHit.current && (hitContact || !attackActive)) {
      pendingHit.current = false;
      setReaction((current) =>
        reactSprite(current, "HIT", Date.now(), config ?? undefined),
      );
    }
  }, [hitContact, attackActive]);
  useEffect(() => {
    if (!reaction.until) return;
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
    low: getPlayerSurvivalHealth(state, playerId) <= (config?.lowHealth ?? 5),
    outcome,
    reaction: reaction.event,
    selfDamage: selfDamage.current,
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
  const ready = loaded.id === setIdentity ? loaded.url : "";
  const setReady = (url: string) => setLoaded({ id: setIdentity, url });
  const placement =
    ready === selected?.url
      ? selected?.frame?.[self ? "self" : "opponent"]
      : undefined;
  useEffect(() => setReady(""), [state.gameId, playerId, setIdentity]);
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
  }, [selected?.url, setIdentity]);
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
  return (
    <div
      className="ko-champion-portrait-art ko-battle-actor absolute inset-0"
      data-sprite-source={
        selected?.frame ? "registered" : "illustration-fallback"
      }
      data-reaction={reaction.event}
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
              transform: `scaleX(${placement?.flip ? -1 : 1})`,
              "--actor-fit": placement?.crop ? "cover" : "contain",
            } as React.CSSProperties
          }
        >
          <CardArtwork
            src={
              ready === selected.url
                ? selected.url
                : ready || appearance.illustrations[0] || selected.url
            }
            fallbackSrc={appearance.illustrations.find(
              (url) => url !== selected.url,
            )}
            displayOverride={
              !selected.frame && !failed.has(selected.url)
                ? appearance.display(selected.url)
                : undefined
            }
            alt=""
            imageDisplayMode={placement?.crop ? "COVER" : "CONTAIN"}
            imageScale={placement?.scale ?? 1}
            imagePositionX={placement?.x ?? 50}
            imagePositionY={placement?.y ?? 50}
            className="h-full w-full"
          />
        </div>
      ) : (
        <span>{name}</span>
      )}
    </div>
  );
}
