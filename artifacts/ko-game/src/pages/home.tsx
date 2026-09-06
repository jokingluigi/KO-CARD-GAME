import { useState } from 'react';

import {
  attack,
  createInitialGameState,
  endTurn,
  playWrestlerFromHand,
  startGame,
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

  function handleEndTurn() {
    if (!gameState.activePlayerId) {
      return;
    }

    setGameState((currentState) =>
      endTurn(currentState, currentState.activePlayerId!),
    );
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

    try {
      setGameState((currentState) =>
        attack(
          currentState,
          currentState.players[0].id,
          selectedAttackerId,
          {
            type: 'WRESTLER',
            playerId: currentState.players[1].id,
            cardInstanceId: targetCardInstanceId,
          },
        ),
      );
      setSelectedAttackerId(null);
      setPlayError(null);
    } catch (error) {
      setPlayError(
        error instanceof Error ? error.message : '공격할 수 없습니다.',
      );
    }
  }

  function handleAttackPlayer() {
    if (!selectedAttackerId) {
      setPlayError('먼저 공격할 선수를 선택하세요.');
      return;
    }

    try {
      setGameState((currentState) =>
        attack(
          currentState,
          currentState.players[0].id,
          selectedAttackerId,
          {
            type: 'PLAYER',
            playerId: currentState.players[1].id,
          },
        ),
      );
      setSelectedAttackerId(null);
      setPlayError(null);
    } catch (error) {
      setPlayError(
        error instanceof Error ? error.message : '공격할 수 없습니다.',
      );
    }
  }

  function handleSelectSlot(slot: BoardSlot) {
    if (!selectedCardId) {
      setPlayError('먼저 손패에서 선수를 선택하세요.');
      return;
    }

    try {
      setGameState((currentState) =>
        playWrestlerFromHand(
          currentState,
          currentState.players[0].id,
          selectedCardId,
          slot,
        ),
      );
      setSelectedCardId(null);
      setPlayError(null);
    } catch (error) {
      setPlayError(
        error instanceof Error ? error.message : '선수를 낼 수 없습니다.',
      );
    }
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
    />
  );
}
