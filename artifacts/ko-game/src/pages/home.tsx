import { useEffect, useRef, useState } from 'react';

import {
  attack,
  createInitialGameState,
  endTurn,
  surrender,
  playWrestlerFromHand,
  playTechniqueFromHand,
  startGame,
  useActiveAbility,
  useChampionAbility,
  selectEffectTarget,
  cancelEffectTargeting,
  type BoardSlot,
  type AttackTarget,
  type GameState,
  fetchPublishedWrestlerCards,
  fetchPublishedCardDefinitions,
  cardRecordToDefinition,
  setRuntimeCardDefinitions,
  fetchPublishedChampions,
  fetchGameMedia,
  emptyGameMediaCatalog,
  processChampionQuestEvents,
  type GameMediaCatalog,
} from '@/game';
import { GameStatePreview } from '@/components/game-state-preview';
import { audioManager } from '@/audio/audio-manager';
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
const BGM_MUTE_STORAGE_KEY = 'ko-game-bgm-muted';

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

function readStoredBgmMute() {
  try {
    return window.localStorage.getItem(BGM_MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function Home() {
  const testCardId = new URLSearchParams(window.location.search).get('testCardId');
  const [isAdminTestMatch, setIsAdminTestMatch] = useState(false);
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
  const [playAnimation, setPlayAnimation] = useState<CardPlayAnimationState | null>(null);
  const [attackAnimation, setAttackAnimation] = useState<AttackAnimationState | null>(null);
  const [attackImpactTriggered, setAttackImpactTriggered] = useState(false);
  const [matchReady, setMatchReady] = useState(false);
  const turnKey = `${gameState.turn}:${gameState.activePlayerId ?? 'none'}`;
  const turnStartedAtRef = useRef(Date.now());
  const timeoutHandledTurnRef = useRef<string | null>(null);
  const processedAudioEventsRef = useRef(new Set<string>());
  const lastAudioEventCountRef = useRef<number | null>(null);
  const pendingEntranceAudioRef = useRef<{ url: string; volume: number } | null>(null);
  const processedAttackSoundsRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
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
  }, [testCardId]);

  useEffect(() => {
    const bgm = mediaCatalog.bgms.find((item) => item.id === gameState.bgmId);
    if (bgm) {
      audioManager.playBgm(bgm.assetUrl, bgm.volume);
    } else {
      audioManager.stopBgm();
    }
  }, [gameState.bgmId, mediaCatalog.bgms]);

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
    audioManager.setBgmMuted(bgmMuted);
    try {
      window.localStorage.setItem(BGM_MUTE_STORAGE_KEY, String(bgmMuted));
    } catch {
      // Audio preference persistence is optional and must not affect gameplay.
    }
  }, [bgmMuted]);

  useEffect(() => () => {
    audioManager.stopBgm();
  }, []);

  useEffect(() => {
    if (gameState.status === "FINISHED") {
      audioManager.stopBgm();
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
          };
          if (playAnimation?.kind === "WRESTLER" && playAnimation.card.instanceId === event.cardInstanceId) {
            pendingEntranceAudioRef.current = entranceAudio;
          } else {
            audioManager.playCardEntrance(entranceAudio.url, entranceAudio.volume);
          }
        }
      }
    });
    lastAudioEventCountRef.current = gameState.events.length;
  }, [gameState.events, playAnimation]);

  function handlePlayAnimationComplete() {
    const pendingAudio = pendingEntranceAudioRef.current;
    if (pendingAudio) {
      audioManager.playCardEntrance(pendingAudio.url, pendingAudio.volume);
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
        timeoutHandledTurnRef.current = turnKey;
        handleEndTurn(true);
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [turnKey, gameState.status, matchReady]);

  function handleEndTurn(isTimeout = false) {
    if (!matchReady || playAnimation || attackAnimation) return;
    const result = endTurn(gameState, gameState.players[0].id);
    if (!result.success) {
      setPlayError(result.message);
      return;
    }

    // 테스트 중에는 상대 턴을 즉시 종료해 플레이어 1의 다음 턴으로 돌아온다.
    const opponentId = gameState.players[1].id;
    const opponentTurnResult = endTurn(result.state, opponentId);
    if (!opponentTurnResult.success) {
      setPlayError(opponentTurnResult.message);
      return;
    }

    if (!isTimeout) {
      // 수동 종료 직후 타이머 interval이 한 번 더 실행되어
      // 타임아웃 알림을 덮어쓰지 않도록 현재 턴을 처리 완료로 표시한다.
      timeoutHandledTurnRef.current = turnKey;
    }

    setGameState(opponentTurnResult.state);
    setSelectedCardId(null);
    setSelectedAttackerId(null);
    setPlayError(
      isTimeout ? '시간 초과로 턴이 자동 종료되었습니다.' : null,
    );
  }

  function handleSurrender() {
    if (!matchReady || playAnimation || attackAnimation) return;
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
    if (!matchReady || playAnimation || attackAnimation) return;
    if (gameState.targetingState?.active) {
      handleEffectTarget(cardInstanceId);
      setPlayError(null);
      return;
    }
    setSelectedAttackerId(null);
    setSelectedCardId((current) =>
      current === cardInstanceId ? null : cardInstanceId,
    );
    setPlayError(null);
  }

  function handleSelectAttacker(cardInstanceId: string) {
    if (!matchReady || playAnimation || attackAnimation) return;
    if (gameState.targetingState?.active) return handleEffectTarget(cardInstanceId);
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
    if (!matchReady || playAnimation || attackAnimation) return;
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
    const before = gameState;
    const next = processChampionQuestEvents(before, selectEffectTarget(before, targetId));
    if (next === before) {
      setPlayError('이 효과의 대상으로 선택할 수 없습니다.');
      return;
    }
    setGameState(next);
    setPlayError(null);
  }
  function handleCancelEffectTargeting() {
    const next = cancelEffectTargeting(gameState);
    if (next === gameState) return;
    setGameState(next);
    setPlayError(null);
  }

  function handleAttackPlayer(geometry?: AttackAnimationState["geometry"]) {
    if (!matchReady || playAnimation || attackAnimation) return;
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

  function handleAttackAnimationComplete() {
    setAttackAnimation(null);
    setAttackImpactTriggered(false);
  }

  function handleSelectSlot(slot: BoardSlot, geometry?: CardPlayGeometry) {
    if (!matchReady || playAnimation || attackAnimation) return;
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
    if (!matchReady || playAnimation || attackAnimation) return;
    const card = gameState.players[0].hand.find((entry) => entry.instanceId === cardInstanceId);
    if (!card) return;
    const result = playTechniqueFromHand(
      gameState,
      gameState.players[0].id,
      cardInstanceId,
    );
    if (!result.success) {
      setPlayError(result.message);
      return;
    }
    setGameState(result.state);
    setPlayAnimation({
      kind: "TECHNIQUE",
      card,
      geometry: { source },
    });
    setSelectedCardId(null);
    setPlayError(null);
  }

  function handleUseActive(cardInstanceId?: string) {
    if (!matchReady || playAnimation || attackAnimation) return;
    const targetCardInstanceId = cardInstanceId ?? selectedAttackerId;
    if (!targetCardInstanceId) return;
    const result = useActiveAbility(
      gameState,
      gameState.players[0].id,
      targetCardInstanceId,
    );
    if (!result.success) {
      setPlayError(result.message);
      return;
    }
    setGameState(result.state);
    setPlayError(null);
  }

  function handleUseChampionAbility() {
    if (!matchReady || playAnimation || attackAnimation) return;
    const result = useChampionAbility(gameState, gameState.players[0].id);
    if (!result.success) {
      setPlayError(result.message);
      return;
    }
    setGameState(result.state);
    setPlayError(null);
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
              onClick={() => window.location.reload()}
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
      bgmMuted={bgmMuted}
      onBgmMutedChange={setBgmMuted}
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
      onUseActive={handleUseActive}
      onUseChampionAbility={handleUseChampionAbility}
      onCancelEffectTargeting={handleCancelEffectTargeting}
      onEffectTarget={handleEffectTarget}
    />
    </>
  );
}
