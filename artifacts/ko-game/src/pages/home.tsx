import { useEffect, useRef, useState } from 'react';

import {
  attack,
  createInitialGameState,
  endTurn,
  playWrestlerFromHand,
  startGame,
  useActiveAbility,
  useChampionAbility,
  selectEffectTarget,
  cancelEffectTargeting,
  type BoardSlot,
  type GameState,
  fetchPublishedWrestlerCards,
  cardRecordToDefinition,
  setRuntimeCardDefinitions,
} from '@/game';
import { GameStatePreview } from '@/components/game-state-preview';

const TURN_TIME_LIMIT_SECONDS = 90;

export default function Home() {
  const testCardId = new URLSearchParams(window.location.search).get('testCardId');
  const [isAdminTestMatch, setIsAdminTestMatch] = useState(false);
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
  const turnKey = `${gameState.turn}:${gameState.activePlayerId ?? 'none'}`;
  const turnStartedAtRef = useRef(Date.now());
  const timeoutHandledTurnRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (testCardId) {
      fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/admin/cards/${encodeURIComponent(testCardId)}/test`, {
        credentials: 'include',
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('관리자 테스트 카드를 불러오지 못했습니다.');
          return (await response.json()) as { card: Parameters<typeof cardRecordToDefinition>[0] };
        })
        .then(({ card }) => {
          if (cancelled) return;
          const definition = cardRecordToDefinition(card);
          setRuntimeCardDefinitions([definition]);
          setGameState(startGame(createInitialGameState(undefined, [definition])));
          setIsAdminTestMatch(true);
          setSelectedCardId(null);
          setSelectedAttackerId(null);
        })
        .catch(() => {
          if (!cancelled) setPlayError('관리자 테스트 카드를 불러오지 못했습니다.');
        });
      return () => { cancelled = true; };
    }
    fetchPublishedWrestlerCards()
      .then((definitions) => {
        if (cancelled || definitions.length === 0) return;
        setRuntimeCardDefinitions(definitions);
        setGameState(startGame(createInitialGameState(undefined, definitions)));
        setSelectedCardId(null);
        setSelectedAttackerId(null);
      })
      .catch(() => {
        // 공개 카드 조회 실패 시 기존 테스트 덱을 유지한다.
      });
    return () => {
      cancelled = true;
    };
  }, [testCardId]);

  useEffect(() => {
    if (!playError) return;
    const timeoutId = window.setTimeout(() => setPlayError(null), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [playError]);

  useEffect(() => {
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
  }, [turnKey]);

  function handleEndTurn(isTimeout = false) {
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

  function handleSelectCard(cardInstanceId: string) {
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
    if (gameState.targetingState?.active) return handleEffectTarget(cardInstanceId);
    setSelectedCardId(null);
    setSelectedAttackerId((current) =>
      current === cardInstanceId ? null : cardInstanceId,
    );
    setPlayError(null);
  }

  function handleAttackWrestler(targetCardInstanceId: string) {
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

    setGameState(result.state);
    setSelectedAttackerId(null);
    setPlayError(null);
  }
  function handleSelectEffectTarget(targetCardInstanceId: string) {
    if (gameState.targetingState?.active) return handleEffectTarget(targetCardInstanceId);
    handleAttackWrestler(targetCardInstanceId);
  }
  function handleEffectTarget(targetId: string) {
    const before = gameState;
    const next = selectEffectTarget(before, targetId);
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

  function handleAttackPlayer() {
    if (gameState.targetingState?.active) {
      handleEffectTarget(gameState.players[1].id);
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
        type: 'PLAYER',
        playerId: gameState.players[1].id,
      },
    );
    if (!result.success) {
      setPlayError(result.message);
      return;
    }

    setGameState(result.state);
    setSelectedAttackerId(null);
    setPlayError(null);
  }

  function handleSelectSlot(slot: BoardSlot) {
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

    setGameState(result.state);
    setSelectedCardId(null);
    setPlayError(null);
  }

  function handleUseActive() {
    if (!selectedAttackerId) return;
    const result = useActiveAbility(
      gameState,
      gameState.players[0].id,
      selectedAttackerId,
    );
    if (!result.success) {
      setPlayError(result.message);
      return;
    }
    setGameState(result.state);
    setPlayError(null);
  }

  function handleUseChampionAbility() {
    const result = useChampionAbility(gameState, gameState.players[0].id);
    if (!result.success) {
      setPlayError(result.message);
      return;
    }
    setGameState(result.state);
    setPlayError(null);
  }

  return (
    <>
      {isAdminTestMatch && <div className="fixed left-1/2 top-2 z-[100] -translate-x-1/2 rounded border border-amber-600 bg-amber-950 px-3 py-1 text-xs font-bold text-amber-200">관리자 DRAFT 테스트 게임 · 공개 카드에는 영향을 주지 않습니다.</div>}
    <GameStatePreview
      state={gameState}
      selectedCardId={selectedCardId}
      selectedAttackerId={selectedAttackerId}
      playError={playError}
      turnSecondsRemaining={turnSecondsRemaining}
      onEndTurn={handleEndTurn}
      onSelectCard={handleSelectCard}
      onSelectSlot={handleSelectSlot}
      onSelectAttacker={handleSelectAttacker}
      onAttackWrestler={handleSelectEffectTarget}
      onAttackPlayer={handleAttackPlayer}
      onUseActive={handleUseActive}
      onUseChampionAbility={handleUseChampionAbility}
      onCancelEffectTargeting={handleCancelEffectTargeting}
      onEffectTarget={handleEffectTarget}
    />
    </>
  );
}
