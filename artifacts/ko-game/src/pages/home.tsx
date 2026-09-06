import { useEffect, useRef, useState } from 'react';

import {
  attack,
  createInitialGameState,
  endTurn,
  playWrestlerFromHand,
  startGame,
  useActiveAbility,
  useChampionAbility,
  type BoardSlot,
  type GameState,
  fetchPublishedWrestlerCards,
  setRuntimeCardDefinitions,
} from '@/game';
import { GameStatePreview } from '@/components/game-state-preview';

const TURN_TIME_LIMIT_SECONDS = 90;

export default function Home() {
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
  }, []);

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
    setSelectedAttackerId(null);
    setSelectedCardId((current) =>
      current === cardInstanceId ? null : cardInstanceId,
    );
    setPlayError(null);
  }

  function handleSelectAttacker(cardInstanceId: string) {
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

  function handleAttackPlayer() {
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
      onAttackWrestler={handleAttackWrestler}
      onAttackPlayer={handleAttackPlayer}
      onUseActive={handleUseActive}
      onUseChampionAbility={handleUseChampionAbility}
    />
  );
}
