import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useLocation, useParams } from "wouter";

import { GameStatePreview } from "@/components/game-state-preview";
import { MatchResultOverlay } from "@/components/match-result-overlay";
import { MatchIntroOverlay } from "@/components/online-match-intro";
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
  getCardDefinition,
  preloadMatchAssets,
  setRuntimeCardDefinitions,
  type BoardSlot,
  type CardInstance,
  type GameMediaCatalog,
  type GameState,
} from "@/game";
import { audioManager } from "@/audio/audio-manager";
import {
  BGM_MUTE_STORAGE_KEY,
  BGM_VOLUME_STORAGE_KEY,
  readStoredBgmMute,
  readStoredBgmVolume,
} from "@/audio/audio-settings";
import {
  abandonOnlineMatch,
  getOnlineLobbyClient,
  type OnlineLobbyConnectionState,
  type OnlineServerMessage,
} from "@/lib/online-lobby-client";
import type { OnlineActionPayload } from "@/lib/online-match-protocol";
import {
  championAbilityAction,
  effectTargetAction,
  shouldResyncAfterActionRejection,
} from "@/lib/online-target-actions";
import { projectOnlineGameState } from "@/lib/online-game-state";
import { ROUTES } from "@/lib/routes";
import { fetchOnlineMatchRewards } from "@/lib/rewards-client";
import {
  onlineConnectionNotice,
  type OnlineConnectionStatus,
} from "@/lib/online-connection-notice";

const TURN_TIME_LIMIT_SECONDS = 90;
const RESULT_SCREEN_SETTLE_DELAY_MS = 320;
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
  const [hasAuthoritativeSnapshot, setHasAuthoritativeSnapshot] = useState(false);
  const [showRecoveryActions, setShowRecoveryActions] = useState(false);
  const [abandoningMatch, setAbandoningMatch] = useState(false);
  const [seat, setSeat] = useState<"PLAYER_ONE" | "PLAYER_TWO" | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [mediaCatalog, setMediaCatalog] = useState<GameMediaCatalog>(emptyGameMediaCatalog);
  const [resourcesReady, setResourcesReady] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [turnDeadlineAt, setTurnDeadlineAt] = useState<number | null>(null);
  const [gameplayStartsAt, setGameplayStartsAt] = useState<number | null>(null);
  const [publicPlayers, setPublicPlayers] = useState<Array<{
    seat: "PLAYER_ONE" | "PLAYER_TWO"; displayName: string; championName: string; portraitUrl: string | null; dialogueLine: string | null;
  }>>([]);
  const [introFirstSpeaker, setIntroFirstSpeaker] = useState<"PLAYER_ONE" | "PLAYER_TWO" | null>(null);
  const [introSkipped, setIntroSkipped] = useState(false);
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
  const [matchReward, setMatchReward] = useState<{ amount: number; sourceType: string } | null>(null);
  const lastEventSequence = useRef(-1);
  const seatRef = useRef<typeof seat>(null);
  const stateRef = useRef<GameState | null>(null);
  const versionRef = useRef<number | null>(null);
  const pendingActionIdRef = useRef<string | null>(null);
  const pendingActionInFlightRef = useRef(false);
  const preserveRejectedActionMessageRef = useRef(false);
  const pendingPlayRef = useRef<PendingPlay | null>(null);
  const pendingAttackRef = useRef<PendingAttack | null>(null);
  const presentationBusyRef = useRef(false);
  const processedAudioEventsRef = useRef(new Set<string>());
  const processedAttackSoundsRef = useRef(new Set<string>());
  const lastAudioEventCountRef = useRef<number | null>(null);
  const pendingEntranceAudioRef = useRef<{ url: string; volume: number; isLegendary: boolean } | null>(null);
  const pendingOpponentAttacksRef = useRef<AttackAnimationState[]>([]);
  const opponentConnectionStateRef = useRef<OnlineConnectionStatus | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const noticeTokenRef = useRef(0);
  const playAnimationTimerRef = useRef<number | null>(null);
  const activeBgmKeyRef = useRef<string | null>(null);

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
      console.info("[KO online match]", { event: "connection-notification", matchId, next, ...client.diagnostics });
      setConnection(next);
      if (next !== "open") {
        console.info("[KO online match]", { event: "snapshot-invalidated-by-connection", matchId, next });
        setHasAuthoritativeSnapshot(false);
        pendingActionIdRef.current = null;
        pendingActionInFlightRef.current = false;
        setPendingAction(false);
        return;
      }
      if (matchId) {
        console.info("[KO online match]", { event: "subscribe-on-open", matchId, ...client.diagnostics });
        setHasAuthoritativeSnapshot(false);
        pendingActionInFlightRef.current = true;
        setPendingAction(true);
        if (!client.send({ type: "SUBSCRIBE", matchId })) {
          pendingActionInFlightRef.current = false;
          setPendingAction(false);
        }
      }
    });
    const unsubscribeMessage = client.onMessage((message: OnlineServerMessage) => {
      if (message.type === "MATCH_SNAPSHOT") {
        console.info("[KO online match]", {
          event: "snapshot-dispatched",
          matchId,
          receivedMatchId: message.matchId,
          routeMatches: message.matchId === matchId,
          seat: message.seat,
          version: message.version,
          ...client.diagnostics,
        });
      }
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
          pendingEntranceAudioRef.current = null;
          pendingOpponentAttacksRef.current = [];
          pendingActionIdRef.current = null;
          pendingActionInFlightRef.current = false;
          setPendingAction(false);
        }
        setTurnDeadlineAt(message.turnDeadlineAt);
        setGameplayStartsAt(message.gameplayStartsAt);
        setPublicPlayers(message.publicPlayers);
        setIntroFirstSpeaker(message.introFirstSpeaker);
        setServerOffset(message.serverTime - Date.now());
        setConnectionStates(message.connectionStates);
        opponentConnectionStateRef.current = message.connectionStates[
          nextSeat === "PLAYER_ONE" ? "PLAYER_TWO" : "PLAYER_ONE"
        ];
        setSessionReplaced(false);
        const sequencedEvents = message.events.filter((event): event is { sequenceNumber: number } =>
          Boolean(event && typeof event === "object" && typeof (event as { sequenceNumber?: unknown }).sequenceNumber === "number"),
        );
        if (
          message.type !== "MATCH_SNAPSHOT" &&
          message.type !== "RESYNC_REQUIRED" &&
          sequencedEvents.some((event) => event.sequenceNumber > lastEventSequence.current + 1)
        ) {
          requestMatchResync();
          return;
        }
        if (sequencedEvents.length) lastEventSequence.current = sequencedEvents.at(-1)!.sequenceNumber;

        const projected = projectOnlineGameState(message.state, nextSeat);
        if (!projected) {
          console.info("[KO online match]", { event: "snapshot-projection-failed", matchId, seat: nextSeat });
          setHasAuthoritativeSnapshot(false);
          setPlayError("서버 매치 상태를 해석하지 못했습니다.");
          return;
        }
        if (message.type === "MATCH_SNAPSHOT") {
          console.info("[KO online match]", { event: "snapshot-accepted", matchId, seat: nextSeat, version: message.version, ...client.diagnostics });
        }
        setHasAuthoritativeSnapshot(true);
        const previous = stateRef.current;
        if (message.type === "ACTION_ACCEPTED") {
          if (pendingActionIdRef.current === message.requestId) {
            pendingActionIdRef.current = null;
            pendingActionInFlightRef.current = false;
            setPendingAction(false);
          }
          prepareOwnAttackAnimation(previous, projected);
        } else {
          pendingActionIdRef.current = null;
          pendingActionInFlightRef.current = false;
          setPendingAction(false);
        }
        stateRef.current = projected;
        versionRef.current = "version" in message ? message.version : null;
        setSeat(nextSeat);
        seatRef.current = nextSeat;
        setState(projected);
        setVersion("version" in message ? message.version : null);
        if (message.type !== "RESYNC_REQUIRED" || !preserveRejectedActionMessageRef.current) {
          preserveRejectedActionMessageRef.current = false;
          setPlayError(null);
        }
        if (message.type === "MATCH_ENDED") {
          setNotice("매치가 종료되었습니다.");
          client.send({ type: "UNSUBSCRIBE", matchId });
        } else if (message.type === "MATCH_SNAPSHOT" && projected.status === "FINISHED") {
          client.send({ type: "UNSUBSCRIBE", matchId });
        }
        return;
      }
      if (message.type === "MATCH_CONNECTION_STATUS") {
        if (message.playerId === seatRef.current) return;
        setConnectionStates((current) => ({
          ...(current ?? { PLAYER_ONE: "CONNECTED", PLAYER_TWO: "CONNECTED" }),
          [message.playerId]: message.status,
        }));
        const previousOpponentStatus = opponentConnectionStateRef.current;
        opponentConnectionStateRef.current = message.status;
        const noticeKind = onlineConnectionNotice(previousOpponentStatus, message.status);
        if (!noticeKind) return;
        const noticeToken = ++noticeTokenRef.current;
        if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
        setNotice(
          noticeKind === "OPPONENT_DISCONNECTED"
            ? "상대의 연결이 끊어졌습니다. 재접속을 기다리는 중..."
            : noticeKind === "OPPONENT_FORFEITED"
              ? "상대의 연결 시간이 초과되었습니다."
              : "상대가 다시 연결되었습니다.",
        );
        noticeTimerRef.current = window.setTimeout(() => {
          if (noticeTokenRef.current === noticeToken) setNotice(null);
          noticeTimerRef.current = null;
        }, 4_000);
        return;
      }
      if (message.type === "SESSION_REPLACED") {
        console.info("[KO online match]", { event: "snapshot-invalidated-by-session-replacement", matchId });
        setHasAuthoritativeSnapshot(false);
        setSessionReplaced(true);
        pendingActionIdRef.current = null;
        pendingActionInFlightRef.current = false;
        setPendingAction(false);
        setNotice(message.message);
        return;
      }
      if (message.type === "ACTION_REJECTED" || message.type === "LOBBY_ERROR" || message.type === "ERROR") {
        if (
          message.type === "ERROR" &&
          ["FORBIDDEN", "NOT_SUBSCRIBED", "MATCH_UNAVAILABLE"].includes(message.code)
        ) {
          console.info("[KO online match]", { event: "snapshot-invalidated-by-server-error", matchId, code: message.code });
          setHasAuthoritativeSnapshot(false);
        }
        if (!("requestId" in message) || !message.requestId || pendingActionIdRef.current === message.requestId) {
          pendingActionIdRef.current = null;
          pendingActionInFlightRef.current = false;
          setPendingAction(false);
        }
        setPlayError(message.message);
        if (
          message.type === "ACTION_REJECTED" &&
          shouldResyncAfterActionRejection(
            message.code,
            versionRef.current ?? message.currentVersion,
            message.currentVersion,
          )
        ) {
          preserveRejectedActionMessageRef.current = true;
          requestMatchResync();
        }
      }
    });
    client.connect();
    return () => {
      console.info("[KO online match]", { event: "match-effect-cleanup", matchId, ...client.diagnostics });
      unsubscribeMessage();
      unsubscribeConnection();
      if (matchId) client.send({ type: "UNSUBSCRIBE", matchId });
      audioManager.stopGameAudio();
      pendingOpponentAttacksRef.current = [];
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      if (playAnimationTimerRef.current !== null) window.clearTimeout(playAnimationTimerRef.current);
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
    if (!matchId || state?.status !== "FINISHED") {
      setMatchReward(null);
      return;
    }
    let cancelled = false;
    fetchOnlineMatchRewards(matchId)
      .then((result) => {
        if (!cancelled) {
          const grant = result.grants[0];
          setMatchReward(grant ? { amount: grant.amount, sourceType: grant.sourceType } : null);
        }
      })
      .catch(() => {
        if (!cancelled) setMatchReward(null);
      });
    return () => { cancelled = true; };
  }, [matchId, state?.status]);

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
    audioManager.stopGameAudio();
  }, [matchResultVisible]);

  useEffect(() => {
    const champion = state?.players.map((player) => player.champion)
      .find((candidate) => candidate?.id === state.latestQuestCompletedChampionId);
    const questMusic = champion?.questCompleted && champion.questCompleteAudioEnabled && champion.questCompleteAudioUrl
      ? { assetUrl: champion.questCompleteAudioUrl, volume: champion.questCompleteAudioVolume ?? 100 }
      : null;
    const bgm = state ? mediaCatalog.bgms.find((item) => item.id === state.bgmId) : undefined;
    const selected = questMusic ?? bgm;
    if (!selected) {
      if (activeBgmKeyRef.current !== null) audioManager.stopBgm();
      activeBgmKeyRef.current = null;
      return;
    }
    const key = `${questMusic ? 'quest' : bgm?.id}:${selected.assetUrl}:${selected.volume}`;
    if (activeBgmKeyRef.current === key) return;
    activeBgmKeyRef.current = key;
    if (questMusic) audioManager.playQuestComplete(selected.assetUrl, selected.volume);
    else audioManager.playMatchBgm(selected.assetUrl, selected.volume);
  }, [mediaCatalog.bgms, state?.bgmId, state?.latestQuestCompletedChampionId, state?.players]);

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
      const sound = {
        url: card.entranceAudioUrl,
        volume: card.entranceAudioVolume ?? 100,
        isLegendary: getCardDefinition(card.definitionId)?.rarity === "LEGENDARY",
      };
      if (playAnimation?.kind === "WRESTLER" && playAnimation.card.instanceId === event.cardInstanceId) {
        pendingEntranceAudioRef.current = sound;
      } else {
        if (sound.isLegendary) {
          audioManager.playLegendaryEntrance(sound.url, sound.volume);
        } else {
          audioManager.playCardEntrance(sound.url, sound.volume);
        }
      }
    });
    lastAudioEventCountRef.current = state.events.length;
  }, [playAnimation, state]);

  const me = state?.players[0] ?? null;
  const opponent = state?.players[1] ?? null;
  const viewerSeat = nextSeatForIntro(seat);
  const selfPublicPlayer = publicPlayers.find((player) => player.seat === viewerSeat);
  const opponentPublicPlayer = publicPlayers.find((player) => player.seat !== viewerSeat);
  const isConnected = connection === "open" && hasAuthoritativeSnapshot && !sessionReplaced;
  const awaitingAuthoritativeMatch =
    connection !== "open" || !hasAuthoritativeSnapshot || sessionReplaced;
  useEffect(() => {
    console.info("[KO online match]", {
      event: "readiness-render",
      matchId,
      connection,
      hasAuthoritativeSnapshot,
      sessionReplaced,
      isConnected,
      seat,
      version,
      ...client.diagnostics,
    });
  }, [client, connection, hasAuthoritativeSnapshot, isConnected, matchId, seat, sessionReplaced, version]);
  useEffect(() => {
    if (!matchId || !awaitingAuthoritativeMatch || state?.status === "FINISHED") {
      setShowRecoveryActions(false);
      return;
    }
    const timer = window.setTimeout(() => setShowRecoveryActions(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [awaitingAuthoritativeMatch, matchId, state?.status]);
  const isMyTurn = Boolean(me && state?.status === "IN_PROGRESS" && state.activePlayerId === me.id);
  const introFinished = gameplayStartsAt === null || clock + serverOffset >= gameplayStartsAt;
  const canAct = Boolean(isConnected && introFinished && isMyTurn && !pendingAction && !presentationBusy);
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
      finishingBlow: pending.targetKind === "CHAMPION" && next.status === "FINISHED" &&
        next.loserId === pending.targetPlayerId && damage > 0,
      soundKey: `self:${eventIndex}:${pending.attacker.instanceId}:${pending.target?.instanceId ?? pending.targetPlayerId}`,
    });
    pendingAttackRef.current = null;
  }

  function requestMatchResync() {
    if (!matchId) return;
    pendingActionInFlightRef.current = true;
    setPendingAction(true);
    if (!client.send({ type: "RESYNC", matchId })) {
      pendingActionInFlightRef.current = false;
      setPendingAction(false);
    }
  }

  function retryMatchConnection() {
    console.info("[KO online match]", { event: "manual-retry", matchId, ...client.diagnostics });
    setShowRecoveryActions(false);
    setHasAuthoritativeSnapshot(false);
    client.reconnectNow();
  }

  async function abandonAndReturnToMain() {
    if (!matchId || abandoningMatch) return;
    if (!window.confirm("매치를 항복으로 종료하고 메인 화면으로 돌아갈까요? 이 결과는 매치 기록에 저장됩니다.")) return;
    setAbandoningMatch(true);
    setPlayError(null);
    try {
      await abandonOnlineMatch(matchId);
      client.send({ type: "UNSUBSCRIBE", matchId });
      navigate(ROUTES.MAIN_MENU);
    } catch (reason) {
      setPlayError(reason instanceof Error ? reason.message : "매치를 종료하지 못했습니다. 다시 시도해 주세요.");
      setShowRecoveryActions(true);
    } finally {
      setAbandoningMatch(false);
    }
  }

  function returnToMainWithMatchSaved() {
    if (matchId) client.send({ type: "UNSUBSCRIBE", matchId });
    navigate(ROUTES.MAIN_MENU);
  }

  function clearRejectedActionMessage() {
    preserveRejectedActionMessageRef.current = false;
    setPlayError(null);
  }

  function sendAction(action: OnlineActionPayload, options?: { allowOffTurn?: boolean; allowDuringPresentation?: boolean }) {
    clearRejectedActionMessage();
    const actionAllowed = isConnected &&
      introFinished &&
      !pendingAction &&
      !pendingActionInFlightRef.current &&
      (options?.allowDuringPresentation || !presentationBusy) &&
      (options?.allowOffTurn || isMyTurn);
    if (!matchId || version === null || !actionAllowed) return false;
    const requestId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    pendingActionIdRef.current = requestId;
    pendingActionInFlightRef.current = true;
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
      pendingActionInFlightRef.current = false;
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
    clearRejectedActionMessage();
    if (state.targetingState?.active) {
      handleEffectTarget(cardInstanceId);
      return;
    }
    setSelectedAttackerId(null);
    setSelectedCardId((current) => current === cardInstanceId ? null : cardInstanceId);
  }

  function handleSelectAttacker(cardInstanceId: string) {
    if (!canAct || !state) return;
    clearRejectedActionMessage();
    if (state.targetingState?.active) {
      handleEffectTarget(cardInstanceId);
      return;
    }
    setSelectedCardId(null);
    setSelectedAttackerId((current) => current === cardInstanceId ? null : cardInstanceId);
  }

  function handleEffectTarget(targetId: string) {
    clearRejectedActionMessage();
    const currentState = stateRef.current;
    const targeting = currentState?.targetingState;
    if (!targeting?.active || !targeting.validTargetIds.includes(targetId)) {
      preserveRejectedActionMessageRef.current = true;
      setPlayError("대상 상태가 변경되었습니다. 최신 매치 상태를 불러옵니다.");
      if (!pendingActionInFlightRef.current) requestMatchResync();
      return;
    }
    sendAction(effectTargetAction(targeting.phase, targetId));
  }

  function handleUseChampionAbility() {
    clearRejectedActionMessage();
    if (!state || !me) return;
    const champion = me.champion;
    const activeAbility = champion?.questCompleted && champion.upgradedAbility
      ? champion.upgradedAbility
      : champion?.ability;
    const action = activeAbility ? championAbilityAction(activeAbility.effects) : null;
    if (!action) {
      setPlayError("현재 챔피언 능력을 사용할 수 없습니다. 최신 매치 상태를 불러옵니다.");
      requestMatchResync();
      return;
    }
    sendAction(action);
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
    if (!sendAction({ type: "BEGIN_TARGETED_ACTION", action: { type: "PLAY_TECHNIQUE", cardInstanceId } })) return;
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
    audioManager.playAttack(
      `${import.meta.env.BASE_URL}sfx/impact-${animation.impactLevel.toLowerCase().replace('_', '-')}.wav`,
      sound?.volume ?? 85,
      attackSoundPitch(animation.currentAttack),
    );
  }

  useEffect(() => {
    if (attackAnimation || playAnimation || pendingOpponentAttacksRef.current.length === 0) return;
    setAttackAnimation(pendingOpponentAttacksRef.current.shift() ?? null);
  }, [attackAnimation, playAnimation]);

  if (!resourcesReady || !state || !me || !opponent) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-black px-6 text-white">
        <div className="text-center">
          {playError ? <CircleAlert className="mx-auto h-8 w-8 text-red-300" /> : <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-amber-400" />}
          <p className="mt-5 text-sm font-black">{playError ?? "서버 매치를 불러오는 중입니다."}</p>
          <p className="mt-3 text-xs text-neutral-500">{connection === "open" ? "서버의 최신 매치 상태를 기다리는 중" : "서버에 재연결하는 중"}</p>
        </div>
        {showRecoveryActions && (
          <section
            className="mt-8 w-full max-w-xl rounded-xl border border-amber-500/40 bg-neutral-950 p-4 shadow-2xl"
            data-testid="online-match-recovery-actions"
            aria-label="매치 연결 복구 옵션"
          >
            <p className="text-sm font-black text-amber-100">매치 상태를 아직 확인하지 못했습니다.</p>
            <p className="mt-1 text-xs leading-5 text-neutral-400">
              다시 연결하거나, 매치를 유지한 채 메인으로 돌아갈 수 있습니다. 항복은 서버에 결과를 저장한 뒤 종료합니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="button-online-match-reconnect"
                onClick={retryMatchConnection}
                className="rounded bg-amber-400 px-3 py-2 text-xs font-black text-black hover:bg-amber-300"
              >
                다시 연결
              </button>
              <button
                type="button"
                data-testid="button-online-match-main-saved"
                onClick={returnToMainWithMatchSaved}
                className="rounded border border-neutral-700 px-3 py-2 text-xs font-bold text-neutral-200 hover:border-neutral-500"
              >
                매치 유지하고 메인으로
              </button>
              <button
                type="button"
                data-testid="button-online-match-abandon"
                disabled={abandoningMatch}
                onClick={() => void abandonAndReturnToMain()}
                className="rounded border border-red-900/70 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-950/60 disabled:opacity-50"
              >
                {abandoningMatch ? "매치 종료 중…" : "항복하고 메인으로"}
              </button>
            </div>
          </section>
        )}
      </main>
    );
  }

  return (
    <>
      {gameplayStartsAt !== null && clock + serverOffset < gameplayStartsAt && !introSkipped && (
        <MatchIntroOverlay
          self={{
            displayName: selfPublicPlayer?.displayName ?? "Player",
            championName: selfPublicPlayer?.championName ?? me.champion?.name ?? "Champion",
            portraitUrl: selfPublicPlayer?.portraitUrl ?? me.champion?.imageUrl ?? null,
            dialogueLine: selfPublicPlayer?.dialogueLine ?? null,
          }}
          opponent={(() => {
            return { displayName: opponentPublicPlayer?.displayName ?? "Opponent", championName: opponentPublicPlayer?.championName ?? opponent.champion?.name ?? "Champion", portraitUrl: opponentPublicPlayer?.portraitUrl ?? opponent.champion?.imageUrl ?? null, dialogueLine: opponentPublicPlayer?.dialogueLine ?? null };
          })()}
          firstSpeaker={introFirstSpeaker === viewerSeat ? "self" : introFirstSpeaker ? "opponent" : null}
          startedAt={gameplayStartsAt - 4500}
          gameplayStartsAt={gameplayStartsAt}
          onSkipRequest={() => setIntroSkipped(true)}
        />
      )}
      {gameplayStartsAt !== null && clock + serverOffset < gameplayStartsAt && introSkipped && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 text-sm font-bold text-amber-200" data-testid="match-intro-wait">
          매치 시작을 기다리는 중… 서버 시각에 맞춰 곧 게임이 시작됩니다.
        </div>
      )}
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
      {showRecoveryActions && state.status !== "FINISHED" && (
        <section
          className="fixed bottom-14 left-1/2 z-[240] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-amber-500/40 bg-neutral-950/95 p-4 shadow-2xl"
          data-testid="online-match-recovery-actions"
          aria-label="매치 연결 복구 옵션"
        >
          <p className="text-sm font-black text-amber-100">서버 상태를 다시 확인하고 있습니다.</p>
          <p className="mt-1 text-xs leading-5 text-neutral-400">
            다시 연결하거나, 매치를 유지한 채 메인으로 돌아갈 수 있습니다. 항복은 서버에 결과를 저장한 뒤 종료합니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="button-online-match-reconnect"
              onClick={retryMatchConnection}
              className="rounded bg-amber-400 px-3 py-2 text-xs font-black text-black hover:bg-amber-300"
            >
              다시 연결
            </button>
            <button
              type="button"
              data-testid="button-online-match-main-saved"
              onClick={returnToMainWithMatchSaved}
              className="rounded border border-neutral-700 px-3 py-2 text-xs font-bold text-neutral-200 hover:border-neutral-500"
            >
              매치 유지하고 메인으로
            </button>
            <button
              type="button"
              data-testid="button-online-match-abandon"
              disabled={abandoningMatch}
              onClick={() => void abandonAndReturnToMain()}
              className="rounded border border-red-900/70 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-950/60 disabled:opacity-50"
            >
              {abandoningMatch ? "매치 종료 중…" : "항복하고 메인으로"}
            </button>
          </div>
        </section>
      )}
      <GameStatePreview
        state={state}
        selectedCardId={selectedCardId}
        selectedAttackerId={selectedAttackerId}
        mediaCatalog={mediaCatalog}
        playError={playError}
        turnSecondsRemaining={secondsRemaining}
        onEndTurn={() => sendAction({ type: "END_TURN" }, { allowDuringPresentation: true })}
        canEndTurn={Boolean(
          isConnected &&
          introFinished &&
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
            if (pending.isLegendary) {
              audioManager.playLegendaryEntrance(pending.url, pending.volume);
            } else {
              audioManager.playCardEntrance(pending.url, pending.volume);
            }
            pendingEntranceAudioRef.current = null;
          }
          if (playAnimationTimerRef.current !== null) window.clearTimeout(playAnimationTimerRef.current);
          playAnimationTimerRef.current = window.setTimeout(() => {
            setPlayAnimation(null);
            playAnimationTimerRef.current = null;
          }, 180);
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
          pendingOpponentAttacksRef.current.push(animation);
          if (!attackAnimation && !playAnimation) {
            setAttackImpactTriggered(false);
            setAttackAnimation(pendingOpponentAttacksRef.current.shift() ?? null);
          }
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
        onUseActive={(cardInstanceId) => sendAction({ type: "BEGIN_TARGETED_ACTION", action: { type: "USE_ACTIVE", cardInstanceId } })}
        onUseChampionAbility={handleUseChampionAbility}
        onCancelEffectTargeting={() => sendAction({ type: "CANCEL_EFFECT_TARGET" })}
        onEffectTarget={handleEffectTarget}
        onPresentationBusyChange={(busy) => {
          presentationBusyRef.current = busy;
          setPresentationBusy(busy);
        }}
        presentationPlayerId={me.id}
        playerNickname={selfPublicPlayer?.displayName}
        playerChampionName={selfPublicPlayer?.championName}
        opponentNickname={opponentPublicPlayer?.displayName}
        opponentChampionName={opponentPublicPlayer?.championName}
        onReturnToMainMenu={() => navigate(ROUTES.MAIN_MENU)}
      />
      {matchResultVisible && (
        <MatchResultOverlay state={state} reward={matchReward} onReturnToMainMenu={() => navigate(ROUTES.MAIN_MENU)} />
      )}
    </>
  );
}

function nextSeatForIntro(seat: "PLAYER_ONE" | "PLAYER_TWO" | null): "PLAYER_ONE" | "PLAYER_TWO" {
  return seat ?? "PLAYER_ONE";
}

export default function OnlineMatch() {
  return <OnlineAuthGate>{() => <OnlineMatchPage />}</OnlineAuthGate>;
}
