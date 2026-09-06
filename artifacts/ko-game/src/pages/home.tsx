import { useEffect, useState } from 'react';

import {
  attack,
  createInitialGameState,
  endTurn,
  playWrestlerFromHand,
  startGame,
  useActiveAbility,
  type BoardSlot,
  type GameState,
} from '@/game';
import { GameStatePreview } from '@/components/game-state-preview';

export default function Home() {
  const [gameState, setGameState] = useState<GameState>(() =>
    startGame(createInitialGameState()),
  );
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedAttackerId, setSelectedAttackerId] = useState<string | null>(
    null,
  );
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    if (!playError) return;
    const timeoutId = window.setTimeout(() => setPlayError(null), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [playError]);

  function handleEndTurn() {
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

    setGameState(opponentTurnResult.state);
    setSelectedCardId(null);
    setSelectedAttackerId(null);
    setPlayError(null);
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

  return (
    <GameStatePreview
      state={gameState}
      selectedCardId={selectedCardId}
      selectedAttackerId={selectedAttackerId}
      playError={playError}
      onEndTurn={handleEndTurn}
      onSelectCard={handleSelectCard}
      onSelectSlot={handleSelectSlot}
      onSelectAttacker={handleSelectAttacker}
      onAttackWrestler={handleAttackWrestler}
      onAttackPlayer={handleAttackPlayer}
      onUseActive={handleUseActive}
    />
  );
}
