import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useLocation, useParams } from "wouter";

import { GameStatePreview } from "@/components/game-state-preview";
import { MatchResultOverlay } from "@/components/match-result-overlay";
import { OnlineAuthGate } from "@/components/online-lobby-ui";
import type { AttackAnimationState } from "@/components/attack-animation-utils";
import {
  attackDamageImpactLevel,
  attackImpactLevel,
  attackSoundPitch,
} from "@/components/attack-animation-utils";
import type { CardPlayAnimationState, CardPlayGeometry } from "@/components/card-play-animation-utils";
import { landingImpactLevel } from "@/components/card-play-animation-utils";
import {
  emptyGameMediaCatalog,
  fetchGameMedia,
  fetchPublishedCardDefinitions,
  fetchPublishedChampions,
  preloadMatchAssets,
  setRuntimeCardDefinitions,
  type BoardSlot,
  type CardInstance,
  type GameMediaCatalog,
  type GameState,
} from "@/game";
import { audioManager } from "@/audio/audio-manager";
import {
  getOnlineLobbyClient,
  type OnlineLobbyConnectionState,
  type OnlineServerMessage,
} from "@/lib/online-lobby-client";
import type { OnlineActionPayload } from "@/lib/online-match-protocol";
import { projectOnlineGameState } from "@/lib/online-game-state";
import { ROUTES } from "@/lib/routes";

const TURN_TIME_LIMIT_SECONDS = 90;
const RESULT_SCREEN_SETTLE_DELAY_MS = 320;
const BGM_MUTE_STORAGE_KEY = "ko-game-bgm-muted";
const BGM_VOLUME_STORAGE_KEY = "ko-game-bgm-volume";

type ConnectionStatus = "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED";

type PendingPlay = {
  card: CardInstance;
  geometry: CardPlayGeometry & { target: NonNullable<CardPlayGeometry["target"]> };
};

type PendingAttack = {
  attacker: CardInstance;
  target: CardInstance | null;
  targetKind: "CARD" | "CHAMPION";
  geometry: AttackAnimationState["geometry"];
  targetPlayerId: string;
};

function readStoredBgmMute() {
  try {
    return window.localStorage.getItem(BGM_MUTE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function readStoredBgmVolume() {
  try {
    const value = Number(window.localStorage.getItem(BGM_VOLUME_STORAGE_KEY));
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 100;
  } catch {
    return 100;
  }
}

function actualDamage(
  previous: GameState,
  next: GameState,
  attackerId: string,
  targetPlayerId: string,
  targetCardId?: string,
) {
  const directChampion = previous.players
    .find((player) => player.id === targetPlayerId)
    ?.board.find((card) => card?.isDirectDeployedChampion);
  const damage = next.events.slice(previous.events.length).find((event) => {
    if (
      event.type !== "DAMAGE_DEALT" ||
      event.source?.type !== "CARD" ||
      event.source.cardInstanceId !== attackerId
    ) {
      return false;
    }
    return targetCardId
      ? event.target?.type === "CARD" && event.target.cardInstanceId === targetCardId
      : directChampion
        ? event.target?.type === "CARD" && event.target.cardInstanceId === directChampion.instanceId
        : event.target?.type === "PLAYER" && event.target.playerId === targetPlayerId;
  });
  return Math.max(0, damage?.amount ?? 0);
}

function OnlineMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [, navigate] = useLocation();
  const client = getOnlineLobbyClient();
  const [connection, setConnection] = useState<OnlineLobbyConnectionState>(client.state);
  const [seat, setSeat] = useState<"PLAYER_ONE" | "PLAYER_TWO" | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [mediaCatalog, setMediaCatalog] = useState<GameMediaCatalog>(emptyGameMediaCatalog);
  const [resourcesReady, setResourcesReady] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [turnDeadlineAt, setTurnDeadlineAt] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [connectionStates, setConnectionStates] = useState<Record<"PLAYER_ONE" | "PLAYER_TWO", ConnectionStatus> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionReplaced, setSessionReplaced] = useState(false);
  const [pendingAction, setPendingAction] = useState(false);
  const [bgmMuted, setBgmMuted] = useState(readStoredBgmMute);
  const [bgmVolume, setBgmVolume] = useState(readStoredBgmVolume);
  const [playAnimation, setPlayAnimation] = useState<CardPlayAnimationState | null>(null);
  const [attackAnimation, setAttackAnimation] = useState<AttackAnimationState | null>(null);
  const [attackImpactTriggered, setAttackImpactTriggered] = useState(false);
  const [presentationBusy, setPresentationBusy] = useState(false);
  const [matchResultVisible, setMatchResultVisible] = useState(false);
  const [presentationEpoch, setPresentationEpoch] = useState(0);
  const lastEventSequence = useRef(-1);
  const seatRef = useRef<typeof seat>(null);
  const stateRef = useRef<GameState | null>(null);
  const pendingActionIdRef = useRef<string | null>(null);
  const pendingPlayRef = useRef<PendingPlay | null>(null);
  const pendingAttackRef = useRef<PendingAttack | null>(null);
  const presentationBusyRef = useRef(false);
  const processedAudioEventsRef = useRef(new Set<string>());
  const processedAttackSoundsRef = useRef(new Set<string>());
  const lastAudioEventCountRef = useRef<number | null>(null);
  const pendingEntranceAudioRef = useRef<{ url: string; volume: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchPublishedCardDefinitions(),
      fetchPublishedChampions(),
      fetchGameMedia(),
    ]).then(([definitions, champions, media]) => {
      if (cancelled) return;
      setRuntimeCardDefinitions(definitions);
      preloadMatchAssets(definitions, champions);
      setMediaCatalog(media);
      setResourcesReady(true);
    }).catch((reason) => {
      if (!cancelled) setPlayError(reason instanceof Error ? reason.message : "온라인 매치 데이터를 불러오지 못했습니다.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribeConnection = client.onConnectionState((next) => {
      setConnection(next);
      if (next === "open" && matchId) client.send({ type: "SUBSCRIBE", matchId });
    });
    const unsubscribeMessage = client.onMessage((message: OnlineServerMessage) => {
      if ("matchId" in message && message.matchId !== matchId) return;
      if (
        message.type === "MATCH_SNAPSHOT" ||
        message.type === "ACTION_ACCEPTED" ||
        message.type === "MATCH_ENDED" ||
        message.type === "RESYNC_REQUIRED"
      ) {
        const nextSeat = message.type === "MATCH_SNAPSHOT" ? message.seat : seatRef.current;
        if (!nextSeat || !matchId) return;
        if (message.type === "MATCH_SNAPSHOT" || message.type === "RESYNC_REQUIRED") {
          lastEventSequence.current = -1;
          setPlayAnimation(null);
          setAttackAnimation(null);
          setAttackImpactTriggered(false);
          pendingPlayRef.current = null;
          pendingAttackRef.current = null;
          setPresentationEpoch((current) => current + 1);
        }
        setTurnDeadlineAt(message.turnDeadlineAt);
        setServerOffset(message.serverTime - Date.now());
        setConnectionStates(message.connectionStates);
        setSessionReplaced(false);
        const sequencedEvents = message.events.filter((event): event is { sequenceNumber: number } =>
          Boolean(event && typeof event === "object" && typeof (event as { sequenceNumber?: unknown }).sequenceNumber === "number"),
        );
        if (
          message.type !== "MATCH_SNAPSHOT" &&
          message.type !== "RESYNC_REQUIRED" &&
          sequencedEvents.some((event) => event.sequenceNumber > lastEventSequence.current + 1)
        ) {
          client.send({ type: "RESYNC", matchId });
          return;
        }
        if (sequencedEvents.length) lastEventSequence.current = sequencedEvents.at(-1)!.sequenceNumber;

        const projected = projectOnlineGameState(message.state, nextSeat);
        if (!projected) {
          setPlayError("서버 매치 상태를 해석하지 못했습니다.");
          return;
        }
        const previous = stateRef.current;
        if (message.type === "ACTION_ACCEPTED") {
          if (pendingActionIdRef.current === message.requestId) {
            pendingActionIdRef.current = null;
            setPendingAction(false);
          }
          prepareOwnAttackAnimation(previous, projected);
        } else {
          pendingActionIdRef.current = null;
          setPendingAction(false);
        }
        stateRef.current = projected;
        setSeat(nextSeat);
        seatRef.current = nextSeat;
        setState(projected);
        setVersion("version" in message ? message.version : null);
        setPlayError(null);
        if (message.type === "MATCH_ENDED") setNotice("매치가 종료되었습니다.");
        return;
      }
      if (message.type === "MATCH_CONNECTION_STATUS") {
        setConnectionStates((current) => ({
          ...(current ?? { PLAYER_ONE: "CONNECTED", PLAYER_TWO: "CONNECTED" }),
          [message.playerId]: message.status,
        }));
        setNotice(
          message.status === "DISCONNECTED_GRACE"
            ? "상대의 연결이 끊어졌습니다. 재접속을 기다리는 중..."
            : message.status === "FORFEITED"
              ? "상대의 연결 시간이 초과되었습니다."
              : "상대가 다시 연결되었습니다.",
        );
        return;
      }
      if (message.type === "SESSION_REPLACED") {
        setSessionReplaced(true);
        setPendingAction(false);
        setNotice(message.message);
        return;
      }
      if (message.type === "ACTION_REJECTED" || message.type === "LOBBY_ERROR" || message.type === "ERROR") {
        if (!("requestId" in message) || !message.requestId || pendingActionIdRef.current === message.requestId) {
          pendingActionIdRef.current = null;
          setPendingAction(false);
        }
        setPlayError(message.message);
      }
    });
    client.connect();
    return () => {
      unsubscribeMessage();
      unsubscribeConnection();
      if (matchId) client.send({ type: "UNSUBSCRIBE", matchId });
      audioManager.stopGameAudio();
    };
  }, [client, matchId]);

  useEffect(() => {
    if (!state || state.status !== "FINISHED" || presentationBusy) {
      setMatchResultVisible(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setMatchResultVisible(true), RESULT_SCREEN_SETTLE_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [state?.events.length, state?.status, presentationBusy]);

  useEffect(() => {
    if (!state || !resourcesReady || state.status !== "IN_PROGRESS") return;

    const guardState = { koMatchNavigationGuard: true };
    window.history.pushState(guardState, "", window.location.href);
    let leaving = false;
    const handlePopState = () => {
      if (leaving) return;
      if (window.confirm("진행 중인 매치에서 나가시겠습니까? 현재 진행 상황이 사라질 수 있습니다.")) {
        leaving = true;
        window.history.back();
      } else {
        window.history.pushState(guardState, "", window.location.href);
      }
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      leaving = true;
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [resourcesReady, state?.status]);

  useEffect(() => {
    if (!matchResultVisible) return;
    audioManager.stopAttack();
    audioManager.stop();
  }, [matchResultVisible]);

  useEffect(() => {
    const bgm = state && mediaCatalog.bgms.find((item) => item.id === state.bgmId);
    if (bgm) audioManager.playBgm(bgm.assetUrl, bgm.volume);
    else audioManager.stopBgm();
  }, [mediaCatalog.bgms, state?.bgmId]);

  useEffect(() => {
    audioManager.setBgmVolume(bgmVolume);
    audioManager.setBgmMuted(bgmMuted);
    try {
      window.localStorage.setItem(BGM_MUTE_STORAGE_KEY, String(bgmMuted));
      window.localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(bgmVolume));
    } catch {
      // Audio preference persistence is optional.
    }
  }, [bgmMuted, bgmVolume]);

  useEffect(() => {
    if (!state) return;
    if (state.latestQuestCompletedChampionId) {
      const champion = state.players
        .map((player) => player.champion)
        .find((candidate) => candidate?.id === state.latestQuestCompletedChampionId);
      if (champion?.questCompleteAudioEnabled && champion.questCompleteAudioUrl) {
        audioManager.playQuestComplete(
          champion.questCompleteAudioUrl,
          champion.questCompleteAudioVolume ?? 100,
        );
      }
    }
  }, [state?.latestQuestCompletedChampionId, state?.players]);

  useEffect(() => {
    if (!state) return;
    const previousCount = lastAudioEventCountRef.current;
    const startIndex = previousCount !== null && state.events.length >= previousCount ? previousCount : 0;
    if (previousCount !== null && state.events.length < previousCount) processedAudioEventsRef.current.clear();
    state.events.slice(startIndex).forEach((event, offset) => {
      const eventKey = `${startIndex + offset}:${event.type}:${event.cardInstanceId ?? ""}`;
      if (processedAudioEventsRef.current.has(eventKey)) return;
      processedAudioEventsRef.current.add(eventKey);
      if (event.type !== "ENTER_FIELD" || !event.cardInstanceId) return;
      const card = state.players.flatMap((player) => [
        ...player.deck,
        ...player.hand,
        ...player.board.filter((entry): entry is CardInstance => entry !== null),
        ...player.graveyard,
        ...player.removedFromGame,
      ]).find((entry) => entry.instanceId === event.cardInstanceId);
      if (!card?.entranceAudioEnabled || !card.entranceAudioUrl) return;
      const sound = { url: card.entranceAudioUrl, volume: card.entranceAudioVolume ?? 100 };
      if (playAnimation?.kind === "WRESTLER" && playAnimation.card.instanceId === event.cardInstanceId) {
        pendingEntranceAudioRef.current = sound;
      } else {
        audioManager.playCardEntrance(sound.url, sound.volume);
      }
    });
    lastAudioEventCountRef.current = state.events.length;
  }, [playAnimation, state]);

  const me = state?.players[0] ?? null;
  const opponent = state?.players[1] ?? null;
  const isConnected = connection === "open" && !sessionReplaced;
  const isMyTurn = Boolean(me && state?.status === "IN_PROGRESS" && state.activePlayerId === me.id);
  const canAct = Boolean(isConnected && isMyTurn && !pendingAction && !presentationBusy);
  const secondsRemaining = turnDeadlineAt === null
    ? TURN_TIME_LIMIT_SECONDS
    : Math.max(0, Math.ceil((turnDeadlineAt - (clock + serverOffset)) / 1000));

  function prepareOwnAttackAnimation(previous: GameState | null, next: GameState) {
    const pending = pendingAttackRef.current;
    if (!previous || !pending) return;
    const eventIndex = next.events.findIndex((event, index) =>
      index >= previous.events.length &&
      event.type === "ATTACK_DECLARED" &&
      event.cardInstanceId === pending.attacker.instanceId,
    );
    if (eventIndex < 0) return;
    const event = next.events[eventIndex];
    const damage = actualDamage(
      previous,
      next,
      pending.attacker.instanceId,
      pending.targetPlayerId,
      pending.target?.instanceId,
    );
    setAttackImpactTriggered(false);
    setAttackAnimation({
      ...pending,
      currentAttack: event.sourceSnapshot?.currentAttack ?? pending.attacker.currentAttack,
      impactLevel: attackImpactLevel(event.sourceSnapshot?.currentAttack ?? pending.attacker.currentAttack),
      damage,
      damageImpactLevel: attackDamageImpactLevel(damage),
      soundKey: `self:${eventIndex}:${pending.attacker.instanceId}:${pending.target?.instanceId ?? pending.targetPlayerId}`,
    });
    pendingAttackRef.current = null;
  }

  function sendAction(action: OnlineActionPayload, options?: { allowOffTurn?: boolean; allowDuringPresentation?: boolean }) {
    const actionAllowed = isConnected &&
      !pendingAction &&
      (options?.allowDuringPresentation || !presentationBusy) &&
      (options?.allowOffTurn || isMyTurn);
    if (!matchId || version === null || !actionAllowed) return false;
    const requestId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    pendingActionIdRef.current = requestId;
    setPendingAction(true);
    const sent = client.send({
      type: "MATCH_ACTION",
      matchId,
      requestId,
      expectedVersion: version,
      action,
    });
    if (!sent) {
      pendingActionIdRef.current = null;
      setPendingAction(false);
      setPlayError("온라인 서버에 연결할 수 없습니다.");
      return false;
    }
    setSelectedCardId(null);
    setSelectedAttackerId(null);
    setPlayError(null);
    return true;
  }

  function handleSelectCard(cardInstanceId: string) {
    if (!canAct || !state) return;
    if (state.targetingState?.active) {
      if (state.targetingState.validTargetIds.includes(cardInstanceId)) sendAction({ type: "SELECT_EFFECT_TARGET", targetId: cardInstanceId });
      return;
    }
    setSelectedAttackerId(null);
    setSelectedCardId((current) => current === cardInstanceId ? null : cardInstanceId);
  }

  function handleSelectAttacker(cardInstanceId: string) {
    if (!canAct || !state) return;
    if (state.targetingState?.active) {
      if (state.targetingState.validTargetIds.includes(cardInstanceId)) sendAction({ type: "SELECT_EFFECT_TARGET", targetId: cardInstanceId });
      return;
    }
    setSelectedCardId(null);
    setSelectedAttackerId((current) => current === cardInstanceId ? null : cardInstanceId);
  }

  function rememberPlay(card: CardInstance, geometry?: CardPlayGeometry) {
    if (!geometry?.target) return;
    pendingPlayRef.current = { card, geometry: { ...geometry, target: geometry.target } };
  }

  function handleSelectSlot(slot: BoardSlot, geometry?: CardPlayGeometry) {
    if (!state || !me || !selectedCardId || !canAct) return;
    const card = me.hand.find((entry) => entry.instanceId === selectedCardId);
    if (!card || card.cardType === "TECHNIQUE") return;
    rememberPlay(card, geometry);
    if (!sendAction({ type: "PLAY_WRESTLER", cardInstanceId: card.instanceId, boardSlot: slot })) {
      pendingPlayRef.current = null;
    }
  }

  function handleUseTechnique(cardInstanceId: string) {
    if (!sendAction({ type: "PLAY_TECHNIQUE", cardInstanceId })) return;
  }

  function handleAttackWrestler(targetCardInstanceId: string, geometry?: AttackAnimationState["geometry"]) {
    if (!state || !me || !opponent || !selectedAttackerId || !geometry || !canAct) return;
    const attacker = me.board.find((card) => card?.instanceId === selectedAttackerId);
    const target = opponent.board.find((card) => card?.instanceId === targetCardInstanceId) ?? null;
    if (!attacker) return;
    pendingAttackRef.current = {
      attacker,
      target,
      targetKind: "CARD",
      geometry,
      targetPlayerId: opponent.id,
    };
    if (!sendAction({
      type: "ATTACK",
      attackerInstanceId: attacker.instanceId,
      target: { type: "WRESTLER", playerId: opponent.id, cardInstanceId: targetCardInstanceId },
    })) {
      pendingAttackRef.current = null;
    }
  }

  function handleAttackPlayer(geometry?: AttackAnimationState["geometry"]) {
    if (!state || !me || !opponent || !selectedAttackerId || !geometry || !canAct) return;
    const attacker = me.board.find((card) => card?.instanceId === selectedAttackerId);
    if (!attacker) return;
    pendingAttackRef.current = {
      attacker,
      target: null,
      targetKind: "CHAMPION",
      geometry,
      targetPlayerId: opponent.id,
    };
    if (!sendAction({
      type: "ATTACK",
      attackerInstanceId: attacker.instanceId,
      target: { type: "PLAYER", playerId: opponent.id },
    })) {
      pendingAttackRef.current = null;
    }
  }

  function playAttackSound(animation: Pick<AttackAnimationState, "currentAttack" | "impactLevel" | "soundKey">) {
    if (processedAttackSoundsRef.current.has(animation.soundKey)) return;
    processedAttackSoundsRef.current.add(animation.soundKey);
    const sound = mediaCatalog.attackSounds[
      animation.impactLevel === "LIGHT"
        ? "LIGHT_ATTACK"
        : animation.impactLevel === "NORMAL"
          ? "NORMAL_ATTACK"
          : animation.impactLevel === "HEAVY"
            ? "HEAVY_ATTACK"
            : "VERY_HEAVY_ATTACK"
    ];
    if (sound) audioManager.playAttack(sound.assetUrl, sound.volume, attackSoundPitch(animation.currentAttack));
  }

  if (!resourcesReady || !state || !me || !opponent) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-black px-6 text-white">
        <div className="text-center">
          {playError ? <CircleAlert className="mx-auto h-8 w-8 text-red-300" /> : <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-amber-400" />}
          <p className="mt-5 text-sm font-black">{playError ?? "서버 매치를 불러오는 중입니다."}</p>
          <p className="mt-3 text-xs text-neutral-500">{connection === "open" ? "게임 상태를 기다리는 중" : "서버에 재연결하는 중"}</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="pointer-events-none fixed left-1/2 top-2 z-[220] flex -translate-x-1/2 items-center gap-3 rounded-full border border-neutral-700 bg-black/80 px-4 py-2 text-[10px] font-black tracking-[0.16em] text-neutral-300 shadow-lg">
        <span className={isConnected ? "text-emerald-400" : "text-red-300"} data-testid="status-online-match-connection">
          {sessionReplaced ? "SESSION REPLACED" : isConnected ? "SERVER CONNECTED" : "RECONNECTING"}
        </span>
        <span data-testid="text-online-match-version">v{version ?? "-"}</span>
        <span>{seat ?? "SEAT UNKNOWN"}</span>
        {state.status === "IN_PROGRESS" && <span className={secondsRemaining <= 10 ? "text-red-300" : "text-amber-300"} data-testid="text-online-turn-timer">{secondsRemaining}s</span>}
        {connectionStates && <span className="hidden sm:inline">{connectionStates.PLAYER_ONE === "CONNECTED" && connectionStates.PLAYER_TWO === "CONNECTED" ? "LIVE" : "GRACE"}</span>}
      </div>
      {(playError || notice || !isConnected) && (
        <div className="fixed bottom-3 left-1/2 z-[220] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded border border-amber-900/80 bg-black/90 px-4 py-2 text-xs font-bold text-amber-100 shadow-lg" data-testid="status-online-match-error">
          <CircleAlert className="h-4 w-4 shrink-0" />
          <span>{playError ?? notice ?? "연결이 끊겼습니다. 재연결 중..."}</span>
        </div>
      )}
      <GameStatePreview
        key={presentationEpoch}
        state={state}
        selectedCardId={selectedCardId}
        selectedAttackerId={selectedAttackerId}
        mediaCatalog={mediaCatalog}
        playError={playError}
        turnSecondsRemaining={secondsRemaining}
        onEndTurn={() => sendAction({ type: "END_TURN" }, { allowDuringPresentation: true })}
        canEndTurn={Boolean(
          isConnected &&
          isMyTurn &&
          !pendingAction &&
          !state.targetingState?.active &&
          !playAnimation &&
          !attackAnimation,
        )}
        bgmMuted={bgmMuted}
        onBgmMutedChange={setBgmMuted}
        bgmVolume={bgmVolume}
        onBgmVolumeChange={setBgmVolume}
        onSurrender={() => sendAction({ type: "SURRENDER" }, { allowOffTurn: true })}
        onSelectCard={handleSelectCard}
        onSelectSlot={handleSelectSlot}
        onUseTechnique={handleUseTechnique}
        playAnimation={playAnimation}
        onPlayAnimationComplete={() => {
          const pending = pendingEntranceAudioRef.current;
          if (pending) {
            audioManager.playCardEntrance(pending.url, pending.volume);
            pendingEntranceAudioRef.current = null;
          }
          window.setTimeout(() => setPlayAnimation(null), 180);
        }}
        attackAnimation={attackAnimation}
        attackImpactTriggered={attackImpactTriggered}
        onAttackImpact={() => {
          setAttackImpactTriggered(true);
          if (attackAnimation) playAttackSound(attackAnimation);
        }}
        onAttackAnimationComplete={() => {
          setAttackAnimation(null);
          setAttackImpactTriggered(false);
        }}
        onSelectAttacker={handleSelectAttacker}
        onAttackWrestler={handleAttackWrestler}
        onAttackPlayer={handleAttackPlayer}
        onOpponentAttackPresentation={(animation) => {
          if (attackAnimation || playAnimation) return;
          setAttackImpactTriggered(false);
          setAttackAnimation(animation);
        }}
        onSelfPlayPresentation={(card) => {
          const pending = pendingPlayRef.current;
          if (!pending || pending.card.instanceId !== card.instanceId) return;
          setPlayAnimation({
            kind: "WRESTLER",
            card: pending.card,
            geometry: pending.geometry,
            impactLevel: landingImpactLevel(pending.card.baseCost, pending.card.currentCost),
          });
          pendingPlayRef.current = null;
        }}
        onUseActive={(cardInstanceId) => sendAction({ type: "USE_ACTIVE", cardInstanceId })}
        onUseChampionAbility={() => sendAction({ type: "USE_CHAMPION_ABILITY" })}
        onCancelEffectTargeting={() => setPlayError("이 선택은 서버에서 완료될 때까지 유지됩니다.")}
        onEffectTarget={(targetId) => sendAction({ type: "SELECT_EFFECT_TARGET", targetId })}
        onPresentationBusyChange={(busy) => {
          presentationBusyRef.current = busy;
          setPresentationBusy(busy);
        }}
        onReturnToMainMenu={() => navigate(ROUTES.MAIN_MENU)}
      />
      {matchResultVisible && (
        <MatchResultOverlay state={state} onReturnToMainMenu={() => navigate(ROUTES.MAIN_MENU)} />
      )}
    </>
  );
}

export default function OnlineMatch() {
  return <OnlineAuthGate>{() => <OnlineMatchPage />}</OnlineAuthGate>;
}