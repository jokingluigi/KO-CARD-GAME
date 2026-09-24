import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

import {
  attack,
  createInitialGameState,
  endTurn,
  surrender,
  playWrestlerFromHand,
  startGame,
  selectEffectTarget,
  cancelEffectTargeting,
  type BoardSlot,
  type AttackTarget,
  type GameState,
  type CardDefinition,
  type ChampionDefinition,
  runAITurn,
  fetchPublishedWrestlerCards,
  fetchPublishedCardDefinitions,
  fetchAiTestCardDefinitions,
  cardRecordToDefinition,
  getCardDefinition,
  setRuntimeCardDefinitions,
  fetchPublishedChampions,
  fetchAiTestChampions,
  championRecordToDefinition,
  fetchGameMedia,
  emptyGameMediaCatalog,
  processChampionQuestEvents,
  executeAction,
  type GameMediaCatalog,
  preloadMatchAssets,
  createDeterministicRandom,
} from '@/game';
import { GameStatePreview } from '@/components/game-state-preview';
import { MatchResultOverlay } from '@/components/match-result-overlay';
import { MainMenu } from '@/components/main-menu';
import { AuthLoading, AuthPage, AuthRecovery } from '@/components/auth-page';
import { fetchCurrentUser, logout, type AuthUser } from '@/lib/auth-client';
import { audioManager } from '@/audio/audio-manager';
import {
  BGM_MUTE_STORAGE_KEY,
  BGM_VOLUME_STORAGE_KEY,
  readStoredBgmMute,
  readStoredBgmVolume,
} from '@/audio/audio-settings';
import { fetchDecks, type Deck } from '@/lib/decks-client';
import { ROUTES } from '@/lib/routes';
import { fetchAIDecks, type AIDeck } from '@/lib/ai-decks-client';
import { createLocalAIMatchId, seedForAIMatch, selectAIOpponentDeck } from '@/lib/ai-match-selection';
import { AiMatchSetup } from '@/components/ai-match-setup';
import type { CardPlayAnimationState, CardPlayGeometry } from '@/components/card-play-animation-utils';
import { landingImpactLevel } from '@/components/card-play-animation-utils';
import type { AttackAnimationState } from '@/components/attack-animation-utils';
import {
  attackDamageImpactLevel,
  attackImpactLevel,
  attackSoundPitch,
} from '@/components/attack-animation-utils';

const TURN_TIME_LIMIT_SECONDS = 90;
const ENTRANCE_EFFECT_DELAY_MS = 180;
const RESULT_SCREEN_SETTLE_DELAY_MS = 320;
function actualAttackDamage(
  before: GameState,
  after: GameState,
  attackingPlayerId: string,
  attackerInstanceId: string,
  target: AttackTarget,
) {
  const defendingPlayerBefore = before.players.find((player) => player.id === target.playerId);
  const directChampionBefore = defendingPlayerBefore?.board.find(
    (card) => card?.isDirectDeployedChampion,
  );
  const damageEvent = after.events
    .slice(before.events.length)
    .find((event) => {
      if (
        event.type !== 'DAMAGE_DEALT' ||
        event.source?.type !== 'CARD' ||
        event.source.cardInstanceId !== attackerInstanceId
      ) {
        return false;
      }

      if (target.type === 'WRESTLER') {
        return (
          event.reason === 'COMBAT' &&
          event.target?.type === 'CARD' &&
          event.target.cardInstanceId === target.cardInstanceId
        );
      }

      return directChampionBefore
        ? event.target?.type === 'CARD' &&
            event.target.cardInstanceId === directChampionBefore.instanceId
        : event.target?.type === 'PLAYER' &&
            event.target.playerId === target.playerId;
    });

  if (
    directChampionBefore &&
    directChampionBefore.keywords.includes('DODGE') &&
    Math.max(
      directChampionBefore.dodgeCharges ?? 0,
      directChampionBefore.dodgeAvailable ? 1 : 0,
    ) > 0
  ) {
    return 0;
  }

  return Math.max(0, damageEvent?.amount ?? 0);
}

export default function Home() {
  const [, navigate] = useLocation();
  const isAiMatch = window.location.pathname.endsWith('/ai-match');
  const searchParams = new URLSearchParams(window.location.search);
  const testCardId = searchParams.get('testCardId');
  const testChampionId = searchParams.get('testChampionId');
  const isAdminSource = searchParams.get('source') === 'admin';
  const [isAdminTestMatch, setIsAdminTestMatch] = useState(isAdminSource);
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated' | 'error'>('loading');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const authRequestGeneration = useRef(0);
  const [mediaCatalog, setMediaCatalog] = useState<GameMediaCatalog>(emptyGameMediaCatalog);
  const [gameState, setGameState] = useState<GameState>(() =>
    startGame(createInitialGameState()),
  );
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(
    null,
  );
  const [playError, setPlayError] = useState<string | null>(null);
  const [turnSecondsRemaining, setTurnSecondsRemaining] = useState(
    TURN_TIME_LIMIT_SECONDS,
  );
  const [bgmMuted, setBgmMuted] = useState(readStoredBgmMute);
  const [bgmVolume, setBgmVolume] = useState(readStoredBgmVolume);
  const [playAnimation, setPlayAnimation] = useState<CardPlayAnimationState | null>(null);
  const [attackAnimation, setAttackAnimation] = useState<AttackAnimationState | null>(null);
  const [attackImpactTriggered, setAttackImpactTriggered] = useState(false);
  const [matchReady, setMatchReady] = useState(false);
  const [aiDecks, setAiDecks] = useState<Deck[] | null>(null);
  const [availableAIDecks, setAvailableAIDecks] = useState<AIDeck[] | null>(null);
  const [aiMatchStarted, setAiMatchStarted] = useState(false);
  const [aiMatchData, setAiMatchData] = useState<{
    definitions: CardDefinition[];
    champions: ChampionDefinition[];
    media: GameMediaCatalog;
  } | null>(null);
  const aiActionRunningRef = useRef(false);
  const aiSchedulerGenerationRef = useRef(0);
  const presentationBusyRef = useRef(false);
  const presentationIdleWaitersRef = useRef(new Set<() => void>());
  const [presentationBusy, setPresentationBusy] = useState(false);
  const [matchResultVisible, setMatchResultVisible] = useState(false);
  const turnKey = `${gameState.turn}:${gameState.activePlayerId ?? 'none'}`;
  const turnStartedAtRef = useRef(Date.now());
  const timeoutHandledTurnRef = useRef<string | null>(null);
  const processedAudioEventsRef = useRef(new Set<string>());
  const lastAudioEventCountRef = useRef<number | null>(null);
  const pendingEntranceAudioRef = useRef<{ url: string; volume: number; isLegendary: boolean } | null>(null);
  const processedAttackSoundsRef = useRef(new Set<string>());
  const latestGameStateRef = useRef(gameState);
  const matchReadyRef = useRef(matchReady);
  matchReadyRef.current = matchReady;
  latestGameStateRef.current = gameState;

  useEffect(() => {
    if (!matchReady || gameState.status !== 'IN_PROGRESS') return;

    const guardState = { koMatchNavigationGuard: true };
    window.history.pushState(guardState, '', window.location.href);
    let leaving = false;
    const handlePopState = () => {
      if (leaving) return;
      if (window.confirm('진행 중인 매치에서 나가시겠습니까? 현재 진행 상황이 사라질 수 있습니다.')) {
        leaving = true;
        window.history.back();
      } else {
        window.history.pushState(guardState, '', window.location.href);
      }
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      leaving = true;
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [gameState.status, matchReady]);

  useEffect(() => {
    if (gameState.status !== 'FINISHED') {
      setMatchResultVisible(false);
      return;
    }
    if (presentationBusy) {
      setMatchResultVisible(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setMatchResultVisible(true);
    }, RESULT_SCREEN_SETTLE_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [gameState.events.length, gameState.status, presentationBusy]);

  useEffect(() => {
    if (!matchResultVisible) return;
    audioManager.stopAttack();
    audioManager.stop();
  }, [matchResultVisible]);

  const checkAuthentication = useCallback(() => {
    const generation = ++authRequestGeneration.current;
    setAuthStatus('loading');
    setAuthError(null);
    fetchCurrentUser()
      .then((result) => {
        if (generation !== authRequestGeneration.current) return;
        setAuthUser(result.authenticated ? result.user : null);
        setAuthStatus(result.authenticated && result.user ? 'authenticated' : 'unauthenticated');
      })
      .catch((error) => {
        if (generation !== authRequestGeneration.current) return;
        setAuthUser(null);
        setAuthError(error instanceof Error ? error.message : '인증 상태를 확인하지 못했습니다.');
        setAuthStatus('error');
      });
  }, []);

  useEffect(() => {
    checkAuthentication();
    return () => {
      authRequestGeneration.current += 1;
    };
  }, [checkAuthentication]);

  useEffect(() => {
    let cancelled = false;
    if (
      authStatus !== 'authenticated' ||
      ((testCardId || testChampionId || isAdminSource) && authUser?.role !== 'ADMIN')
    ) {
      setMatchReady(false);
      return () => {
        cancelled = true;
      };
    }
    if (isAiMatch) {
      setMatchReady(false);
      setAiMatchStarted(false);
      setAiDecks(null);
      setAvailableAIDecks(null);
      Promise.all([
        fetchDecks(),
        fetchAIDecks(isAdminSource ? searchParams.get("aiDeckId") : undefined),
        isAdminSource ? fetchAiTestCardDefinitions() : fetchPublishedCardDefinitions(),
        isAdminSource ? fetchAiTestChampions() : fetchPublishedChampions(),
        fetchGameMedia(),
      ]).then(([decks, aiDeckResult, definitions, champions, media]) => {
        if (cancelled) return;
        setAiDecks(decks);
        setAvailableAIDecks(aiDeckResult.decks);
        setAiMatchData({ definitions, champions, media });
        setMediaCatalog(media);
        setRuntimeCardDefinitions(definitions);
        preloadMatchAssets(definitions, champions);
        setPlayError(null);
      }).catch((reason) => {
        if (cancelled) return;
        setAiDecks([]);
        setAiMatchData(null);
        setPlayError(reason instanceof Error ? reason.message : 'AI 매치 데이터를 불러오지 못했습니다.');
      });
      return () => { cancelled = true; };
    }
    if (!testCardId && !testChampionId && !isAdminSource) {
      setMatchReady(false);
      return () => {
        cancelled = true;
      };
    }
    if (testCardId) {
      Promise.all([
        fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/admin/cards/${encodeURIComponent(testCardId)}/test`, {
          credentials: 'include',
        }).then(async (response) => {
          if (!response.ok) throw new Error('관리자 테스트 카드를 불러오지 못했습니다.');
          return (await response.json()) as { card: Parameters<typeof cardRecordToDefinition>[0] };
        }),
        fetchGameMedia(),
      ]).then(([{ card }, media]) => {
          if (cancelled) return;
          const definition = cardRecordToDefinition(card);
          setMediaCatalog(media);
          setRuntimeCardDefinitions([definition]);
          preloadMatchAssets([definition], []);
          setGameState(startGame(createInitialGameState(undefined, [definition]), undefined, media));
          setIsAdminTestMatch(true);
          setSelectedCardId(null);
          setSelectedAttackerId(null);
           setPlayError(null);
           setMatchReady(true);
        })
        .catch(() => {
          if (!cancelled) {
            setPlayError('관리자 테스트 카드를 불러오지 못했습니다.');
             setRuntimeCardDefinitions([]);
             setMatchReady(false);
          }
        });
      return () => { cancelled = true; };
    }
    if (testChampionId) {
      Promise.all([
        fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/admin/champions/${encodeURIComponent(testChampionId)}/test`, {
          credentials: 'include',
        }).then(async (response) => {
          if (!response.ok) throw new Error('관리자 테스트 챔피언을 불러오지 못했습니다.');
          return (await response.json()) as { champion: Parameters<typeof championRecordToDefinition>[0] };
        }),
        fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/admin/cards`, {
          credentials: 'include',
        }).then(async (response) => {
          if (!response.ok) throw new Error('테스트용 카드 데이터를 불러오지 못했습니다.');
          return (await response.json()) as { cards: Array<Parameters<typeof cardRecordToDefinition>[0]> };
        }),
        fetchPublishedChampions(),
        fetchGameMedia(),
      ]).then(([{ champion }, { cards }, publishedChampions, media]) => {
        if (cancelled) return;
        const testChampion = championRecordToDefinition(champion);
        const opponent = publishedChampions.find((item) => item.id !== testChampion.id) ?? publishedChampions[0];
        if (!opponent) throw new Error('테스트용 상대 챔피언이 없습니다.');
        const runtimeDefinitions = cards
          .filter((card) => card.status !== 'DISABLED')
          .map(cardRecordToDefinition);
        if (runtimeDefinitions.length === 0) throw new Error('테스트용 카드가 없습니다.');
        setMediaCatalog(media);
        setRuntimeCardDefinitions(runtimeDefinitions);
        preloadMatchAssets(runtimeDefinitions, [testChampion, opponent]);
        setGameState(startGame(
          createInitialGameState(
            [testChampion.id, opponent.id],
            runtimeDefinitions,
            [testChampion, opponent],
          ),
          undefined,
          media,
        ));
        setIsAdminTestMatch(true);
        setSelectedCardId(null);
        setSelectedAttackerId(null);
        setPlayError(null);
        setMatchReady(true);
      }).catch(() => {
        if (!cancelled) {
          setPlayError('관리자 테스트 챔피언과 게임 데이터를 불러오지 못했습니다.');
          setRuntimeCardDefinitions([]);
          setMatchReady(false);
        }
      });
      return () => { cancelled = true; };
    }
    Promise.all([
      fetchPublishedWrestlerCards(),
      fetchPublishedCardDefinitions(),
      fetchPublishedChampions(),
      fetchGameMedia(),
    ])
      .then(([definitions, publishedDefinitions, champions, media]) => {
        if (cancelled) return;
        if (definitions.length === 0) {
          setPlayError('공개된 카드가 없어 게임을 시작할 수 없습니다.');
          setRuntimeCardDefinitions([]);
          setMatchReady(false);
          return;
        }
        if (champions.length < 2) {
          setPlayError('공개된 챔피언이 2명 이상 필요해 게임을 시작할 수 없습니다.');
          setRuntimeCardDefinitions([]);
          setMatchReady(false);
          return;
        }
        setMediaCatalog(media);
        const runtimeDefinitions = publishedDefinitions;
        setRuntimeCardDefinitions(runtimeDefinitions);
        preloadMatchAssets(runtimeDefinitions, champions);
        const selected = champions.length >= 2
          ? [champions[0]!.id, champions[1]!.id] as [string, string]
          : undefined;
        setGameState(startGame(createInitialGameState(selected, runtimeDefinitions,
          selected ? champions : undefined), undefined, media));
        setSelectedCardId(null);
        setSelectedAttackerId(null);
        setPlayError(null);
        setMatchReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setPlayError('공개 카드와 게임 데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
          setRuntimeCardDefinitions([]);
          setMatchReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, authUser?.role, isAdminSource, isAiMatch, testCardId, testChampionId]);

  function startAiMatch(deckId: string) {
    const deck = aiDecks?.find((candidate) => candidate.id === deckId);
    const data = aiMatchData;
    if (!deck?.isValid || !deck.championDefinitionId || !data) return;
    const matchId = createLocalAIMatchId();
    const aiDeck = selectAIOpponentDeck(availableAIDecks ?? [], matchId);
    if (!aiDeck) {
      setPlayError('사용 가능한 AI 덱이 없습니다.');
      return;
    }
    const userChampion = data.champions.find((champion) => champion.id === deck.championDefinitionId);
    const aiChampion = data.champions.find((champion) => champion.id === aiDeck.championDefinitionId);
    const aiDeckDefinitionIds = aiDeck.cardDefinitionIds;
    const neededCardIds = new Set([...deck.cardDefinitionIds, ...aiDeckDefinitionIds]);
    const collectReferences = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collectReferences);
        return;
      }
      if (!value || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      for (const key of ["cardDefinitionId", "championTokenDefinitionId"]) {
        if (typeof record[key] === "string") neededCardIds.add(record[key]);
      }
      Object.values(record).forEach(collectReferences);
    };
    data.definitions.forEach((definition) => {
      if (neededCardIds.has(definition.id)) collectReferences(definition.effectConfig);
    });
    for (const champion of data.champions) {
      if (champion.id === deck.championDefinitionId || champion.id === aiDeck.championDefinitionId) {
        if (champion.championTokenDefinitionId) neededCardIds.add(champion.championTokenDefinitionId);
      }
    }
    const matchDefinitions = data.definitions.filter(
      (definition) => definition.status === "PUBLISHED" || neededCardIds.has(definition.id),
    );
    const matchChampions = data.champions.filter(
      (champion) =>
        champion.status === "PUBLISHED" ||
        champion.id === deck.championDefinitionId ||
        champion.id === aiDeck.championDefinitionId,
    );
    if (!userChampion || !aiChampion || deck.cardDefinitionIds.length < 20 || aiDeckDefinitionIds.length < 20) {
      setPlayError('AI 매치를 시작할 수 있는 공개 카드와 Champion이 부족합니다.');
      return;
    }
    const nextState = startGame(
      createInitialGameState(
        [userChampion.id, aiChampion.id],
         matchDefinitions,
         matchChampions,
        [deck.cardDefinitionIds, aiDeckDefinitionIds],
        { gameId: matchId, randomSeed: seedForAIMatch(matchId) },
      ),
      createDeterministicRandom(matchId),
      data.media,
    );
    setGameState(nextState);
    setMediaCatalog(data.media);
    setSelectedCardId(null);
    setSelectedAttackerId(null);
    setPlayError(null);
    setAiMatchStarted(true);
    setMatchReady(true);
  }

  useEffect(() => {
    if (
      !isAiMatch ||
      !aiMatchStarted ||
      !matchReady ||
      gameState.status !== 'IN_PROGRESS' ||
      gameState.activePlayerId !== gameState.players[1]?.id ||
      aiActionRunningRef.current
    ) {
      return;
    }

    let cancelled = false;
    const schedulerGeneration = aiSchedulerGenerationRef.current + 1;
    aiSchedulerGenerationRef.current = schedulerGeneration;
    aiActionRunningRef.current = true;
    const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
    const waitForPresentationIdle = () => {
      if (!presentationBusyRef.current) return Promise.resolve();
      return new Promise<void>((resolve) => {
        presentationIdleWaitersRef.current.add(resolve);
      });
    };

    void runAITurn(gameState, gameState.players[1]!.id, {
      wait,
      waitForPresentationIdle,
      isCancelled: () => cancelled || aiSchedulerGenerationRef.current !== schedulerGeneration,
      onState: setGameState,
    }).finally(() => {
      if (aiSchedulerGenerationRef.current === schedulerGeneration) {
        aiActionRunningRef.current = false;
      }
    });

    return () => {
      cancelled = true;
      if (aiSchedulerGenerationRef.current === schedulerGeneration) {
        aiActionRunningRef.current = false;
      }
    };
  }, [gameState.activePlayerId, gameState.status, isAiMatch, aiMatchStarted, matchReady]);

  useEffect(() => {
    if (!matchReady || (isAiMatch && !aiMatchStarted)) {
      audioManager.stopGameAudio();
      return;
    }
    const bgm = mediaCatalog.bgms.find((item) => item.id === gameState.bgmId);
    if (bgm) {
      audioManager.playBgm(bgm.assetUrl, bgm.volume);
    } else {
      audioManager.stopBgm();
    }
  }, [gameState.bgmId, mediaCatalog.bgms, isAiMatch, aiMatchStarted, matchReady]);

  useEffect(() => {
    const latestChampion = gameState.players
      .map((player) => player.champion)
      .find((champion) => champion?.id === gameState.latestQuestCompletedChampionId);
    if (latestChampion?.questCompleteAudioEnabled && latestChampion.questCompleteAudioUrl) {
      audioManager.playQuestComplete(
        latestChampion.questCompleteAudioUrl,
        latestChampion.questCompleteAudioVolume ?? 100,
      );
    }
  }, [gameState.latestQuestCompletedChampionId, gameState.players]);

  useEffect(() => {
    audioManager.setBgmVolume(bgmVolume);
    audioManager.setBgmMuted(bgmMuted);
    try {
      window.localStorage.setItem(BGM_MUTE_STORAGE_KEY, String(bgmMuted));
      window.localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(bgmVolume));
    } catch {
      // Audio preference persistence is optional and must not affect gameplay.
    }
  }, [bgmMuted, bgmVolume]);

  useEffect(() => () => {
    if (matchReadyRef.current) audioManager.stopGameAudio();
    for (const resolve of presentationIdleWaitersRef.current) resolve();
    presentationIdleWaitersRef.current.clear();
  }, []);

  useEffect(() => {
    if (gameState.status === "FINISHED") {
      audioManager.stopGameAudio();
    }
  }, [gameState.status]);

  useEffect(() => {
    if (lastAudioEventCountRef.current === null) {
      lastAudioEventCountRef.current = gameState.events.length;
      return;
    }
    if (gameState.events.length < lastAudioEventCountRef.current) {
      processedAudioEventsRef.current.clear();
    }
    const startIndex = gameState.events.length < lastAudioEventCountRef.current
      ? 0
      : lastAudioEventCountRef.current;
    gameState.events.slice(startIndex).forEach((event, offset) => {
      const eventIndex = startIndex + offset;
      const eventKey = `${eventIndex}:${event.type}:${event.cardInstanceId ?? ""}:${event.championId ?? ""}`;
      if (processedAudioEventsRef.current.has(eventKey)) return;
      processedAudioEventsRef.current.add(eventKey);
      if (event.type === "ENTER_FIELD" && event.cardInstanceId) {
        const card = gameState.players.flatMap((player) => [
          ...player.deck,
          ...player.hand,
          ...player.board.filter((entry): entry is NonNullable<typeof entry> => entry !== null),
          ...player.graveyard,
          ...player.removedFromGame,
        ]).find((entry) => entry.instanceId === event.cardInstanceId);
        if (card?.entranceAudioEnabled && card.entranceAudioUrl) {
          const entranceAudio = {
            url: card.entranceAudioUrl,
            volume: card.entranceAudioVolume ?? 100,
            isLegendary: getCardDefinition(card.definitionId)?.rarity === 'LEGENDARY',
          };
          if (playAnimation?.kind === "WRESTLER" && playAnimation.card.instanceId === event.cardInstanceId) {
            pendingEntranceAudioRef.current = entranceAudio;
          } else {
            if (entranceAudio.isLegendary) {
              audioManager.playLegendaryEntrance(entranceAudio.url, entranceAudio.volume);
            } else {
              audioManager.playCardEntrance(entranceAudio.url, entranceAudio.volume);
            }
          }
        }
      }
    });
    lastAudioEventCountRef.current = gameState.events.length;
  }, [gameState.events, playAnimation]);

  function handlePlayAnimationComplete() {
    const pendingAudio = pendingEntranceAudioRef.current;
    if (pendingAudio) {
      if (pendingAudio.isLegendary) {
        audioManager.playLegendaryEntrance(pendingAudio.url, pendingAudio.volume);
      } else {
        audioManager.playCardEntrance(pendingAudio.url, pendingAudio.volume);
      }
      pendingEntranceAudioRef.current = null;
    }
    window.setTimeout(() => setPlayAnimation(null), ENTRANCE_EFFECT_DELAY_MS);
  }

  useEffect(() => {
    if (!playError) return;
    const timeoutId = window.setTimeout(() => setPlayError(null), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [playError]);

  useEffect(() => {
    if (gameState.status !== 'IN_PROGRESS') {
      setTurnSecondsRemaining(0);
      return;
    }

    turnStartedAtRef.current = Date.now();
    timeoutHandledTurnRef.current = null;
    setTurnSecondsRemaining(TURN_TIME_LIMIT_SECONDS);

    const intervalId = window.setInterval(() => {
      const elapsedSeconds = Math.floor(
        (Date.now() - turnStartedAtRef.current) / 1000,
      );
      const secondsRemaining = Math.max(
        0,
        TURN_TIME_LIMIT_SECONDS - elapsedSeconds,
      );
      setTurnSecondsRemaining(secondsRemaining);

      if (
        secondsRemaining === 0 &&
        timeoutHandledTurnRef.current !== turnKey
      ) {
        handleEndTurn(true);
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [turnKey, gameState.status, matchReady]);

  function handleEndTurn(isTimeout = false) {
    const currentState = latestGameStateRef.current;
    if (!matchReady || currentState.status !== 'IN_PROGRESS') return;
    if (!isTimeout && (playAnimation || attackAnimation)) return;
    const actingPlayerId = isTimeout
      ? currentState.activePlayerId
      : currentState.players[0]?.id;
    if (!actingPlayerId) return;
    const result = endTurn(currentState, actingPlayerId);
    if (!result.success) {
      setPlayError(result.message);
      return;
    }

    if (isAiMatch && aiMatchStarted) {
      if (!isTimeout) {
        timeoutHandledTurnRef.current = turnKey;
      }
      if (isTimeout) timeoutHandledTurnRef.current = turnKey;
      setGameState(result.state);
      setSelectedCardId(null);
      setSelectedAttackerId(null);
      setPlayError(isTimeout ? '시간 초과로 턴이 자동 종료되었습니다.' : null);
      return;
    }

    // A turn-end effect may finish the match before the admin shortcut
    // advances the opponent. Commit that terminal state instead of asking
    // the turn engine to advance a finished match.
    if (result.state.status !== 'IN_PROGRESS') {
      timeoutHandledTurnRef.current = turnKey;
      setGameState(result.state);
      setSelectedCardId(null);
      setSelectedAttackerId(null);
      setPlayError(isTimeout ? '시간 초과로 턴이 자동 종료되었습니다.' : null);
      return;
    }

    // 관리자 테스트 게임에서는 상대 턴을 즉시 종료해 플레이어 1의 다음 턴으로 돌아온다.
    const opponentId = currentState.players[1].id;
    const opponentTurnResult = endTurn(result.state, opponentId);
    if (!opponentTurnResult.success) {
      setPlayError(opponentTurnResult.message);
      return;
    }

    // 수동/자동 종료 모두 실제 전환이 성공한 뒤에만 같은 턴의 재시도를 막는다.
    timeoutHandledTurnRef.current = turnKey;

    setGameState(opponentTurnResult.state);
    setSelectedCardId(null);
    setSelectedAttackerId(null);
    setPlayError(
      isTimeout ? '시간 초과로 턴이 자동 종료되었습니다.' : null,
    );
  }

  function handleSurrender() {
    if (!matchReady || gameState.status !== 'IN_PROGRESS' || playAnimation || attackAnimation) return;
    const result = surrender(gameState, gameState.players[0].id);
    if (!result.success) {
      setPlayError(result.message);
      return;
    }

    setGameState(result.state);
    setSelectedCardId(null);
    setSelectedAttackerId(null);
    setPlayError(null);
  }

  function handleSelectCard(cardInstanceId: string) {
    if (!matchReady || gameState.status !== 'IN_PROGRESS' || playAnimation || attackAnimation) return;
    if (gameState.targetingState?.active) {
      if (gameState.targetingState.validTargetIds.includes(cardInstanceId)) {
        return handleEffectTarget(cardInstanceId);
      }
      return;
    }
    setSelectedAttackerId(null);
    setSelectedCardId((current) =>
      current === cardInstanceId ? null : cardInstanceId,
    );
    setPlayError(null);
  }

  function handleSelectAttacker(cardInstanceId: string) {
    if (!matchReady || gameState.status !== 'IN_PROGRESS' || playAnimation || attackAnimation) return;
    if (gameState.targetingState?.active) {
      if (gameState.targetingState.validTargetIds.includes(cardInstanceId)) {
        handleEffectTarget(cardInstanceId);
      }
      return;
    }
    setSelectedCardId(null);
    setSelectedAttackerId((current) =>
      current === cardInstanceId ? null : cardInstanceId,
    );
    setPlayError(null);
  }

  function playAttackSound(animation: Pick<AttackAnimationState, "currentAttack" | "impactLevel" | "soundKey">) {
    if (processedAttackSoundsRef.current.has(animation.soundKey)) return;
    processedAttackSoundsRef.current.add(animation.soundKey);
    const sound = mediaCatalog.attackSounds[animation.impactLevel === "LIGHT"
      ? "LIGHT_ATTACK"
      : animation.impactLevel === "NORMAL"
        ? "NORMAL_ATTACK"
        : animation.impactLevel === "HEAVY"
          ? "HEAVY_ATTACK"
          : "VERY_HEAVY_ATTACK"];
    if (sound) {
      audioManager.playAttack(
        sound.assetUrl,
        sound.volume,
        attackSoundPitch(animation.currentAttack),
      );
    }
  }

  function handleAttackWrestler(
    targetCardInstanceId: string,
    geometry?: AttackAnimationState["geometry"],
  ) {
    if (!matchReady || gameState.status !== 'IN_PROGRESS' || playAnimation || attackAnimation) return;
    if (gameState.targetingState?.active) {
      handleEffectTarget(targetCardInstanceId);
      return;
    }
    if (!selectedAttackerId) {
      setPlayError('먼저 공격할 선수를 선택하세요.');
      return;
    }

    const result = attack(
      gameState,
      gameState.players[0].id,
      selectedAttackerId,
      {
        type: 'WRESTLER',
        playerId: gameState.players[1].id,
        cardInstanceId: targetCardInstanceId,
      },
    );
    if (!result.success) {
      setPlayError(result.message);
      return;
    }

    const attacker = gameState.players[0].board.find(
      (card) => card?.instanceId === selectedAttackerId,
    );
    const target = gameState.players[1].board.find(
      (card) => card?.instanceId === targetCardInstanceId,
    );
    const attackTarget: AttackTarget = {
      type: 'WRESTLER',
      playerId: gameState.players[1].id,
      cardInstanceId: targetCardInstanceId,
    };
    const attackEventIndex = result.state.events.findIndex(
      (event, index) =>
        index >= gameState.events.length &&
        event.type === "ATTACK_DECLARED" &&
        event.cardInstanceId === selectedAttackerId,
    );
    const currentAttack = attacker?.currentAttack ?? 0;
    const damage = actualAttackDamage(
      gameState,
      result.state,
      gameState.players[0].id,
      selectedAttackerId,
      attackTarget,
    );
    const animation: AttackAnimationState | null = attacker && geometry
      ? {
          attacker,
          target: target ?? null,
          targetKind: "CARD",
          geometry,
          currentAttack,
          impactLevel: attackImpactLevel(currentAttack),
          damage,
          damageImpactLevel: attackDamageImpactLevel(damage),
          soundKey: `${attackEventIndex}:${selectedAttackerId}:${targetCardInstanceId}`,
        }
      : null;
    setGameState(result.state);
    setAttackImpactTriggered(false);
    setAttackAnimation(animation);
    if (!animation) {
      playAttackSound({
        currentAttack,
        impactLevel: attackImpactLevel(currentAttack),
        soundKey: `${attackEventIndex}:${selectedAttackerId}:${targetCardInstanceId}`,
      });
    }
    setSelectedAttackerId(null);
    setPlayError(null);
  }
  function handleEffectTarget(targetId: string) {
    if (!matchReady || gameState.status !== 'IN_PROGRESS') return;
    if (!gameState.targetingState?.active || !gameState.targetingState.validTargetIds.includes(targetId)) {
      setPlayError('선택할 수 없는 대상입니다.');
      return;
    }
    const before = gameState;
    const next = before.targetingState?.phase === 'PRE_COMMIT'
      ? executeAction(before, { type: 'CONFIRM_PRECOMMIT_TARGET', playerId: before.players[0].id, targetId }).state
      : processChampionQuestEvents(before, selectEffectTarget(before, targetId));
    if (next === before) {
      setPlayError('선택할 수 없는 대상입니다.');
      return;
    }
    setGameState(next);
    setPlayError(null);
  }
  function handleCancelEffectTargeting() {
    if (gameState.status !== 'IN_PROGRESS') return;
    const next = cancelEffectTargeting(gameState);
    if (next === gameState) return;
    setGameState(next);
    setPlayError(null);
  }

  function handleAttackPlayer(geometry?: AttackAnimationState["geometry"]) {
    if (!matchReady || gameState.status !== 'IN_PROGRESS' || playAnimation || attackAnimation) return;
    if (gameState.targetingState?.active) {
      handleEffectTarget(gameState.players[1].id);
      return;
    }
    if (!selectedAttackerId) {
      setPlayError('먼저 공격할 선수를 선택하세요.');
      return;
    }

    const attackTarget: AttackTarget = {
      type: 'PLAYER',
      playerId: gameState.players[1].id,
    };
    const result = attack(
      gameState,
      gameState.players[0].id,
      selectedAttackerId,
      attackTarget,
    );
    if (!result.success) {
      setPlayError(result.message);
      return;
    }

    const attacker = gameState.players[0].board.find(
      (card) => card?.instanceId === selectedAttackerId,
    );
    const attackEventIndex = result.state.events.findIndex(
      (event, index) =>
        index >= gameState.events.length &&
        event.type === "ATTACK_DECLARED" &&
        event.cardInstanceId === selectedAttackerId,
    );
    const currentAttack = attacker?.currentAttack ?? 0;
    const damage = actualAttackDamage(
      gameState,
      result.state,
      gameState.players[0].id,
      selectedAttackerId,
      attackTarget,
    );
    const animation: AttackAnimationState | null = attacker && geometry
      ? {
          attacker,
          target: null,
          targetKind: "CHAMPION",
          geometry,
          currentAttack,
          impactLevel: attackImpactLevel(currentAttack),
          damage,
          damageImpactLevel: attackDamageImpactLevel(damage),
          soundKey: `${attackEventIndex}:${selectedAttackerId}:${gameState.players[1].id}`,
        }
      : null;
    setGameState(result.state);
    setAttackImpactTriggered(false);
    setAttackAnimation(animation);
    if (!animation) {
      playAttackSound({
        currentAttack,
        impactLevel: attackImpactLevel(currentAttack),
        soundKey: `${attackEventIndex}:${selectedAttackerId}:${gameState.players[1].id}`,
      });
    }
    setSelectedAttackerId(null);
    setPlayError(null);
  }

  function handleAttackImpact() {
    if (!attackAnimation) return;
    setAttackImpactTriggered(true);
    playAttackSound(attackAnimation);
  }

  function handleOpponentAttackPresentation(animation: AttackAnimationState) {
    if (attackAnimation || playAnimation) return;
    setAttackImpactTriggered(false);
    setAttackAnimation(animation);
  }

  function handleAttackAnimationComplete() {
    setAttackAnimation(null);
    setAttackImpactTriggered(false);
  }

  const handlePresentationBusyChange = useCallback((busy: boolean) => {
    presentationBusyRef.current = busy;
    setPresentationBusy(busy);
    if (!busy) {
      for (const resolve of presentationIdleWaitersRef.current) resolve();
      presentationIdleWaitersRef.current.clear();
    }
  }, []);

  function handleSelectSlot(slot: BoardSlot, geometry?: CardPlayGeometry) {
    if (!matchReady || gameState.status !== 'IN_PROGRESS' || playAnimation || attackAnimation) return;
    if (!selectedCardId) {
      setPlayError('먼저 손패에서 선수를 선택하세요.');
      return;
    }
    const result = playWrestlerFromHand(
      gameState,
      gameState.players[0].id,
      selectedCardId,
      slot,
    );
    if (!result.success) {
      setPlayError(result.message);
      return;
    }

    const card = gameState.players[0].hand.find((entry) => entry.instanceId === selectedCardId);
    if (card && geometry) {
      setGameState(result.state);
      setPlayAnimation({
        kind: "WRESTLER",
        card,
        geometry: { source: geometry.source, target: geometry.target! },
        impactLevel: landingImpactLevel(card.baseCost, card.currentCost),
      });
    } else {
      setGameState(result.state);
    }
    setSelectedCardId(null);
    setPlayError(null);
  }

  function handleUseTechnique(cardInstanceId: string, source: CardPlayGeometry["source"]) {
    if (!matchReady || gameState.status !== 'IN_PROGRESS' || playAnimation || attackAnimation) return;
    const card = gameState.players[0].hand.find((entry) => entry.instanceId === cardInstanceId);
    if (!card) return;
    const result = executeAction(gameState, {
      type: 'BEGIN_TARGETED_ACTION',
      playerId: gameState.players[0].id,
      action: { type: 'PLAY_TECHNIQUE', cardInstanceId },
    });
    if (!result.success) {
      setPlayError(result.message);
      return;
    }
    setGameState(result.state);
    setSelectedCardId(null);
    setPlayError(null);
  }

  function handleUseActive(cardInstanceId?: string) {
    if (!matchReady || gameState.status !== 'IN_PROGRESS' || playAnimation || attackAnimation) return;
    const targetCardInstanceId = cardInstanceId ?? selectedAttackerId;
    if (!targetCardInstanceId) return;
    const result = executeAction(gameState, {
      type: 'BEGIN_TARGETED_ACTION',
      playerId: gameState.players[0].id,
      action: { type: 'USE_ACTIVE', cardInstanceId: targetCardInstanceId },
    });
    if (!result.success) {
      setPlayError(result.message);
      return;
    }
    setGameState(result.state);
    setPlayError(null);
  }

  function handleUseChampionAbility() {
    if (!matchReady || gameState.status !== 'IN_PROGRESS' || playAnimation || attackAnimation) return;
    const result = executeAction(gameState, {
      type: 'BEGIN_TARGETED_ACTION',
      playerId: gameState.players[0].id,
      action: { type: 'USE_CHAMPION_ABILITY' },
    });
    if (!result.success) {
      setPlayError(result.message);
      return;
    }
    setGameState(result.state);
    setPlayError(null);
  }

  async function handleLogout() {
    await logout();
    setAuthUser(null);
    setAuthStatus('unauthenticated');
    setMatchReady(false);
  }

  if (authStatus === 'loading') {
    return <AuthLoading />;
  }

  if (authStatus === 'error') {
    return <AuthRecovery message={authError ?? undefined} onRetry={checkAuthentication} />;
  }

  if (authStatus === 'unauthenticated') {
    return (
      <AuthPage
        onAuthenticated={(user) => {
          setAuthUser(user);
          setAuthError(null);
          setAuthStatus('authenticated');
        }}
      />
    );
  }

  if ((testCardId || testChampionId || isAdminSource) && authUser?.role !== 'ADMIN') {
    return (
      <main className="ko-auth-screen flex min-h-screen items-center justify-center px-5 text-white">
        <section className="w-full max-w-sm text-center">
          <p className="font-display text-xs font-bold tracking-[0.45em] text-amber-400">KO</p>
          <h1 className="mt-4 text-xl font-black">관리자 권한이 필요합니다</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-500">
            이 테스트 게임은 관리자 계정으로 로그인한 경우에만 열 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => {
               navigate(ROUTES.MAIN_MENU);
            }}
            className="mt-7 rounded bg-amber-400 px-5 py-3 text-sm font-black text-black hover:bg-amber-300"
          >
            메인 메뉴로
          </button>
        </section>
      </main>
    );
  }

  if (!testCardId && !testChampionId && !isAdminSource && !isAiMatch) {
    return (
      <MainMenu
        user={authUser ?? undefined}
        onLogout={handleLogout}
        onAiMatch={() => navigate(ROUTES.AI_MATCH)}
        onDeckEdit={() => {
          navigate(ROUTES.DECKS);
        }}
      />
    );
  }

  if (isAiMatch && !aiMatchStarted) {
    return (
      <AiMatchSetup
        decks={aiDecks}
        aiDecks={availableAIDecks}
        error={playError}
        onStart={startAiMatch}
        onBack={() => navigate(ROUTES.MAIN_MENU)}
      />
    );
  }

  if (!matchReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080808] px-6 text-white">
        <section className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950/95 p-8 text-center shadow-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-amber-400">KO</p>
          <h1 className="text-xl font-black">게임을 준비하는 중입니다</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            {playError ?? '공개 카드와 게임 데이터를 불러오고 있습니다.'}
          </p>
          {playError && (
            <button
              type="button"
              onClick={() => {
                setPlayError(null);
                setMatchReady(false);
                navigate(isAiMatch ? `${ROUTES.AI_MATCH}${window.location.search}` : ROUTES.MAIN_MENU);
              }}
              className="mt-6 rounded-lg bg-amber-400 px-5 py-3 text-sm font-black text-black transition hover:bg-amber-300"
            >
              다시 시도
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <>
      {isAdminTestMatch && <div className="fixed left-1/2 top-2 z-[100] -translate-x-1/2 rounded border border-amber-600 bg-amber-950 px-3 py-1 text-xs font-bold text-amber-200">관리자 DRAFT 테스트 게임 · 공개 카드에는 영향을 주지 않습니다.</div>}
    <GameStatePreview
      state={gameState}
      selectedCardId={selectedCardId}
      selectedAttackerId={selectedAttackerId}
      mediaCatalog={mediaCatalog}
      playError={playError}
      turnSecondsRemaining={turnSecondsRemaining}
      onEndTurn={handleEndTurn}
      canEndTurn={Boolean(
        gameState.activePlayerId === gameState.players[0].id &&
        !gameState.targetingState?.active &&
        !playAnimation &&
        !attackAnimation,
      )}
      bgmMuted={bgmMuted}
      onBgmMutedChange={setBgmMuted}
      bgmVolume={bgmVolume}
      onBgmVolumeChange={setBgmVolume}
      onSurrender={handleSurrender}
      onSelectCard={handleSelectCard}
      onSelectSlot={handleSelectSlot}
      onUseTechnique={handleUseTechnique}
      playAnimation={playAnimation}
      onPlayAnimationComplete={handlePlayAnimationComplete}
      attackAnimation={attackAnimation}
      attackImpactTriggered={attackImpactTriggered}
      onAttackImpact={handleAttackImpact}
      onAttackAnimationComplete={handleAttackAnimationComplete}
      onSelectAttacker={handleSelectAttacker}
      onAttackWrestler={handleAttackWrestler}
      onAttackPlayer={handleAttackPlayer}
      onOpponentAttackPresentation={handleOpponentAttackPresentation}
      onUseActive={handleUseActive}
      onUseChampionAbility={handleUseChampionAbility}
      onCancelEffectTargeting={handleCancelEffectTargeting}
      onEffectTarget={handleEffectTarget}
       onPresentationBusyChange={handlePresentationBusyChange}
      onReturnToAdmin={isAdminTestMatch ? () => {
        navigate(ROUTES.ADMIN);
      } : undefined}
    />
     {matchResultVisible && (
       <MatchResultOverlay
         state={gameState}
         onReturnToMainMenu={() => navigate(ROUTES.MAIN_MENU)}
       />
     )}
    </>
  );
}
