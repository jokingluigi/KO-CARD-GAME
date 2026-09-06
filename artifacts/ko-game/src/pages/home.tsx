import { useState } from 'react';

import {
  createInitialGameState,
  endTurn,
  startGame,
  type GameState,
} from '@/game';
import { GameStatePreview } from '@/components/game-state-preview';

export default function Home() {
  const [gameState, setGameState] = useState<GameState>(() =>
    startGame(createInitialGameState()),
  );

  function handleEndTurn() {
    if (!gameState.activePlayerId) {
      return;
    }

    setGameState((currentState) =>
      endTurn(currentState, currentState.activePlayerId!),
    );
  }

  return (
    <GameStatePreview state={gameState} onEndTurn={handleEndTurn} />
  );
}
