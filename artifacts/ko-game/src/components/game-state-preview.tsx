import React from 'react';
import { EntranceVolumeControl, SfxVolumeControl } from './sfx-volume-control';
import { CardRenderer } from './card-renderer';
import { CardArtwork } from './card-artwork';
import {
  getCardDefinition,
  getLegalActions,
  getAttackLegality,
  isCurrentPlayer,
  canUseChampionAbility,
  getPlayerSurvivalHealth,
  type BoardSlot as BoardSlotIndex,
  type CardInstance,
  type GameState,
  type GameMediaCatalog,
} from '@/game';
import { ActionHistory } from './action-history';
import {
  CardPlayAnimation,
} from './card-play-animation';
import { AttackAnimation } from './attack-animation';
import { CardLeaveAnimation, type CardLeaveAnimationState } from './card-leave-animation';
import { landingImpactLevel, rectSnapshot, type CardAnimationRect, type CardPlayAnimationState } from './card-play-animation-utils';
import type {
  AttackAnimationState,
  AttackDamageImpactLevel,
} from './attack-animation-utils';
import type { EnterFieldEvent } from '@/game/events/types';
import {
  attackDamageImpactLevel,
  attackImpactLevel,
  attackScreenShakeLevel,
  attackAnimationDuration,
} from './attack-animation-utils';
import {
  AltInspectProvider,
  CardInspectContent,
  ChampionAbilityInspectContent,
  ChampionQuestInspectContent,
  Inspectable,
} from './alt-inspector';
import { PresentationFeedback, type PresentationCue } from './presentation-feedback';
import { presentationCueDrafts, presentationEventKey } from './presentation-feedback-utils';
import { canMulligan } from '../game/engine/mulligan';
import { QuestPresentation } from './quest-presentation';
import { audioManager } from '../audio/audio-manager';
import { combatHitSound } from '../audio/combat-hit-sound';
import { MatchTutorial } from './match-tutorial';
import { prefersReducedMotion } from './presentation-config';
import { displayHealth } from './match-display-utils';
import { getCardRuntimeRulesText, getVisibleCardKeywords } from '../lib/card-display-state';
import { getActiveCardKeywords } from '../game/cards/granted-text';
import { CHAMPION_EMOTES, CHAMPION_EMOTE_LABELS, championVoiceLine, type ChampionEmote } from '../game/champions/types';

interface GameStatePreviewProps {
  state: GameState;
  mediaCatalog: GameMediaCatalog;
  selectedCardId: string | null;
  selectedAttackerId: string | null;
  playError: string | null;
  turnSecondsRemaining: number;
  onEndTurn: () => void;
  onMulligan?: (cardInstanceIds: string[]) => void;
  introActive?: boolean;
  guidedTutorial?: boolean;
  canEndTurn?: boolean;
  bgmMuted: boolean;
  onBgmMutedChange: (muted: boolean) => void;
  bgmVolume: number;
  onBgmVolumeChange: (volume: number) => void;
  onSurrender: () => void;
  onEmote?: (emote: ChampionEmote) => void;
  onSelectCard: (cardInstanceId: string) => void;
  onSelectSlot: (slot: BoardSlotIndex, geometry?: { source: CardAnimationRect; target: CardAnimationRect }) => void;
  onUseTechnique: (cardInstanceId: string, source: CardAnimationRect) => void;
  playAnimation: CardPlayAnimationState | null;
  onPlayAnimationComplete: () => void;
  attackAnimation: AttackAnimationState | null;
  attackImpactTriggered: boolean;
  onAttackImpact: () => void;
  onAttackAnimationComplete: () => void;
  onSelectAttacker: (cardInstanceId: string) => void;
  onAttackWrestler: (cardInstanceId: string, geometry?: AttackAnimationState["geometry"]) => void;
  onAttackPlayer: (geometry?: AttackAnimationState["geometry"]) => void;
  onOpponentAttackPresentation?: (animation: AttackAnimationState) => void;
  onSelfPlayPresentation?: (card: CardInstance, playerId: string) => void;
  onUseActive: (cardInstanceId: string) => void;
  onUseChampionAbility: () => void;
  onCancelEffectTargeting: () => void;
  onEffectTarget: (targetId: string) => void;
  onPresentationBusyChange: (busy: boolean) => void;
  presentationPlayerId?: string;
  playerNickname?: string | null;
  playerChampionName?: string | null;
  opponentNickname?: string | null;
  opponentChampionName?: string | null;
  onReturnToAdmin?: () => void;
  onReturnToMainMenu?: () => void;
}

export function GameStatePreview({
  state,
  mediaCatalog,
  selectedCardId,
  selectedAttackerId,
  playError,
  turnSecondsRemaining,
  onEndTurn,
  onMulligan,
  introActive = false,
  guidedTutorial = false,
  canEndTurn: canEndTurnOverride,
  bgmMuted,
  onBgmMutedChange,
  bgmVolume,
  onBgmVolumeChange,
  onSurrender,
  onEmote,
  onSelectCard,
  onSelectSlot,
  onUseTechnique,
  playAnimation,
  onPlayAnimationComplete,
  attackAnimation,
  attackImpactTriggered,
  onAttackImpact,
  onAttackAnimationComplete,
  onSelectAttacker,
  onAttackWrestler,
  onAttackPlayer,
  onOpponentAttackPresentation,
  onSelfPlayPresentation,
  onUseActive,
  onUseChampionAbility,
  onCancelEffectTargeting,
  onEffectTarget,
  onPresentationBusyChange,
  presentationPlayerId,
  playerNickname,
  playerChampionName,
  opponentNickname,
  opponentChampionName,
  onReturnToAdmin,
  onReturnToMainMenu,
}: GameStatePreviewProps) {
  const [openGraveyardPlayerId, setOpenGraveyardPlayerId] = React.useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [emoteOpen, setEmoteOpen] = React.useState(false);
  React.useEffect(() => {
    audioManager.preloadAttackSounds(['1-2', '3-5', '6-9', '10-plus'].map((tier) => `${import.meta.env.BASE_URL}sfx/combat-hit-${tier}.wav?v=1`).concat(`${import.meta.env.BASE_URL}sfx/combat-finisher.wav?v=1`));
  }, []);
  const [spokenLine, setSpokenLine] = React.useState<{ text: string; playerId: string; speaker: string; id: number } | null>(null);
  const spokenTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => () => { if (spokenTimerRef.current !== null) window.clearTimeout(spokenTimerRef.current); }, []);
  const [tutorialStep, setTutorialStep] = React.useState<number | null>(null);
  const [mulliganSelection, setMulliganSelection] = React.useState<string[]>([]);
  const [coachStage, setCoachStage] = React.useState(0);
  const [coachDismissed, setCoachDismissed] = React.useState(() => {
    try { return localStorage.getItem("ko-match-coach-v1") === "done"; } catch { return false; }
  });
  const [surrenderConfirming, setSurrenderConfirming] = React.useState(false);
  const [attackHint, setAttackHint] = React.useState<string | null>(null);
  const [confirmEndTurn, setConfirmEndTurn] = React.useState(false);
  const [hapticsEnabled, setHapticsEnabled] = React.useState(() => {
    try { return window.localStorage.getItem('ko-match-haptics') !== 'off'; } catch { return true; }
  });
  React.useEffect(() => { setConfirmEndTurn(false); }, [state.turn, state.activePlayerId]);
  React.useEffect(() => {
    const cancel = () => {
      if (tutorialStep !== null) setTutorialStep(null);
      else if (openGraveyardPlayerId) setOpenGraveyardPlayerId(null);
      else if (settingsOpen) { setSettingsOpen(false); setSurrenderConfirming(false); }
      else if (state.targetingState?.active) onCancelEffectTargeting();
      else if (selectedCardId) onSelectCard(selectedCardId);
      else if (selectedAttackerId) onSelectAttacker(selectedAttackerId);
    };
    const settings = () => { setSettingsOpen((open) => !open); setSurrenderConfirming(false); };
    window.addEventListener('ko-gamepad-cancel', cancel);
    window.addEventListener('ko-gamepad-settings', settings);
    return () => {
      window.removeEventListener('ko-gamepad-cancel', cancel);
      window.removeEventListener('ko-gamepad-settings', settings);
    };
  }, [tutorialStep, openGraveyardPlayerId, settingsOpen, state.targetingState?.active, selectedCardId, selectedAttackerId,
    onCancelEffectTargeting, onSelectCard, onSelectAttacker]);
  React.useEffect(() => {
    if (!guidedTutorial || coachDismissed) return;
    if (coachStage === 0 && state.events.some((event) => event.type === 'CARD_PLAYED' && event.playerId === state.players[0]?.id)) setCoachStage(1);
    if (coachStage === 1 && state.events.some((event) => event.type === 'ATTACK_DECLARED' && event.playerId === state.players[0]?.id)) setCoachStage(2);
    if (coachStage === 2 && state.events.some((event) => event.type === 'TURN_ENDED' && event.playerId === state.players[0]?.id)) setCoachStage(3);
    if (coachStage === 3 && state.events.some((event) => event.type === 'CHAMPION_QUEST_PROGRESS' && event.playerId === state.players[0]?.id)) setCoachStage(4);
  }, [state.events, state.players, guidedTutorial, coachDismissed, coachStage]);
  const handCardRefs = React.useRef(new Map<string, HTMLDivElement>());
  const playerHandRef = React.useRef<HTMLDivElement | null>(null);
  const playerDeckRef = React.useRef<HTMLDivElement | null>(null);
  const opponentDeckRef = React.useRef<HTMLDivElement | null>(null);
  const boardSlotRefs = React.useRef(new Map<number, HTMLDivElement>());
  const opponentBoardSlotRefs = React.useRef(new Map<number, HTMLDivElement>());
  const boardCardRefs = React.useRef(new Map<string, HTMLDivElement>());
  const opponentHandRef = React.useRef<HTMLDivElement | null>(null);
  const championRef = React.useRef<HTMLDivElement | null>(null);
  const playerChampionRef = React.useRef<HTMLDivElement | null>(null);
  const [generatedPlayAnimations, setGeneratedPlayAnimations] = React.useState<CardPlayAnimationState[]>([]);
  const [cardLeaveAnimations, setCardLeaveAnimations] = React.useState<CardLeaveAnimationState[]>([]);
  const [destroyBursts, setDestroyBursts] = React.useState<Array<{ id: string; left: number; top: number; width: number; height: number }>>([]);
  React.useEffect(() => {
    if (!destroyBursts.length) return;
    const timer = window.setTimeout(() => setDestroyBursts([]), 560);
    return () => window.clearTimeout(timer);
  }, [destroyBursts]);
  const [drawFlights, setDrawFlights] = React.useState<Array<{ id: string; fromX: number; fromY: number; toX: number; toY: number; opponent: boolean }>>([]);
  React.useEffect(() => {
    if (!drawFlights.length) return;
    const timer = window.setTimeout(() => setDrawFlights([]), 560);
    return () => window.clearTimeout(timer);
  }, [drawFlights]);
  const [presentationQueue, setPresentationQueue] = React.useState<PresentationCue[]>([]);
  const [screenShakeLevel, setScreenShakeLevel] = React.useState<AttackDamageImpactLevel>("NONE");
  const [pendingEffectFinisher, setPendingEffectFinisher] = React.useState(false);
  const [effectFinisher, setEffectFinisher] = React.useState(false);
  const screenShakeTimerRef = React.useRef<number | null>(null);
  const effectFinisherTimerRef = React.useRef<number | null>(null);
  const processedEventCountRef = React.useRef<number | null>(null);
  const processedEventKeysRef = React.useRef(new Set<string>());
  const lastCardPositionsRef = React.useRef(new Map<string, { left: number; top: number; width: number; height: number }>());
  const previousCardStatsRef = React.useRef(new Map<string, { attack: number; health: number }>());
  const previousCardsRef = React.useRef(new Map<string, CardInstance>());
  const handlePresentationQueueComplete = React.useCallback(() => {
    setPresentationQueue((current) => current.slice(1));
  }, []);

  React.useEffect(() => {
    onPresentationBusyChange(Boolean(
      playAnimation ||
      attackAnimation ||
      generatedPlayAnimations.length ||
      cardLeaveAnimations.length ||
      presentationQueue.length ||
      pendingEffectFinisher ||
      effectFinisher,
    ));
  }, [
    attackAnimation,
    cardLeaveAnimations.length,
    generatedPlayAnimations.length,
    onPresentationBusyChange,
    playAnimation,
    presentationQueue.length,
    pendingEffectFinisher,
    effectFinisher,
  ]);

  React.useEffect(() => {
    if (!pendingEffectFinisher || playAnimation || generatedPlayAnimations.length || attackAnimation) return;
    setPendingEffectFinisher(false);
    setEffectFinisher(true);
    audioManager.playAttack(combatHitSound(10, true)!, 92);
    if (effectFinisherTimerRef.current !== null) window.clearTimeout(effectFinisherTimerRef.current);
    effectFinisherTimerRef.current = window.setTimeout(() => {
      setEffectFinisher(false);
      effectFinisherTimerRef.current = null;
    }, prefersReducedMotion() ? 180 : 1050);
  }, [pendingEffectFinisher, playAnimation, generatedPlayAnimations.length, attackAnimation]);

  React.useEffect(() => () => {
    if (screenShakeTimerRef.current !== null) {
      window.clearTimeout(screenShakeTimerRef.current);
    }
    if (effectFinisherTimerRef.current !== null) window.clearTimeout(effectFinisherTimerRef.current);
  }, []);

  React.useEffect(() => {
    const currentCardStats = new Map<string, { attack: number; health: number }>();
    for (const player of state.players) {
      for (const card of [...player.hand, ...player.deck, ...player.graveyard, ...player.removedFromGame, ...player.board]) {
        if (card) currentCardStats.set(card.instanceId, {
          attack: card.currentAttack,
          health: card.currentHealth,
        });
      }
    }
    const eventLogReset = processedEventCountRef.current !== null &&
      state.events.length < processedEventCountRef.current;
    if (processedEventCountRef.current === null || eventLogReset) {
      processedEventCountRef.current = state.events.length;
      processedEventKeysRef.current = new Set(
        state.events.map((event, index) => presentationEventKey(event, index, state.events)),
      );
      previousCardStatsRef.current = currentCardStats;
      previousCardsRef.current = currentCards(state);
      if (eventLogReset) {
        setGeneratedPlayAnimations([]);
        setCardLeaveAnimations([]);
        setDestroyBursts([]);
        setDrawFlights([]);
        setPresentationQueue([]);
        setPendingEffectFinisher(false);
        setEffectFinisher(false);
      }
      return;
    }

    const eventKeys = state.events.map((event, index) =>
      presentationEventKey(event, index, state.events),
    );
    const newEventEntries = state.events
      .map((event, index) => ({ event, key: eventKeys[index]! }))
      .filter(({ key }) => !processedEventKeysRef.current.has(key));
    const newEvents = newEventEntries.map(({ event }) => event);
    const flights = newEventEntries.flatMap(({ event, key }) => {
      if (event.type !== 'CARD_DRAWN' || !event.playerId) return [];
      const opponent = event.playerId !== state.players[0]?.id;
      const from = (opponent ? opponentDeckRef : playerDeckRef).current?.getBoundingClientRect();
      const to = (opponent ? opponentHandRef : playerHandRef).current?.getBoundingClientRect();
      return [{ id: key, fromX: from ? from.left + from.width / 2 : window.innerWidth * .9,
        fromY: from ? from.top + from.height / 2 : window.innerHeight * .45,
        toX: to ? to.left + to.width / 2 : window.innerWidth * .4,
        toY: to ? to.top + to.height / 2 : opponent ? window.innerHeight * .1 : window.innerHeight * .85,
        opponent }];
    });
    if (flights.length) setDrawFlights(flights);
    for (const event of newEvents) {
      let line: string | null = null;
      let speaker = state.players.find((player) => player.id === event.playerId)?.champion?.name ?? '챔피언';
      if (event.type === 'CHAMPION_EMOTE' && event.playerId) {
        const owner = state.players.find((player) => player.id === event.playerId);
        const emote = event.reason as ChampionEmote;
        if (CHAMPION_EMOTES.includes(emote)) {
          line = championVoiceLine(owner?.champion?.presentationLines, event.tags?.includes('AFTER_QUEST') ?? false, emote) ?? CHAMPION_EMOTE_LABELS[emote];
        }
      }
      if (event.type === 'ENTER_FIELD' && event.cardInstanceId) {
        const definition = state.cardPool?.find((card) => card.id === (currentCards(state).get(event.cardInstanceId!)?.definitionId));
        line = definition?.summonLine ?? null;
        speaker = definition?.name ?? speaker;
      }
      if (line && event.playerId) {
        setSpokenLine({ text: line, playerId: event.playerId, speaker, id: Date.now() });
        if (spokenTimerRef.current !== null) window.clearTimeout(spokenTimerRef.current);
        spokenTimerRef.current = window.setTimeout(() => setSpokenLine(null), 2600);
      }
    }
    const newEventKeys = newEventEntries.map(({ key }) => key);
    if (state.status === "FINISHED" && state.loserId &&
      !newEvents.some((event) => event.type === "ATTACK_DECLARED") &&
      newEvents.some((event) => event.type === "DAMAGE_DEALT" && (event.amount ?? 0) > 0 &&
        event.target?.type === "PLAYER" && event.target.playerId === state.loserId && event.reason !== "FATIGUE")) {
      setPendingEffectFinisher(true);
    }
    for (const key of eventKeys) processedEventKeysRef.current.add(key);
    processedEventCountRef.current = state.events.length;
    const previousCardStats = previousCardStatsRef.current;
    const previousCards = previousCardsRef.current;
    previousCardStatsRef.current = currentCardStats;
    previousCardsRef.current = currentCards(state);

    const largestDamage = newEvents.reduce(
      (largest, event) => event.type === "DAMAGE_DEALT"
        ? Math.max(largest, event.amount ?? 0)
        : largest,
      0,
    );
    if (hapticsEnabled && typeof navigator.vibrate === 'function' &&
        window.matchMedia?.('(pointer: coarse)').matches && !prefersReducedMotion()) {
      if (newEvents.some((event) => event.type === 'CHAMPION_QUEST_COMPLETED')) navigator.vibrate([28, 40, 58]);
      else if (largestDamage >= 6) navigator.vibrate(largestDamage >= 10 ? [36, 28, 55] : 35);
      else if (newEvents.some((event) => event.type === 'ENTER_FIELD')) navigator.vibrate(12);
    }
    if (largestDamage > 0 && !newEvents.some((event) => event.type === "ATTACK_DECLARED")) {
      if (state.status !== 'FINISHED') {
        const hitSound = combatHitSound(largestDamage);
        if (hitSound) audioManager.playAttack(hitSound, 86);
      }
      setScreenShakeLevel(attackDamageImpactLevel(largestDamage));
      if (screenShakeTimerRef.current !== null) {
        window.clearTimeout(screenShakeTimerRef.current);
      }
      screenShakeTimerRef.current = window.setTimeout(() => {
        setScreenShakeLevel("NONE");
        screenShakeTimerRef.current = null;
      }, 220);
    }
    const animations: CardPlayAnimationState[] = [];
    const leaveAnimations: CardLeaveAnimationState[] = [];
    const savedRect = (cardInstanceId: string) => {
      const element = boardCardRefs.current.get(cardInstanceId);
      if (element) return rectSnapshot(element.getBoundingClientRect());
      const previous = lastCardPositionsRef.current.get(cardInstanceId);
      return previous;
    };

    for (const [eventIndex, event] of newEvents.entries()) {
      if (
        event.type === "ATTACK_DECLARED" &&
        event.playerId === state.players[1]?.id &&
        event.cardInstanceId &&
        onOpponentAttackPresentation
      ) {
        const attacker = previousCards.get(event.cardInstanceId);
        const source = savedRect(event.cardInstanceId);
        const targetId = event.target?.type === "CARD" ? event.target.cardInstanceId : undefined;
        const targetPlayerId = event.target?.type === "PLAYER" ? event.target.playerId : undefined;
        const target = targetId ? previousCards.get(targetId) ?? null : null;
        const targetRect = targetId
          ? savedRect(targetId)
          : targetPlayerId === me.id
            ? playerChampionRef.current
              ? rectSnapshot(playerChampionRef.current.getBoundingClientRect())
              : undefined
            : targetPlayerId === opp.id && championRef.current
              ? rectSnapshot(championRef.current.getBoundingClientRect())
              : undefined;
        const damageEvent = newEvents.slice(eventIndex + 1).find((candidate) =>
          candidate.type === "DAMAGE_DEALT" &&
          candidate.source?.type === "CARD" &&
          candidate.source.cardInstanceId === event.cardInstanceId &&
          (targetId
            ? candidate.target?.type === "CARD" && candidate.target.cardInstanceId === targetId
            : candidate.target?.type === "PLAYER" && candidate.target.playerId === state.players[0]?.id),
        );
        if (attacker && source && targetRect) {
          const currentAttack = event.sourceSnapshot?.currentAttack ?? attacker.currentAttack;
          const damage = damageEvent?.amount ?? 0;
          onOpponentAttackPresentation({
            attacker,
            target,
            targetKind: targetId ? "CARD" : "CHAMPION",
            geometry: { source, target: targetRect },
            currentAttack,
            impactLevel: attackImpactLevel(currentAttack),
            damage,
            damageImpactLevel: attackDamageImpactLevel(damage),
            finishingBlow: state.status === "FINISHED" &&
              targetPlayerId !== undefined && state.loserId === targetPlayerId && damage > 0,
            soundKey: `opponent:${state.events.length}:${event.cardInstanceId}:${targetId ?? state.players[0]?.id}`,
          });
        }
      }
      if (
        (event.type === "CARD_RETIRED" || event.type === "CARD_DESTROYED" || event.type === "CARD_REMOVED") &&
        event.cardInstanceId
      ) {
        const card = previousCards.get(event.cardInstanceId);
        const geometry = lastCardPositionsRef.current.get(event.cardInstanceId);
        if (card && geometry) {
          const precedingDamage = newEvents.some(
            (candidate) =>
              candidate.type === "DAMAGE_DEALT" &&
              candidate.target?.type === "CARD" &&
              candidate.target.cardInstanceId === event.cardInstanceId &&
              newEvents.indexOf(candidate) < newEvents.indexOf(event),
          );
          leaveAnimations.push({
            id: `leave:${state.events.length}:${event.cardInstanceId}:${event.type}`,
            card,
            kind: event.type === "CARD_RETIRED" ? "RETIRE" : event.type === "CARD_DESTROYED" ? "DESTROY" : "REMOVE",
            geometry,
            delay: precedingDamage ? 220 : 0,
          });
        } else if (event.type === 'CARD_DESTROYED' && event.boardSlot !== undefined) {
          // A card may enter and be destroyed in the same server update, so it
          // never appears in the previous rendered snapshot.
          const slot = (event.playerId === state.players[0]?.id ? boardSlotRefs : opponentBoardSlotRefs).current.get(event.boardSlot);
          if (slot) {
            const rect = slot.getBoundingClientRect();
            setDestroyBursts((current) => [...current, { id: `${state.events.length}:${event.cardInstanceId}`, left: rect.left,
              top: rect.top, width: rect.width, height: rect.height }]);
          }
        }
      }
      if (event.type === "CARD_PLAYED" && event.cardType === "TECHNIQUE" && event.cardInstanceId) {
        // The opponent's hand is deliberately projected as card backs. Once a
        // Technique is played its public instance is in the graveyard, so use
        // the current snapshot as the presentation source when the previous
        // snapshot could not contain the hidden card identity.
        const technique = previousCards.get(event.cardInstanceId) ?? currentCards(state).get(event.cardInstanceId);
        if (technique) {
          const sourceElement = event.playerId === me.id
            ? handCardRefs.current.get(event.cardInstanceId)
            : opponentHandRef.current;
          const source = sourceElement
            ? rectSnapshot(sourceElement.getBoundingClientRect())
            : { left: window.innerWidth / 2 - 90, top: window.innerHeight * 0.42 - 135, width: 180, height: 270 };
          animations.push({
            kind: "TECHNIQUE",
            card: technique,
            playerId: event.playerId,
            geometry: { source },
          });
        }
      }
      if (event.type !== 'ENTER_FIELD' || !event.source || event.source.type !== 'CARD' || event.boardSlot === undefined) continue;
      const enterFieldEvent = event as EnterFieldEvent;
      const enteredCard = state.players
        .flatMap((player) => player.board)
        .find((card): card is CardInstance => card?.instanceId === event.cardInstanceId);
      if (
        enteredCard &&
        onSelfPlayPresentation &&
        event.playerId === me.id &&
        enterFieldEvent.entryCause === "PLAY_FROM_HAND"
      ) {
        onSelfPlayPresentation(enteredCard, me.id);
      }
      const shouldAnimateOpponentPlay =
        event.playerId === opp.id &&
        enterFieldEvent.entryCause === "PLAY_FROM_HAND";
      if (!enteredCard || (!enteredCard.isGenerated && !shouldAnimateOpponentPlay)) continue;

      const targetElement = event.playerId === me.id
        ? boardSlotRefs.current.get(event.boardSlot)
        : opponentBoardSlotRefs.current.get(event.boardSlot);
      if (!targetElement) continue;
      const target = rectSnapshot(targetElement.getBoundingClientRect());
      const ownerHandElement = event.playerId === me.id && event.cardInstanceId
        ? handCardRefs.current.get(event.cardInstanceId)
        : opponentHandRef.current;
      const sourceElement =
        boardCardRefs.current.get(event.source.cardInstanceId) ??
        ownerHandElement;
      const source = sourceElement
        ? rectSnapshot(sourceElement.getBoundingClientRect())
        : {
            left: target.left,
            top: target.top - target.height * 1.35,
            width: target.width,
            height: target.height,
          };

      animations.push({
        kind: 'WRESTLER',
        card: enteredCard,
        playerId: event.playerId,
        geometry: { source, target },
        impactLevel: landingImpactLevel(enteredCard.baseCost, enteredCard.currentCost),
      });
    }

    if (animations.length) {
      setGeneratedPlayAnimations((current) => [...current, ...animations]);
    }
    if (leaveAnimations.length) {
      setCardLeaveAnimations((current) => [
        ...current.filter((entry) => !leaveAnimations.some((next) => next.id === entry.id)),
        ...leaveAnimations,
      ]);
    }
    const cues = presentationCueDrafts(newEvents, 0, newEventKeys, presentationPlayerId).map((draft) => {
      const source = draft.sourceCardInstanceId
        ? boardCardRefs.current.get(draft.sourceCardInstanceId) ?? handCardRefs.current.get(draft.sourceCardInstanceId)
        : null;
      const rect = source?.getBoundingClientRect();
      const before = draft.kind === 'TRANSFORM' && draft.cardInstanceId
        ? previousCards.get(draft.cardInstanceId) : undefined;
      const after = draft.kind === 'TRANSFORM' && draft.cardInstanceId
        ? currentCards(state).get(draft.cardInstanceId) : undefined;
      const artwork = (card?: CardInstance) => card &&
        (state.cardPool?.find((entry) => entry.id === card.definitionId) ?? getCardDefinition(card.definitionId))?.imageUrl;
      return {
        ...draft,
        label: draft.kind === "QUEST_PROGRESS" ? '퀘스트 진행' : draft.label,
        ...cuePosition(draft),
        ...(rect?.width && rect.height ? { sourceLeft: rect.left + rect.width / 2, sourceTop: rect.top + rect.height / 2 } : {}),
        ...(before && after && before.definitionId !== after.definitionId
          ? { previousArtwork: artwork(before) ?? undefined, nextArtwork: artwork(after) ?? undefined } : {}),
      };
    });
    const hasDamageEvent = newEvents.some((event) =>
      event.type === "DAMAGE_DEALT" ||
      event.type === "CARD_RETIRED" ||
      event.type === "CARD_DESTROYED" ||
      event.type === "CARD_REMOVED",
    );
    if (!hasDamageEvent && !newEvents.some((event) => event.type === 'STAT_CHANGED')) {
      for (const [cardInstanceId, current] of currentCardStats) {
        const previous = previousCardStats.get(cardInstanceId);
        if (!previous) continue;
        const attackDelta = current.attack - previous.attack;
        const healthDelta = current.health - previous.health;
        if (attackDelta === 0 && healthDelta === 0) continue;
        const positive = attackDelta > 0 || healthDelta > 0;
        const kind = positive
          ? healthDelta > 0 && attackDelta <= 0 ? "HEAL" as const : "BUFF" as const
          : "DEBUFF" as const;
        const parts = [
          attackDelta ? `${attackDelta > 0 ? "+" : ""}${attackDelta} ATK` : "",
          healthDelta ? `${healthDelta > 0 ? "+" : ""}${healthDelta} HP` : "",
        ].filter(Boolean);
        const draft = {
          id: `stats:${state.events.length}:${cardInstanceId}`,
          kind,
          label: parts.join(" · "),
          value: Math.abs(attackDelta) + Math.abs(healthDelta),
          cardInstanceId,
          duration: 320,
        };
        cues.push({ ...draft, ...cuePosition(draft) });
      }
    }
    if (cues.length) {
      setPresentationQueue((current) => {
        const existingIds = new Set(current.map((cue) => cue.id));
        const freshCues = cues.filter((cue) => !existingIds.has(cue.id));
        return freshCues.length ? [...current.slice(-18), ...freshCues] : current;
      });
    }
  }, [onOpponentAttackPresentation, onSelfPlayPresentation, state.events, state.players]);

  if (!state || !state.players || state.players.length < 2) {
    return <div className="flex h-screen items-center justify-center bg-black font-sans text-white">게임을 초기화하는 중입니다...</div>;
  }

  const me = state.players[0];
  const opp = state.players[1];
  const effectTargeting = state.targetingState?.active;
  const validEffectTargetIds = new Set(state.targetingState?.validTargetIds ?? []);
  const selectedEffectTargetIds = new Set(state.targetingState?.selectedTargetIds ?? []);
  
  const isMyTurn = state.activePlayerId === me.id;
  const selectedHandCard = me.hand.find((card) => card.instanceId === selectedCardId);
  const attackerSelectionActive = isMyTurn && !selectedHandCard && !effectTargeting;
    
  const canEndTurn = canEndTurnOverride ?? (
    isCurrentPlayer(state, me.id) && !effectTargeting
  );
  const legalActions = getLegalActions(state, me.id);
  const remainingActions = legalActions.filter((action) => ['ATTACK', 'USE_ACTIVE', 'USE_CHAMPION_ABILITY'].includes(action.type));
  const selectedAttacker = selectedAttackerId
    ? me.board.find((card) => card?.instanceId === selectedAttackerId)
    : null;
  const legalAttackTargets = new Set(legalActions.flatMap((action) =>
    action.type === 'ATTACK' && action.attackerInstanceId === selectedAttackerId
      ? [action.target.type === 'PLAYER' ? action.target.playerId : action.target.cardInstanceId]
      : [],
  ));
  const attackBaseDamage = selectedAttacker ? Math.max(0, selectedAttacker.currentAttack) : 0;
  const legalActiveCardIds = new Set(
    legalActions
      .filter((action) => action.type === 'USE_ACTIVE')
      .map((action) => action.cardInstanceId),
  );
  const canUseChampion = canUseChampionAbility(state, me.id);
  const mySurvivalHealth = getPlayerSurvivalHealth(state, me.id);
  const opponentSurvivalHealth = getPlayerSurvivalHealth(state, opp.id);
  const myMaxGold = Math.min(Math.max(me.personalTurn, 1), 6);
  const opponentMaxGold = Math.min(Math.max(opp.personalTurn, 1), 6);
  const opponentChampionProtected = opp.board.some((card) => card?.isChampionToken);
  const playerChampionProtected = me.board.some((card) => card?.isChampionToken);
  const activePresentationCue = presentationQueue[0];
  const activePresentationCardId = activePresentationCue?.cardInstanceId;
  const activePresentationChampionId = activePresentationCue?.championId;
  const championUnavailableReason = !isMyTurn
    ? '내 턴에만 사용할 수 있습니다.'
    : me.championAbilityUsedThisTurn
      ? '이번 턴에는 이미 사용했습니다.'
    : me.champion && me.currentGold < me.champion.abilityCost
      ? '현재 골드가 부족합니다.'
      : '현재 사용할 수 없습니다.';
  const selectedBackground = mediaCatalog.backgrounds.find(
    (item) => item.id === state.backgroundId,
  );
  const opponentChampionPortrait = opp.champion?.questCompleted &&
    opp.champion.questCompletedPortraitEnabled &&
    opp.champion.questCompletedPortraitUrl
    ? opp.champion.questCompletedPortraitUrl
    : opp.champion?.imageUrl;
  const playerChampionPortrait = me.champion?.questCompleted &&
    me.champion.questCompletedPortraitEnabled &&
    me.champion.questCompletedPortraitUrl
    ? me.champion.questCompletedPortraitUrl
    : me.champion?.imageUrl;

  function closeSettings() {
    setSettingsOpen(false);
    setSurrenderConfirming(false);
  }

  function setHandCardRef(cardId: string, element: HTMLDivElement | null) {
    if (element) handCardRefs.current.set(cardId, element);
    else handCardRefs.current.delete(cardId);
  }

  function setBoardSlotRef(slot: number, element: HTMLDivElement | null) {
    if (element) boardSlotRefs.current.set(slot, element);
    else boardSlotRefs.current.delete(slot);
  }

  function setOpponentBoardSlotRef(slot: number, element: HTMLDivElement | null) {
    if (element) opponentBoardSlotRefs.current.set(slot, element);
    else opponentBoardSlotRefs.current.delete(slot);
  }

  function setBoardCardRef(cardId: string, element: HTMLDivElement | null) {
    if (element) {
      boardCardRefs.current.set(cardId, element);
      const rect = element.getBoundingClientRect();
      lastCardPositionsRef.current.set(cardId, {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    } else boardCardRefs.current.delete(cardId);
  }

  function cuePosition(cue: { kind: string; cardInstanceId?: string; playerId?: string; championId?: string }) {
    const cardElement = cue.cardInstanceId
      ? boardCardRefs.current.get(cue.cardInstanceId) ?? handCardRefs.current.get(cue.cardInstanceId)
      : undefined;
    if (cardElement) {
      const rect = cardElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return { left: rect.left + rect.width / 2, top: rect.top + rect.height * 0.35 };
      }
    }
    if (cue.cardInstanceId) {
      const rect = lastCardPositionsRef.current.get(cue.cardInstanceId);
      if (rect) return { left: rect.left + rect.width / 2, top: rect.top + rect.height * 0.35 };
    }
    if (cue.playerId === me.id) {
      const rect = playerChampionRef.current?.getBoundingClientRect();
      if (rect) return { left: rect.left + rect.width / 2, top: rect.top + rect.height * 0.35 };
    }
    if (cue.playerId === opp.id || cue.championId === opp.champion?.id) {
      const rect = championRef.current?.getBoundingClientRect();
      if (rect) return { left: rect.left + rect.width / 2, top: rect.top + rect.height * 0.35 };
    }
    if (cue.kind === "QUEST_COMPLETE") {
      return { left: window.innerWidth / 2, top: window.innerHeight / 2 };
    }
    return { left: window.innerWidth / 2, top: window.innerHeight * 0.42 };
  }

  function currentCards(nextState: GameState) {
    const cards = new Map<string, CardInstance>();
    for (const player of nextState.players) {
      for (const card of [
        ...player.hand,
        ...player.deck,
        ...player.graveyard,
        ...player.removedFromGame,
        ...player.board,
      ]) {
        if (card) cards.set(card.instanceId, card);
      }
    }
    return cards;
  }

  function attackGeometry(targetElement: HTMLDivElement | null) {
    const attackerElement = selectedAttackerId
      ? boardCardRefs.current.get(selectedAttackerId)
      : undefined;
    if (!attackerElement || !targetElement) return undefined;
    return {
      source: rectSnapshot(attackerElement.getBoundingClientRect()),
      target: rectSnapshot(targetElement.getBoundingClientRect()),
    };
  }

  function handleAttackCardTarget(cardId: string) {
    if (effectTargeting) {
      onEffectTarget(cardId);
      return;
    }
    if (!selectedAttackerId) return;
    if (!legalAttackTargets.has(cardId)) {
      setAttackHint('이 대상은 공격할 수 없습니다. 강조된 대상을 선택하세요.');
      return;
    }
    setAttackHint(null);
    onAttackWrestler(cardId, attackGeometry(boardCardRefs.current.get(cardId) ?? null));
  }

  function handleAttackChampion() {
    if (effectTargeting) {
      onEffectTarget(opp.id);
      return;
    }
    if (!selectedAttackerId) return;
    if (!legalAttackTargets.has(opp.id)) {
      setAttackHint(opponentChampionProtected ? '챔피언 토큰이 보호하는 동안 본체를 공격할 수 없습니다.' : '이 대상은 공격할 수 없습니다. 강조된 대상을 선택하세요.');
      return;
    }
    setAttackHint(null);
    onAttackPlayer(attackGeometry(championRef.current));
  }

  function handlePlaySlot(slot: BoardSlotIndex) {
    if (!selectedCardId) {
      onSelectSlot(slot);
      return;
    }
    const sourceElement = handCardRefs.current.get(selectedCardId);
    const targetElement = boardSlotRefs.current.get(slot);
    const source = sourceElement ? rectSnapshot(sourceElement.getBoundingClientRect()) : undefined;
    const target = targetElement ? rectSnapshot(targetElement.getBoundingClientRect()) : undefined;
    onSelectSlot(
      slot,
      source && target ? { source, target } : undefined,
    );
  }

  function handleUseTechnique(cardInstanceId: string) {
    const sourceElement = handCardRefs.current.get(cardInstanceId);
    if (!sourceElement) return;
    onUseTechnique(cardInstanceId, rectSnapshot(sourceElement.getBoundingClientRect()));
  }
  
  return (
    <AltInspectProvider>
     <div className={`ko-game-shell flex min-h-[100dvh] w-full flex-col overflow-x-hidden overflow-y-auto bg-neutral-950 font-sans text-neutral-100 selection:bg-primary selection:text-black md:overflow-hidden ${me.champion?.questCompleted ? 'ko-quest-awakened--mine' : ''} ${opp.champion?.questCompleted ? 'ko-quest-awakened--theirs' : ''}`}>
      <ActionHistory state={state} viewerPlayerId={presentationPlayerId ?? me.id} />
      
      {/* Background Ambience */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-neutral-950">
        {selectedBackground && (
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url("${selectedBackground.assetUrl}")` }}
          />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(26,26,36,0.08)_0%,_rgba(5,5,5,0.18)_100%)]" />
      </div>

      <div className={`ko-game-stage relative mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-1 flex-col justify-between pb-0 pt-2 md:h-[100dvh] md:min-h-0 md:pt-4 ${
        attackAnimation?.finishingBlow
          ? "attack-finisher-zoom"
          : effectFinisher
            ? "effect-finisher-zoom"
          : attackImpactTriggered && attackAnimation && attackAnimation.damage > 0
            ? `attack-screen-shake--${attackScreenShakeLevel(attackAnimation.currentAttack, attackAnimation.damage).toLowerCase()}`
          : screenShakeLevel !== "NONE"
            ? `attack-screen-shake--${screenShakeLevel.toLowerCase()}`
            : playAnimation?.kind === "WRESTLER"
              ? getCardDefinition(playAnimation.card.definitionId)?.rarity === 'LEGENDARY'
                ? 'card-landing-shake--legendary'
                : `card-landing-shake--${playAnimation.impactLevel.toLowerCase()}`
            : ""
      }`} style={attackAnimation?.finishingBlow ? {
        "--finisher-duration": `${attackAnimationDuration(attackAnimation.currentAttack) + 350}ms`,
        transformOrigin: `${Math.max(0, attackAnimation.geometry.target.left + attackAnimation.geometry.target.width / 2 - Math.max(0, (window.innerWidth - 1024) / 2))}px ${attackAnimation.geometry.target.top + attackAnimation.geometry.target.height / 2}px`,
      } as React.CSSProperties : {
        '--shake-direction': attackAnimation?.geometry
          ? Math.sign(attackAnimation.geometry.target.left - attackAnimation.geometry.source.left) || 1
          : 1,
      } as React.CSSProperties}>
         
         {/* TOP BAR: Opponent Info */}
         <div className="ko-opponent-header relative z-[90] h-24 shrink-0 px-2 md:h-32 md:px-4">
            {/* Opponent Hand: centered like the player's hand */}
              <div
                ref={opponentHandRef}
                className="ko-opponent-hand absolute left-1/2 top-0 z-[100] flex -translate-x-1/2 items-start -space-x-2 md:-space-x-4"
              >
               {opp.hand.length === 0 ? (
                 <span className="text-xs font-bold text-neutral-600">손패 없음</span>
               ) : (
                 opp.hand.map((_, i) => (
                   <div key={`opp-hand-${i}`} className="relative flex h-14 w-10 rotate-2 transform items-center justify-center overflow-hidden rounded-sm border-2 border-neutral-600 bg-neutral-800 shadow-md transition-transform hover:-translate-y-1 hover:rotate-0 md:h-20 md:w-14">
                     <div className="absolute inset-1 border border-neutral-700/50"></div>
                     <div className="h-6 w-6 rotate-45 border border-neutral-700/50 md:h-8 md:w-8"></div>
                   </div>
                 ))
               )}
            </div>

            {/* Mirrored opponent HUD */}
            <div className="ko-opponent-hud ml-auto flex w-[180px] flex-col items-end gap-1 md:w-48 md:gap-2">
                  <span className="max-w-full truncate text-[11px] font-black text-white md:text-sm" data-testid="text-online-opponent-nickname">
                   {opponentNickname || "상대"}
                 </span>
                <div className="flex items-start gap-2 md:gap-3">
                 <div
                    ref={championRef}
                    className={`ko-opponent-champion group relative flex h-28 w-20 flex-col items-center justify-center rounded-sm border-2 bg-neutral-900 md:h-40 md:w-28 ${
                      attackImpactTriggered &&
                      attackAnimation?.targetKind === "CHAMPION" &&
                      attackAnimation.damage > 0
                        ? `attack-target-hit--${attackAnimation.damageImpactLevel.toLowerCase()}`
                        : ""
                    } ${
                       (effectTargeting && validEffectTargetIds.has(opp.id)) || (selectedAttackerId && legalAttackTargets.has(opp.id))
                        ? 'cursor-crosshair border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                        : 'border-red-900'
                     } ${opp.champion?.questCompleted ? 'ko-quest-awakened-portrait ko-quest-awakened-portrait--enemy' : ''} ${activePresentationChampionId === opp.champion?.id || activePresentationCue?.playerId === opp.id ? 'presentation-card-pulse' : ''}`}
                       role="button"
                       tabIndex={0}
                       aria-label="상대 챔피언 대상"
                       onClick={effectTargeting
                         ? handleAttackChampion
                         : selectedAttackerId ? handleAttackChampion : undefined}
                       onKeyDown={(event) => {
                         if (event.key !== 'Enter' && event.key !== ' ') return;
                         event.preventDefault();
                         handleAttackChampion();
                       }}
                 >
                   {opponentChampionPortrait && (
                     <CardArtwork
                       src={opponentChampionPortrait}
                       alt=""
                       className="absolute inset-0 h-full w-full"
                       imageDisplayMode={opp.champion?.imageDisplayMode}
                       imageScale={opp.champion?.imageScale}
                       imagePositionX={opp.champion?.imagePositionX}
                       imagePositionY={opp.champion?.imagePositionY}
                     />
                   )}
                   <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                   {opponentChampionProtected && (
                     <span className="pointer-events-none absolute bottom-1 left-1/2 z-20 -translate-x-1/2 rounded border border-cyan-300/70 bg-cyan-950/90 px-1.5 py-0.5 text-[7px] font-black text-cyan-200 md:text-[9px]">
                       PROTECTED
                     </span>
                   )}
                  <span className="px-1 text-center text-[9px] font-black leading-tight text-red-300 md:text-[11px]">
                     {opponentChampionName || opp.champion?.name || '상대 챔피언'}
                  </span>
                  {selectedAttackerId && (
                    <div className="pointer-events-none absolute inset-0 z-10 bg-red-500/15" />
                  )}
                  {selectedAttackerId && legalAttackTargets.has(opp.id) && (
                    <span className="pointer-events-none absolute -bottom-4 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-red-950 px-1.5 py-0.5 text-[8px] font-bold text-white">기본 피해 {attackBaseDamage}</span>
                  )}
                </div>
                <div className="ko-opponent-stats flex w-[76px] shrink-0 flex-col items-start gap-1">
                  <div className="w-full rounded border border-neutral-700 bg-neutral-900/80 px-2 py-1 text-right md:px-3">
                    <div className="text-[8px] font-bold text-neutral-500 md:text-[10px]">골드</div>
                    <div className="font-display text-sm font-black text-primary md:text-xl">
                      <span key={opp.currentGold} className="presentation-stat-change">{opp.currentGold}</span> / {opponentMaxGold}
                    </div>
                  </div>
                  <div className="w-full rounded border border-red-800 bg-red-950/80 px-2 py-1 text-right">
                    <div className="text-[7px] font-bold text-red-300 md:text-[9px]">챔피언 체력</div>
                    <div className="font-display text-sm font-black text-white md:text-lg">
                      <span key={opponentSurvivalHealth} className="presentation-stat-change">{displayHealth(opponentSurvivalHealth)}</span> / {opp.champion?.maxHealth ?? 20}
                    </div>
                  </div>
                </div>
              </div>
              {opp.champion?.quest && (
                <Inspectable
                  content={<ChampionQuestInspectContent champion={opp.champion} />}
                  className="ko-opponent-quest"
                >
                  <div tabIndex={0} className={`rounded border px-2 py-1 text-[8px] font-bold md:text-[10px] ${opp.champion.questCompleted ? 'border-rose-400 bg-rose-950/90 text-rose-100' : 'border-purple-900 bg-purple-950/70 text-purple-200'}`}>
                    퀘스트 {opp.champion.questCompleted ? '완료' : `${opp.champion.questProgress}/${opp.champion.quest.requiredProgress}`}
                    {!opp.champion.questCompleted && opp.champion.questProgress === opp.champion.quest.requiredProgress - 1 && <span className="ml-1 text-amber-300">· 달성 임박</span>}
                  </div>
                </Inspectable>
              )}
            </div>
         </div>

         {/* BOARDS AREA */}
          <div className="ko-board-area relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-2 md:gap-6 md:py-4">
            {effectTargeting && <div role="status" className="pointer-events-none absolute left-1/2 top-0 z-[115] max-w-[74vw] -translate-x-1/2 rounded border border-amber-400/70 bg-black/90 px-3 py-1 text-center text-[11px] font-bold text-amber-100 shadow-lg md:text-sm">
              {state.targetingState?.pendingAction?.type === 'USE_CHAMPION_ABILITY' ? me.champion?.name : state.cardPool?.find((card) => card.id === state.targetingState?.sourceCard?.definitionId)?.name ?? getCardDefinition(state.targetingState?.sourceCard?.definitionId ?? '')?.name ?? '선수'} 효과의 대상을 선택하세요
            </div>}
            
             {/* Opponent Board + Zones */}
              <div className="ko-opponent-board-row flex w-full items-center justify-center gap-2 md:gap-4">
                 <div className="ko-board-cards flex gap-2 md:gap-4">
               {opp.board.map((card, i) => (
                 <BoardSlot 
                   key={`opp-board-${i}`}
                   card={card}
                   isOpponent={true}
                   slotIndex={i as BoardSlotIndex}
                   selectable={false}
                   selected={false}
                   attackReady={!!card && !!selectedAttackerId && legalAttackTargets.has(card.instanceId)}
                    attackSelectionActive={!!selectedAttackerId && !effectTargeting}
                    attackReason={undefined}
                    targetingActive={!!effectTargeting}
                    presentationActive={activePresentationCardId === card?.instanceId || (!!effectTargeting && state.targetingState?.sourceInstanceId === card?.instanceId)}
                     targetable={!!card && (effectTargeting ? validEffectTargetIds.has(card.instanceId) : !!selectedAttackerId && legalAttackTargets.has(card.instanceId))}
                    attackPreview={!!card && !!selectedAttackerId && !effectTargeting && legalAttackTargets.has(card.instanceId)
                      ? `피해 ${attackBaseDamage} · ${card.dodgeAvailable || (card.dodgeCharges ?? 0) > 0 ? '회피 가능' : card.currentHealth <= attackBaseDamage ? '리타이어' : `잔여 ${card.currentHealth - attackBaseDamage}`} · 반격 ${Math.max(0, card.currentAttack)}`
                      : undefined}
                    activeReady={false}
                    activeUsable={false}
                    onUseActive={() => undefined}
                      slotRef={(element) => setOpponentBoardSlotRef(i, element)}
                     cardRef={card ? (element) => setBoardCardRef(card.instanceId, element) : undefined}
                     hit={Boolean(
                       attackImpactTriggered &&
                       attackAnimation && attackAnimation.damage > 0 &&
                       attackAnimation?.targetKind === "CARD" &&
                       attackAnimation.target?.instanceId === card?.instanceId,
                     )}
                      animating={
                        playAnimation?.card.instanceId === card?.instanceId ||
                        generatedPlayAnimations.some((animation) => animation.card.instanceId === card?.instanceId) ||
                        attackAnimation?.attacker.instanceId === card?.instanceId ||
                        attackAnimation?.target?.instanceId === card?.instanceId
                      }
                     hitImpactLevel={attackAnimation?.damageImpactLevel}
                     onClick={(id) => handleAttackCardTarget(id as string)}
                 />
               ))}
                </div>
                  <ZoneStack
                    className="ko-opponent-zones"
                   deckRef={opponentDeckRef}
                   deckCount={opp.deck.length}
                   graveyardCount={opp.graveyard.length}
                   isOpponent
                   onGraveyardClick={() => setOpenGraveyardPlayerId(opp.id)}
                 />
            </div>

             {/* My Board + Zones */}
              <div className="ko-player-board-row flex w-full items-center justify-center gap-2 md:gap-4">
                 <div className="ko-board-cards flex gap-2 md:gap-4">
               {me.board.map((card, i) => (
                 <BoardSlot 
                   key={`me-board-${i}`}
                   card={card}
                   isOpponent={false}
                   slotIndex={i as BoardSlotIndex}
                    selectable={!!selectedHandCard && selectedHandCard.cardType !== "TECHNIQUE" && !card}
                    slotRef={(element) => setBoardSlotRef(i, element)}
                     cardRef={card ? (element) => setBoardCardRef(card.instanceId, element) : undefined}
                     hit={Boolean(
                       attackImpactTriggered &&
                       attackAnimation && attackAnimation.damage > 0 &&
                       attackAnimation?.targetKind === "CARD" &&
                       attackAnimation.target?.instanceId === card?.instanceId,
                     )}
                    hitImpactLevel={attackAnimation?.damageImpactLevel}
                    animating={
                      (playAnimation?.kind === "WRESTLER" &&
                        playAnimation.card.instanceId === card?.instanceId) ||
                        generatedPlayAnimations.some((animation) => animation.card.instanceId === card?.instanceId) ||
                         attackAnimation?.attacker.instanceId === card?.instanceId ||
                         attackAnimation?.target?.instanceId === card?.instanceId
                    }
                     selected={card?.instanceId === selectedAttackerId || !!card && selectedEffectTargetIds.has(card.instanceId)}
                    attackReady={!!card && getAttackLegality(state, me.id, card.instanceId).allowed}
                    attackSelectionActive={attackerSelectionActive}
                    attackReason={card
                      ? (() => {
                          const legality = getAttackLegality(state, me.id, card.instanceId);
                          return legality.allowed ? undefined : legality.message;
                        })()
                      : undefined}
                    targetingActive={!!effectTargeting}
                    presentationActive={activePresentationCardId === card?.instanceId || (!!effectTargeting && state.targetingState?.sourceInstanceId === card?.instanceId)}
                    targetable={!!card && !!effectTargeting && validEffectTargetIds.has(card.instanceId)}
                     activeReady={!!card && legalActiveCardIds.has(card.instanceId)}
                     activeUsable={!!card && legalActiveCardIds.has(card.instanceId)}
                     onUseActive={() => onUseActive(card!.instanceId)}
                   onClick={(idOrIdx) => {
                      if (typeof idOrIdx === 'string') {
                        if (effectTargeting) {
                          onEffectTarget(idOrIdx);
                        } else {
                           if (
                             attackerSelectionActive &&
                             card &&
                             !getAttackLegality(state, me.id, card.instanceId).allowed
                           ) {
                              const legality = getAttackLegality(state, me.id, card.instanceId);
                              setAttackHint(legality.allowed ? null : legality.message);
                             return;
                           }
                           setAttackHint(null);
                           onSelectAttacker(idOrIdx);
                        }
                      }
                      else handlePlaySlot(idOrIdx as BoardSlotIndex);
                   }}
                 />
               ))}
                </div>
                  <ZoneStack
                    className="ko-player-zones"
                   deckRef={playerDeckRef}
                   deckCount={me.deck.length}
                   graveyardCount={me.graveyard.length}
                   onGraveyardClick={() => setOpenGraveyardPlayerId(me.id)}
                 />
            </div>
         </div>

           <aside className="ko-game-controls absolute right-2 top-36 z-[110] flex w-24 flex-col items-stretch gap-2 rounded border border-neutral-800 bg-black/85 p-2 shadow-2xl backdrop-blur-md md:fixed md:right-4 md:top-1/2 md:w-32 md:-translate-y-1/2 md:p-3">
              <button
                type="button"
                aria-label="설정 열기"
                aria-expanded={settingsOpen}
                onClick={() => {
                  setSettingsOpen((open) => !open);
                  setSurrenderConfirming(false);
                }}
                className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-[10px] font-bold text-neutral-300 transition-colors hover:border-primary hover:text-primary md:text-xs"
              >
                ⚙ 설정
              </button>
             {effectTargeting && (
               <div className="rounded border border-amber-500 bg-amber-950/90 px-2 py-2 text-center text-[10px] font-bold text-amber-100">
                 <strong className="block break-keep text-amber-200">{state.targetingState!.pendingAction?.type === 'USE_CHAMPION_ABILITY'
                   ? `${me.champion?.name ?? '챔피언'} 고유 능력`
                   : state.targetingState!.sourceCard?.definitionId
                     ? `${state.cardPool?.find((card) => card.id === state.targetingState!.sourceCard!.definitionId)?.name ?? getCardDefinition(state.targetingState!.sourceCard!.definitionId)?.name ?? '선수'}의 효과`
                     : '효과'} 발동 중</strong>
                 대상 선택 ({state.targetingState!.selectedTargetIds.length}/{state.targetingState!.minTargets})
                 <span className="mt-1 block text-[9px] text-amber-200/80">금색으로 강조된 대상만 선택 가능</span>
                 <button type="button" onClick={onCancelEffectTargeting} className="mt-1 block w-full rounded border border-amber-600 px-1 py-0.5 text-[9px]">취소</button>
               </div>
             )}
             <div className="flex items-center justify-between gap-2 border-b border-neutral-800 pb-2">
               <div className="text-right">
                 <div className="text-[9px] font-bold text-neutral-500 md:text-[10px]">현재 턴 {state.turn}</div>
                 <div className={`text-xs font-black md:text-base ${isMyTurn ? 'text-primary' : 'text-red-400'}`}>
                   {isMyTurn ? '내 턴' : '상대 턴'}
                 </div>
               </div>
               <div
                 className={`rounded border px-2 py-1 text-center font-display text-sm font-black md:text-lg ${
                   turnSecondsRemaining <= 10
                     ? 'border-red-500 bg-red-950/80 text-red-300'
                     : 'border-neutral-700 bg-neutral-900/90 text-primary'
                 }`}
                 aria-label={`남은 턴 시간 ${Math.floor(turnSecondsRemaining / 60)}분 ${turnSecondsRemaining % 60}초`}
               >
                 {String(Math.floor(turnSecondsRemaining / 60)).padStart(2, '0')}:
                 {String(turnSecondsRemaining % 60).padStart(2, '0')}
              </div>
            </div>
            <button
              type="button"
              disabled={!canEndTurn}
              onClick={() => {
                if (remainingActions.length && turnSecondsRemaining > 10 && !confirmEndTurn) {
                  setConfirmEndTurn(true);
                  return;
                }
                setConfirmEndTurn(false);
                onEndTurn();
              }}
              className={`rounded px-2 py-2 text-[10px] font-black transition-all md:py-3 md:text-sm ${
                canEndTurn
                  ? 'bg-primary text-black shadow-[0_0_12px_rgba(234,179,8,0.3)] hover:bg-yellow-400'
                  : 'cursor-not-allowed bg-neutral-800 text-neutral-600'
              }`}
            >
              {confirmEndTurn ? '그래도 종료' : '턴 종료'}
            </button>
            {confirmEndTurn && <div role="status" className="rounded border border-amber-700 bg-black/90 p-2 text-[10px] text-amber-200">
              공격이나 능력 사용이 남아 있어요.
              <button type="button" className="mt-1 block font-bold underline" onClick={() => setConfirmEndTurn(false)}>계속 플레이</button>
            </div>}
            {playError && (
              <div className="absolute right-0 top-full mt-2 w-44 rounded border border-red-500 bg-red-950/95 px-3 py-2 text-[10px] font-bold text-red-200 shadow-xl">
                {playError}
              </div>
            )}
              {attackHint && (
                <div
                  className="absolute right-0 top-full mt-2 w-44 rounded border border-blue-500/70 bg-blue-950/95 px-3 py-2 text-[10px] font-bold text-blue-100 shadow-xl"
                  role="status"
                >
                  {attackHint}
                </div>
              )}
          </aside>

           {settingsOpen && (
             <>
               <div
                 className="fixed inset-0 z-[150]"
                 aria-hidden="true"
                 onClick={closeSettings}
               />
               <div
                 role="dialog"
                 aria-modal="true"
                 aria-label="게임 설정"
                  className="ko-settings-dialog fixed right-2 top-36 z-[151] w-56 rounded-lg border border-neutral-700 bg-neutral-950 p-4 shadow-2xl md:right-40 md:top-1/2 md:-translate-y-1/2"
                 onClick={(event) => event.stopPropagation()}
               >
                 <div className="mb-3 flex items-center justify-between border-b border-neutral-800 pb-2">
                   <h2 className="text-sm font-black text-white">설정</h2>
                   <button
                     type="button"
                     aria-label="설정 닫기"
                     onClick={closeSettings}
                     className="rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                   >
                     ×
                   </button>
                 </div>
                 {!surrenderConfirming ? (
                   <div className="space-y-3">
                     <button type="button" onClick={() => { closeSettings(); setTutorialStep(0); }}
                       className="w-full rounded border border-amber-600 bg-amber-950/40 px-3 py-2 text-xs font-black text-amber-200">
                       경기 튜토리얼
                     </button>
                      {onReturnToAdmin && (
                        <button
                          type="button"
                          onClick={onReturnToAdmin}
                          className="w-full rounded border border-amber-700 bg-amber-950/40 px-3 py-2 text-xs font-black text-amber-200 transition-colors hover:bg-amber-900/60"
                        >
                          관리자로 돌아가기
                        </button>
                      )}
                       {onReturnToMainMenu && (
                         <button
                           type="button"
                           data-testid="button-return-to-main-menu-settings"
                           onClick={onReturnToMainMenu}
                           className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-black text-neutral-200 transition-colors hover:border-amber-500 hover:bg-neutral-800 hover:text-amber-200"
                         >
                           메인 화면으로
                         </button>
                       )}
                     <label className="flex items-center justify-between gap-3 text-xs font-bold text-neutral-300">
                       <span>배경 음악 음소거</span>
                       <button
                         type="button"
                         role="switch"
                         aria-checked={bgmMuted}
                         onClick={() => onBgmMutedChange(!bgmMuted)}
                         className={`rounded-full border px-3 py-1 text-[10px] font-black transition-colors ${
                           bgmMuted
                             ? 'border-neutral-700 bg-neutral-800 text-neutral-400'
                             : 'border-primary bg-primary text-black'
                         }`}
                       >
                         {bgmMuted ? 'ON' : 'OFF'}
                       </button>
                     </label>
                     <label className="block text-xs font-bold text-neutral-300">
                       <span className="flex items-center justify-between gap-3">
                         <span>배경 음악 볼륨</span>
                         <span className="text-[10px] text-amber-300">{bgmVolume}%</span>
                       </span>
                       <input
                         type="range"
                         min="0"
                         max="100"
                         step="1"
                         value={bgmVolume}
                         onChange={(event) => onBgmVolumeChange(Number(event.target.value))}
                         className="mt-2 w-full accent-amber-400"
                         aria-label="배경 음악 볼륨"
                       />
                     </label>
                     <SfxVolumeControl />
                     <EntranceVolumeControl />
                     <label className="flex items-center justify-between gap-2 text-xs font-bold text-neutral-300">
                       모바일 진동
                       <input type="checkbox" checked={hapticsEnabled} className="h-4 w-4 accent-amber-400"
                         onChange={(event) => {
                           setHapticsEnabled(event.target.checked);
                           try { window.localStorage.setItem('ko-match-haptics', event.target.checked ? 'on' : 'off'); } catch { /* optional */ }
                         }} />
                     </label>
                     <button
                       type="button"
                       disabled={state.status === 'FINISHED'}
                       onClick={() => setSurrenderConfirming(true)}
                       className="w-full rounded border border-red-900 bg-red-950/50 px-3 py-2 text-xs font-black text-red-300 transition-colors hover:bg-red-900/70 disabled:cursor-not-allowed disabled:opacity-40"
                     >
                       항복
                     </button>
                   </div>
                 ) : (
                   <div className="space-y-3">
                     <p className="text-xs font-bold leading-5 text-neutral-200">
                       정말 항복하시겠습니까?<br />
                       항복하면 이번 게임에서 패배합니다.
                     </p>
                     <div className="flex gap-2">
                       <button
                         type="button"
                         onClick={() => {
                           closeSettings();
                           onSurrender();
                         }}
                         className="flex-1 rounded bg-red-700 px-2 py-2 text-[11px] font-black text-white hover:bg-red-600"
                       >
                         항복하기
                       </button>
                       <button
                         type="button"
                         onClick={() => setSurrenderConfirming(false)}
                         className="flex-1 rounded border border-neutral-700 px-2 py-2 text-[11px] font-bold text-neutral-300 hover:bg-neutral-800"
                       >
                         취소
                       </button>
                     </div>
                   </div>
                 )}
               </div>
             </>
           )}

          {onMulligan && !introActive && canMulligan(state, state.players[0].id) && (
            <div className="fixed inset-0 z-[205] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-label="시작 손패 교체">
              <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-amber-500 bg-neutral-950 p-5 text-white shadow-2xl">
                <h2 className="text-lg font-black text-amber-300">시작 손패 교체</h2>
                <p className="my-3 text-sm text-neutral-300">첫 턴 행동 전, 바꿀 카드를 선택하세요. 선택한 카드만 덱의 카드와 교체합니다.</p>
                <div className="mx-auto grid w-full max-w-[660px] grid-cols-2 justify-items-center gap-3 sm:grid-cols-4">
                  {state.players[0].hand.map((card) => <button key={card.instanceId} type="button"
                    aria-pressed={mulliganSelection.includes(card.instanceId)}
                    onClick={() => setMulliganSelection((current) => current.includes(card.instanceId)
                      ? current.filter((id) => id !== card.instanceId) : [...current, card.instanceId])}
                    aria-label={`${getCardDefinition(card.definitionId)?.name ?? card.definitionId} ${mulliganSelection.includes(card.instanceId) ? '교체 선택됨' : '교체 선택'}`}
                    className={`relative w-full max-w-[150px] rounded-lg p-1 transition-transform hover:-translate-y-2 ${mulliganSelection.includes(card.instanceId) ? '-translate-y-3 bg-amber-500 ring-2 ring-amber-300' : 'bg-neutral-700'}`}>
                    <CardRenderer name={getCardDefinition(card.definitionId)?.name ?? '카드'} cardType={card.cardType} cost={card.currentCost} attack={card.currentAttack} health={card.currentHealth} rulesText={getCardRuntimeRulesText(card, getCardDefinition(card.definitionId)?.rulesText ?? '')} imageUrl={getCardDefinition(card.definitionId)?.imageUrl} rarity={getCardDefinition(card.definitionId)?.rarity} size="hand" imageDisplaySettings={getCardDefinition(card.definitionId)} className="pointer-events-none w-full" />
                    {mulliganSelection.includes(card.instanceId) && <span className="absolute inset-x-1 bottom-1 rounded bg-amber-300/95 py-1 text-center text-xs font-black text-black">교체 선택</span>}
                  </button>)}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => onMulligan([])} className="rounded border border-neutral-500 px-4 py-2">그대로 시작</button>
                  <button type="button" disabled={mulliganSelection.length > state.players[0].deck.length}
                    onClick={() => onMulligan(mulliganSelection)} className="rounded bg-amber-400 px-4 py-2 font-bold text-black disabled:opacity-40">{mulliganSelection.length}장 교체</button>
                </div>
              </div>
            </div>
          )}
          {onMulligan && !introActive && state.openingMulligan && me.mulliganUsed && (
            <div className="fixed inset-0 z-[205] flex items-center justify-center bg-black/75 p-4" role="status">
              <div className="rounded-xl border border-amber-500 bg-neutral-950 p-6 text-center text-amber-200">상대의 시작 손패 교체를 기다리고 있습니다.</div>
            </div>
          )}
          {guidedTutorial && !coachDismissed && state.status === 'IN_PROGRESS' && !canMulligan(state, me.id) && (
            <div className="fixed left-1/2 top-3 z-[140] w-[min(94vw,480px)] -translate-x-1/2 rounded-lg border border-sky-400 bg-slate-950/95 p-3 text-sm text-white shadow-xl" role="status">
              <div className="flex items-start justify-between gap-3"><strong className="text-sky-300">실전 튜토리얼</strong>
                <button type="button" onClick={() => { setCoachDismissed(true); try { localStorage.setItem('ko-match-coach-v1', 'done'); } catch {} }} className="text-xs text-neutral-300">닫기</button></div>
              <p className="mt-1">{coachStage === 4 ? '퀘스트가 진행됐어요! 화면의 퀘스트 표시를 눌러 조건과 보상을 확인해 보세요.'
                : state.activePlayerId !== state.players[0].id ? '상대의 턴입니다. 다음 턴을 기다려 주세요.'
                : selectedCardId ? '빈 필드 구역을 눌러 선택한 선수를 소환하세요.'
                : selectedAttackerId ? '상대 선수나 챔피언을 눌러 공격하세요.'
                : state.players[0].board.some((card) => card && !card.enteredThisTurn && card.attacksUsedThisTurn === 0)
                  ? '필드의 내 선수를 눌러 공격 대상을 지정해 보세요.'
                  : state.players[0].hand.some((card) => card.cardType === 'WRESTLER' && card.currentCost <= state.players[0].currentGold)
                    ? '손패에서 비용을 낼 수 있는 선수를 눌러 보세요.'
                    : '지금은 턴 종료를 눌러 다음 턴으로 넘어가세요.'}</p>
            </div>
          )}
          {tutorialStep !== null && (
            <MatchTutorial step={tutorialStep} onStepChange={setTutorialStep} onClose={() => setTutorialStep(null)} />
          )}
          {openGraveyardPlayerId && (
            <GraveyardModal
              player={state.players.find((player) => player.id === openGraveyardPlayerId)!}
              onClose={() => setOpenGraveyardPlayerId(null)}
            />
          )}

         {/* BOTTOM BAR: Player info & Hand */}
           <div className="ko-player-footer relative z-[90] flex min-h-[160px] shrink-0 items-end justify-start px-2 pb-2 md:min-h-[220px] md:px-4 md:pb-4">
            
            {/* Player Stats & Champion */}
             <div className="ko-player-info z-[95] flex w-[180px] shrink-0 flex-col gap-1 md:w-48 md:gap-2">
               {playerNickname && (
                 <span className="max-w-full truncate text-[11px] font-black text-white md:text-sm" data-testid="text-online-player-nickname">
                   {playerNickname}
                 </span>
               )}
              <div className="flex items-start gap-2 md:gap-3">
                <div className="relative shrink-0">
                  <div
                    ref={playerChampionRef}
                    role="button"
                    tabIndex={0}
                    aria-label={effectTargeting ? '내 챔피언 대상' : '내 챔피언 감정표현 열기'}
                    aria-expanded={!effectTargeting && emoteOpen}
                    onClick={() => { if (effectTargeting) onEffectTarget(me.id); else if (onEmote && state.status === 'IN_PROGRESS') setEmoteOpen((open) => !open); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (effectTargeting) onEffectTarget(me.id);
                        else if (onEmote && state.status === 'IN_PROGRESS') setEmoteOpen((open) => !open);
                      }
                    }}
                    className={`ko-player-champion relative flex h-28 w-20 shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-sm border-2 bg-neutral-900 md:h-40 md:w-28 ${me.champion?.questCompleted ? 'ko-quest-awakened-portrait border-amber-400' : effectTargeting && validEffectTargetIds.has(me.id) ? 'cursor-crosshair border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 'border-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.2)]'} ${activePresentationChampionId === me.champion?.id || activePresentationCue?.playerId === me.id ? 'presentation-card-pulse' : ''}`}
                  >
                    {playerChampionPortrait && (
                      <CardArtwork
                        src={playerChampionPortrait}
                        alt=""
                        className="absolute inset-0 h-full w-full"
                        imageDisplayMode={me.champion?.imageDisplayMode}
                        imageScale={me.champion?.imageScale}
                        imagePositionX={me.champion?.imagePositionX}
                        imagePositionY={me.champion?.imagePositionY}
                      />
                    )}
                   <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                   {playerChampionProtected && (
                     <span className="pointer-events-none absolute bottom-1 left-1/2 z-20 -translate-x-1/2 rounded border border-cyan-300/70 bg-cyan-950/90 px-1.5 py-0.5 text-[7px] font-black text-cyan-200 md:text-[9px]">
                       PROTECTED
                     </span>
                   )}
                  <span className="px-1 text-center text-[9px] font-black leading-tight text-blue-400 md:text-[12px]">
                     {playerChampionName || me.champion?.name || '내 챔피언'}
                  </span>
               </div>
                {onEmote && emoteOpen && !effectTargeting && <div role="menu" aria-label="챔피언 감정표현" className="absolute bottom-full left-0 z-[210] mb-2 grid w-40 grid-cols-2 gap-1 rounded-lg border border-amber-400/70 bg-neutral-950 p-2 shadow-2xl">
                  {CHAMPION_EMOTES.map((emote) => <button key={emote} type="button" role="menuitem" onClick={() => { onEmote(emote); setEmoteOpen(false); }} className="rounded bg-neutral-800 p-2 text-xs text-white hover:bg-amber-700">{CHAMPION_EMOTE_LABELS[emote]}</button>)}
                </div>}
                </div>

                <div className="ko-player-stats flex min-w-0 flex-col gap-1">
                <div className="rounded border border-neutral-700 bg-neutral-900/80 px-2 py-1">
                  <div className="text-[7px] font-bold text-neutral-400 md:text-[9px]">골드</div>
                    <div className="font-display text-sm font-black text-primary md:text-xl">
                      <span key={me.currentGold} className="presentation-stat-change">{me.currentGold}</span> / {myMaxGold}
                   </div>
                </div>
                <div className="rounded border border-blue-800 bg-blue-950/80 px-2 py-1">
                 <div className="text-[7px] font-bold text-blue-300 md:text-[9px]">챔피언 체력</div>
                  <div className="font-display text-sm font-black text-white md:text-xl">
                    <span key={mySurvivalHealth} className="presentation-stat-change">{displayHealth(mySurvivalHealth)}</span> / {me.champion?.maxHealth ?? 20}
                 </div>
                </div>
               </div>
              </div>

               {me.champion?.quest && (
                 <Inspectable content={<ChampionQuestInspectContent champion={me.champion} />}>
                  <div tabIndex={0} className={`rounded border px-2 py-1 text-[8px] font-bold md:text-[10px] ${me.champion.questCompleted ? 'border-amber-400 bg-amber-950/90 text-amber-100' : 'border-purple-900 bg-purple-950/70 text-purple-200'} ${activePresentationCue?.kind === "QUEST_PROGRESS" || activePresentationCue?.kind === "QUEST_COMPLETE" ? "presentation-card-pulse" : ""}`}>
                     퀘스트 {me.champion.questCompleted ? '완료' : `${me.champion.questProgress}/${me.champion.quest.requiredProgress}`}
                     {!me.champion.questCompleted && me.champion.questProgress === me.champion.quest.requiredProgress - 1 && <span className="ml-1 text-amber-300">· 다음 1회!</span>}
                     {activePresentationCue?.kind === 'QUEST_PROGRESS' && activePresentationCue.playerId === me.id && (
                       <span className="mt-1 block max-w-40 text-[9px] leading-tight text-purple-100">{activePresentationCue.label} +{activePresentationCue.value}</span>
                     )}
                   </div>
                 </Inspectable>
               )}

               {me.champion && (
                 <Inspectable
                   content={
                     <ChampionAbilityInspectContent
                       champion={me.champion}
                       available={canUseChampion}
                       unavailableReason={championUnavailableReason}
                     />
                   }
                 >
                   <button
                     disabled={!canUseChampion}
                     onClick={onUseChampionAbility}
                     className={`w-full rounded border py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all md:py-2 md:text-[11px] ${
                       canUseChampion
                       ? me.champion?.questCompleted ? 'cursor-pointer border-amber-400 bg-amber-900/70 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.4)] hover:bg-amber-800' : 'cursor-pointer border-blue-500 bg-blue-900/50 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.3)] hover:bg-blue-800 hover:text-white'
                       : 'cursor-not-allowed border-neutral-800 bg-neutral-900 text-neutral-600'
                     }`}
                   >
                     {me.champion.questCompleted && me.champion.upgradedAbility ? '강화 능력' : '챔피언 능력'} (비용 {me.champion.abilityCost} 골드)
                   </button>
                 </Inspectable>
               )}
            </div>

            {/* Player Hand */}
             <div ref={playerHandRef} className="ko-player-hand relative z-[100] flex h-full min-w-0 flex-1 items-end overflow-x-auto scrollbar-none pt-12 md:pt-16">
                <div className="ko-hand-cards relative z-[100] flex w-max justify-start gap-2 px-4 pb-3 md:mx-0 md:px-0 md:justify-start md:gap-3">
                 {me.hand.length === 0 ? (
                    <span className="py-4 text-xs font-bold text-neutral-600">손패 없음</span>
                 ) : (
                    me.hand.map((card, i) => {
                      const isSelected = selectedCardId === card.instanceId;
                      const canAfford = isMyTurn && me.currentGold >= card.currentCost;
                     const density =
                       me.hand.length >= 7 ? 'small' : me.hand.length >= 5 ? 'medium' : 'regular';
                     return (
                        <HandCard
                          key={`hand-${card.instanceId}-${i}`}
                          card={card}
                          isSelected={isSelected}
                          canAfford={canAfford}
                           targetingActive={!!effectTargeting}
                           presentationActive={activePresentationCardId === card.instanceId}
                           targetable={!!effectTargeting && validEffectTargetIds.has(card.instanceId)}
                          onClick={() => onSelectCard(card.instanceId)}
                           onUseTechnique={() => handleUseTechnique(card.instanceId)}
                           cardRef={(element) => setHandCardRef(card.instanceId, element)}
                           density={density}
                          style={{ zIndex: isSelected ? 50 : i }}
                        />
                      );
                    })
                 )}
               </div>
            </div>

         </div>
      </div>
      {playAnimation && (
        <CardPlayAnimation
          animation={playAnimation}
          onComplete={onPlayAnimationComplete}
          viewerPlayerId={me.id}
        />
      )}
      {generatedPlayAnimations[0] && (
        <CardPlayAnimation
          key={`generated-play-${generatedPlayAnimations[0].card.instanceId}-${generatedPlayAnimations[0].kind}`}
          animation={generatedPlayAnimations[0]}
          viewerPlayerId={me.id}
          onComplete={() => {
            const completed = generatedPlayAnimations[0];
            setGeneratedPlayAnimations((current) => current.slice(1).filter((entry) => entry.card.instanceId !== completed.card.instanceId || entry.kind !== completed.kind));
          }}
        />
      )}
      {cardLeaveAnimations.map((animation) => (
        <CardLeaveAnimation
          key={animation.id}
          animation={animation}
          onComplete={() => {
            setCardLeaveAnimations((current) => current.filter((entry) => entry.id !== animation.id));
          }}
        />
      ))}
      {destroyBursts.map((burst) => <div key={burst.id} aria-hidden="true" className="ko-destroy-burst"
        style={{ left: burst.left, top: burst.top, width: burst.width, height: burst.height }} />)}
      {drawFlights.map((flight) => <div key={flight.id} aria-hidden="true" className={`ko-draw-flight ${flight.opponent ? 'ko-draw-flight--opponent' : ''}`}
        style={{ '--draw-from-x': `${flight.fromX}px`, '--draw-from-y': `${flight.fromY}px`,
          '--draw-to-x': `${flight.toX}px`, '--draw-to-y': `${flight.toY}px` } as React.CSSProperties} />)}
      {attackAnimation && (
        <AttackAnimation
          animation={attackAnimation}
          onImpact={onAttackImpact}
          onComplete={onAttackAnimationComplete}
        />
      )}
      {effectFinisher && !attackAnimation && (
        <div className="effect-finisher" aria-hidden="true"><div className="attack-animation__finisher-slash" /><span>K.O.!</span></div>
      )}
      {spokenLine && <div key={spokenLine.id} role="status" className={`champion-spoken-line ${spokenLine.playerId === me.id ? 'champion-spoken-line--mine' : 'champion-spoken-line--theirs'}`}>
        <span className="block text-[10px] font-bold text-amber-300">{spokenLine.speaker}</span>
        <span>{spokenLine.text}</span>
      </div>}
      {presentationQueue[0] &&
        !introActive &&
        !state.openingMulligan &&
        !canMulligan(state, me.id) &&
        !playAnimation &&
        !generatedPlayAnimations.length &&
        (!attackAnimation || attackImpactTriggered) && (
        presentationQueue[0].kind === "QUEST_COMPLETE"
          ? <QuestPresentation cue={presentationQueue[0]} state={state} viewerPlayerId={presentationPlayerId ?? me.id} onComplete={handlePresentationQueueComplete} />
          : <PresentationFeedback cue={presentationQueue[0]} onComplete={handlePresentationQueueComplete} />
      )}
    </div>
    </AltInspectProvider>
  );
}

function HandCard({
  card,
  isSelected,
  canAfford,
  targetingActive,
  presentationActive,
  targetable,
  onClick,
  density,
  style,
  onUseTechnique,
  cardRef,
}: {
  card: CardInstance;
  isSelected: boolean;
  canAfford: boolean;
  targetingActive: boolean;
  presentationActive: boolean;
  targetable: boolean;
  onClick: () => void;
  onUseTechnique: () => void;
  cardRef: (element: HTMLDivElement | null) => void;
  density: 'small' | 'medium' | 'regular';
  style?: React.CSSProperties;
}) {
  const def = getCardDefinition(card.definitionId);
  
  const sizeClass =
    density === 'small'
      ? 'ko-hand-card--small w-[58px] h-[81px] md:w-[84px] md:h-[118px]'
      : density === 'medium'
        ? 'ko-hand-card--medium w-[66px] h-[92px] md:w-[100px] md:h-[140px]'
        : 'ko-hand-card--regular w-[75px] h-[105px] md:w-[130px] md:h-[182px]';
  let containerClass = `${sizeClass} relative flex flex-col transition-all duration-200 select-none hover:z-40 group overflow-visible origin-bottom `;
  
  if (isSelected) {
    containerClass += "-translate-y-8 scale-[1.04] md:-translate-y-12 md:scale-[1.04] z-50 cursor-pointer";
  } else if (targetable) {
    containerClass += "cursor-crosshair";
  } else if (targetingActive) {
    containerClass += "opacity-40 grayscale cursor-not-allowed";
  } else if (!canAfford) {
    containerClass += "opacity-40 grayscale cursor-not-allowed";
  } else {
    containerClass += "hover:-translate-y-4 hover:scale-[1.04] cursor-pointer";
  }

  return (
    <Inspectable content={<CardInspectContent card={card} />} touchInspectTriggerOnly className="relative shrink-0">
    <div className={`relative ${presentationActive ? "presentation-card-pulse" : ""}`}>
      <CardRenderer
      name={def?.name ?? '알 수 없는 카드'}
      cardType={card.cardType}
      cost={card.currentCost}
      attack={card.currentAttack}
      health={card.currentHealth}
       rulesText={getCardRuntimeRulesText(card, def?.rulesText ?? '효과 없음')}
      imageUrl={def?.imageUrl}
      rarity={def?.rarity}
      size="hand"
       className={`ko-hand-card ${isSelected ? "ko-hand-card--selected " : ""}${containerClass}`}
      imageDisplaySettings={def}
       runtimeKeywords={getActiveCardKeywords(card)}
       isSilenced={card.isSilenced}
       isStunned={card.isStunned}
       isAbilityDisabled={card.isAbilityDisabled}
       dodgeCharges={card.dodgeCharges ?? (card.dodgeAvailable ? 1 : 0)}
       isChampionToken={card.isChampionToken}
       highlight={isSelected ? "selected" : targetable ? "target" : undefined}
      onClick={onClick}
      tabIndex={0}
      containerRef={cardRef}
    />
    <button
      type="button"
      data-touch-inspect-trigger
      className="ko-hand-inspect-button hidden"
      aria-label={`${def?.name ?? '카드'} 상세정보`}
      onClick={(event) => event.stopPropagation()}
    >
      ⓘ
    </button>
    {card.cardType === "TECHNIQUE" && isSelected && (
      <button
        type="button"
        className="absolute left-1/2 top-9 z-[130] -translate-x-1/2 whitespace-nowrap rounded border border-primary bg-primary px-3 py-1 text-[10px] font-black text-black shadow-[0_0_14px_rgba(234,179,8,0.5)] hover:bg-yellow-300 md:-top-11 md:px-4 md:py-1.5 md:text-xs"
        onClick={(event) => {
          event.stopPropagation();
          onUseTechnique();
        }}
      >
        사용
      </button>
    )}
    </div>
    </Inspectable>
  );
}

function BoardSlot({
  card,
  isOpponent,
  slotIndex,
  selectable,
  selected,
  attackReady,
  attackSelectionActive,
  attackReason,
  attackPreview,
  targetingActive,
  presentationActive,
  targetable,
  activeReady,
  activeUsable,
  onUseActive,
  onClick,
  slotRef,
  cardRef,
  hit = false,
  hitImpactLevel,
  animating = false,
}: {
  card: CardInstance | null;
  isOpponent: boolean;
  slotIndex: BoardSlotIndex;
  selectable: boolean;
  selected: boolean;
  attackReady: boolean;
  attackSelectionActive: boolean;
  attackReason?: string;
  attackPreview?: string;
  targetingActive: boolean;
  presentationActive: boolean;
  targetable: boolean;
  activeReady: boolean;
  activeUsable: boolean;
  onUseActive: () => void;
  onClick: (idOrIdx: string | BoardSlotIndex) => void;
  slotRef?: (element: HTMLDivElement | null) => void;
  cardRef?: (element: HTMLDivElement | null) => void;
  hit?: boolean;
  hitImpactLevel?: AttackDamageImpactLevel;
  animating?: boolean;
}) {
  const isEmpty = !card;
  
  let containerClass = "ko-board-slot w-[70px] h-[98px] md:w-[110px] md:h-[154px] relative flex flex-col transition-transform duration-200 select-none overflow-visible ";
  
  if (isEmpty) {
    containerClass += "border-2 border-dashed bg-neutral-900/30 items-center justify-center ";
    if (selectable) {
      containerClass += "border-primary/60 hover:border-primary hover:bg-primary/10 cursor-pointer animate-pulse";
    } else {
      containerClass += "border-neutral-800";
    }
  } else {
    containerClass += "group ";
    if (selected) {
      containerClass += "-translate-y-2 md:-translate-y-4 z-20 cursor-pointer";
    } else if (targetable) {
      containerClass += "hover:-translate-y-1 hover:scale-[1.03] cursor-crosshair z-10";
    } else if (targetingActive) {
      containerClass += "opacity-40 grayscale cursor-not-allowed";
    } else if (attackSelectionActive && !attackReady) {
      containerClass += "opacity-50 grayscale cursor-help";
    } else if (attackReady) {
      containerClass += "hover:-translate-y-1 hover:scale-[1.03] cursor-pointer z-10";
    } else {
      containerClass += isOpponent ? "" : "cursor-pointer";
    }
  }

  if (isEmpty) {
    return (
      <div ref={slotRef} className={containerClass} onClick={selectable ? () => onClick(slotIndex) : undefined}
        role={selectable ? 'button' : undefined} tabIndex={selectable ? 0 : undefined}
        aria-label={selectable ? `${slotIndex + 1}구역에 카드 배치` : undefined}
        data-gamepad-target={selectable ? '' : undefined}
        onKeyDown={selectable ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(slotIndex); }
        } : undefined}>
         <span className="text-[9px] font-bold tracking-widest text-neutral-600 md:text-[11px]">{slotIndex + 1}구역</span>
      </div>
    );
  }

  const def = getCardDefinition(card.definitionId);
  const isDead = card.currentHealth <= 0;

  return (
    <Inspectable content={<CardInspectContent card={card} />} touchInspectTriggerOnly className="ko-board-slot-wrapper relative shrink-0">
       <div
         ref={slotRef}
         title={attackSelectionActive && !attackReady ? attackReason : undefined}
         className={`relative${animating ? " invisible" : ""}`}
       >
      {activeReady && (
        <button
          type="button"
          disabled={!activeUsable}
          onClick={(event) => {
            event.stopPropagation();
            onUseActive();
          }}
          className="absolute -top-10 left-1/2 z-[120] -translate-x-1/2 whitespace-nowrap rounded border border-blue-500 bg-blue-900/95 px-3 py-1.5 text-[10px] font-bold text-blue-100 shadow-lg transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-500 md:-top-12 md:px-4 md:py-2 md:text-xs"
        >
          액티브
        </button>
      )}
       <CardRenderer
         name={def?.name ?? '알 수 없는 카드'}
         cardType={card.cardType}
         cost={card.currentCost}
         attack={card.currentAttack}
         health={card.currentHealth}
          rulesText={getCardRuntimeRulesText(card, def?.rulesText ?? '효과 없음')}
         imageUrl={def?.imageUrl}
         rarity={def?.rarity}
         size="board"
         className={`${containerClass}${animating ? " opacity-0 pointer-events-none" : ""}${presentationActive ? " presentation-card-pulse" : ""}${hit ? ` attack-target-hit--${hitImpactLevel?.toLowerCase() ?? "light"}` : ""}`}
         imageDisplaySettings={def}
           runtimeKeywords={getActiveCardKeywords(card)}
          isSilenced={card.isSilenced}
          isStunned={card.isStunned}
          isAbilityDisabled={card.isAbilityDisabled}
          dodgeCharges={card.dodgeCharges ?? (card.dodgeAvailable ? 1 : 0)}
          isChampionToken={card.isChampionToken}
         highlight={selected ? "selected" : targetable ? "target" : attackReady ? "attack" : undefined}
          containerRef={cardRef}
         onClick={() => onClick(card.instanceId)}
         tabIndex={0}
         overlay={
           <>
             <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
             {(targetable || attackReady) && !animating && <span className={`pointer-events-none absolute left-1/2 top-[28%] z-30 -translate-x-1/2 whitespace-nowrap rounded border px-1 py-0.5 text-[7px] font-black shadow-lg md:text-[9px] ${targetable ? 'border-amber-300 bg-amber-950/95 text-amber-100' : 'border-sky-300 bg-sky-950/95 text-sky-100'}`}>
               {targetable ? targetingActive ? '효과 대상' : '공격 대상' : '공격 가능'}
             </span>}
             {isDead && (
               <div className="absolute inset-0 flex items-center justify-center bg-red-950/80">
                 <span className="rotate-12 font-display text-2xl font-black text-red-500 drop-shadow-md md:text-3xl">KO</span>
               </div>
             )}
           </>
         }
       />
       {attackPreview && <span className="pointer-events-none absolute bottom-full left-1/2 z-[60] mb-1 w-max max-w-[min(10rem,calc(100vw-24px))] -translate-x-1/2 rounded border border-red-500 bg-red-950/95 px-1.5 py-0.5 text-center text-[8px] font-black leading-tight text-white">{attackPreview}</span>}
       <button
         type="button"
         data-touch-inspect-trigger
         className="ko-board-inspect-button hidden"
         aria-label={`${def?.name ?? '카드'} 상세정보`}
         onClick={(event) => event.stopPropagation()}
       >
         ⓘ
       </button>
    </div>
    </Inspectable>
  );
}

function ZoneStack({
  deckCount,
  graveyardCount,
  isOpponent = false,
  onGraveyardClick,
  className = "",
  deckRef,
}: {
  deckCount: number;
  graveyardCount: number;
  isOpponent?: boolean;
  onGraveyardClick: () => void;
  className?: string;
  deckRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className={`ko-zone-stack flex shrink-0 flex-col gap-2 md:gap-3 ${className}`}>
      <div ref={deckRef} className="relative flex h-12 w-10 flex-col items-center justify-end overflow-hidden rounded border-2 border-neutral-600 bg-neutral-800 shadow md:h-16 md:w-14">
        <div className="absolute inset-1 border border-neutral-700/60" />
        <div className="h-4 w-4 rotate-45 border border-neutral-700/60 md:h-6 md:w-6" />
        <span className="relative z-10 mt-auto w-full bg-black/70 py-0.5 text-center text-[7px] font-bold text-neutral-300 md:text-[9px]">
          {deckCount}
        </span>
      </div>
      <button
        type="button"
        onClick={onGraveyardClick}
         aria-label={`묘지 열기, ${graveyardCount}장`}
        className={`flex h-12 w-10 flex-col items-center justify-end overflow-hidden rounded border-2 bg-neutral-900 transition-colors hover:bg-neutral-800 md:h-16 md:w-14 ${
          isOpponent ? 'border-red-900' : 'border-blue-900'
        }`}
      >
         <span className="text-[7px] font-bold text-neutral-500 md:text-[9px]">묘지</span>
        <span className="font-display text-sm font-black text-neutral-200 md:text-lg">{graveyardCount}</span>
      </button>
    </div>
  );
}

function GraveyardModal({
  player,
  onClose,
}: {
  player: GameState['players'][number];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
             aria-label={`${player.id === 'player-1' ? '내' : '상대'} 묘지`}
        className="max-h-[80dvh] w-full max-w-2xl overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950 p-4 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between border-b border-neutral-800 pb-3">
          <div>
            <div className="text-[10px] font-bold tracking-widest text-neutral-500">
               {player.id === 'player-1' ? '내 묘지' : '상대 묘지'}
            </div>
            <h2 className="text-lg font-black text-white">묘지 카드 {player.graveyard.length}장</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs font-bold text-neutral-300 hover:bg-neutral-800"
          >
            닫기
          </button>
        </div>
        {player.graveyard.length === 0 ? (
           <div className="py-12 text-center text-sm text-neutral-500">묘지가 비어 있습니다.</div>
        ) : (
          <div className="grid max-h-[62dvh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
            {player.graveyard
              .slice()
              .reverse()
              .map((card) => {
                const definition = getCardDefinition(card.definitionId);
                return (
                  <Inspectable key={card.instanceId} content={<CardInspectContent card={card} />}>
                    <div
                      tabIndex={0}
                      className="flex min-h-28 cursor-help flex-col justify-between rounded border border-neutral-700 bg-neutral-900 p-2 text-left transition-colors hover:border-primary"
                    >
                      <div className="text-[9px] text-neutral-500">리타이어/파괴 카드</div>
                      <div className="text-xs font-black text-neutral-100">
                        {definition?.name ?? '알 수 없는 카드'}
                      </div>
                      <div className="flex justify-between font-display text-xs">
                        <span className="text-primary">{card.currentAttack}</span>
                        <span className="text-red-300">{card.currentHealth}</span>
                      </div>
                    </div>
                  </Inspectable>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
