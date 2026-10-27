import { useEffect, useRef, useState } from "react";
import {
  parseBattleSprite,
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
  const skin = parseBattleSprite(
    loadout?.skins[skinKey("CHAMPION_SKIN", player.champion?.id ?? "")]
      ?.imageAssets.__battle,
  );
  const base = parseBattleSprite(
    player.champion?.presentationLines?.BATTLE_SPRITE,
  );
  const [reaction, setReaction] = useState<{
    event: SpriteEvent;
    until: number;
  }>({ event: "IDLE", until: 0 });
  const config = skin ?? base;
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
  const candidates = [] as Array<{
    url: string;
    frame?: import("@workspace/cosmetics").SpriteFrame;
  }>;
  for (const config of [skin, base]) {
    if (!config) continue;
    const frame = selectSpriteFrame(config, {
      awakened: Boolean(player.champion?.questCompleted),
      low: getPlayerSurvivalHealth(state, playerId) <= (config.lowHealth ?? 5),
      outcome,
      reaction: reaction.event,
      selfDamage: selfDamage.current,
    });
    if (frame) candidates.push({ url: frame.url, frame });
  }
  for (const url of [portrait, original]) if (url) candidates.push({ url });
  const [failed, setFailed] = useState<Set<string>>(new Set());
  useEffect(
    () => setFailed(new Set()),
    [
      state.gameId,
      skin ? JSON.stringify(skin) : "",
      base ? JSON.stringify(base) : "",
      portrait,
      original,
    ],
  );
  const selected = candidates.find((c) => !failed.has(c.url));
  const [ready, setReady] = useState("");
  const placement =
    ready === selected?.url
      ? selected?.frame?.[self ? "self" : "opponent"]
      : undefined;
  useEffect(() => setReady(""), [state.gameId, playerId]);
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
  }, [selected?.url]);
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    for (const config of [skin, base])
      for (const f of config ? spriteFrames(config) : []) {
        const image = new Image();
        image.src = f.url;
        images.push(image);
      }
    return () => {
      for (const image of images) image.src = "";
    };
  }, [
    state.gameId,
    skin ? JSON.stringify(skin) : "",
    base ? JSON.stringify(base) : "",
  ]);
  return (
    <div
      className="ko-champion-portrait-art ko-battle-actor absolute inset-0"
      data-sprite-source={
        selected?.frame ? "registered" : "illustration-fallback"
      }
      data-reaction={reaction.event}
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
                : ready || portrait || original || selected.url
            }
            fallbackSrc={portrait}
            displayOverride={
              !selected.frame &&
              selected.url === portrait &&
              !failed.has(portrait ?? "")
                ? cosmeticImageSettings(
                    loadout,
                    "CHAMPION_SKIN",
                    player.champion?.id ?? "",
                    player.champion?.questCompleted ? "awakened" : "portrait",
                  )
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
