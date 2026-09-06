import type { GameEvent } from '../events/types';
import type { GameState } from '../types/game-state';

export function processChampionQuestEvents(
  previousState: GameState,
  nextState: GameState,
): GameState {
  const newEvents = nextState.events.slice(previousState.events.length);
  let resolvedState = nextState;

  for (const originalPlayer of nextState.players) {
    const champion = originalPlayer.champion;
    const quest = champion?.quest;
    if (!champion || !quest || champion.questCompleted) continue;

    const progress = newEvents.filter(
      (event) =>
        event.type === quest.trackedEvent &&
        event.playerId === originalPlayer.id,
    ).length;
    if (progress === 0) continue;

    const questProgress = Math.min(
      champion.questProgress + progress,
      quest.requiredProgress,
    );
    const questCompleted = questProgress >= quest.requiredProgress;
    const rewardGold =
      questCompleted && quest.reward.type === 'GAIN_GOLD'
        ? quest.reward.amount
        : 0;
    const questEvents: GameEvent[] = [
      {
        type: 'CHAMPION_QUEST_PROGRESS',
        playerId: originalPlayer.id,
        championId: champion.id,
        source: { type: 'SYSTEM' },
        target: { type: 'CHAMPION', championId: champion.id },
        reason: quest.id,
        amount: progress,
      },
    ];
    if (questCompleted) {
      questEvents.push({
        type: 'CHAMPION_QUEST_COMPLETED',
        playerId: originalPlayer.id,
        championId: champion.id,
        source: { type: 'SYSTEM' },
        target: { type: 'CHAMPION', championId: champion.id },
        reason: quest.reward.type,
      });
      if (rewardGold > 0) {
        questEvents.push({
          type: 'GOLD_CHANGED',
          playerId: originalPlayer.id,
          championId: champion.id,
          source: { type: 'CHAMPION', championId: champion.id },
          target: { type: 'PLAYER', playerId: originalPlayer.id },
          reason: 'CHAMPION_QUEST_REWARD',
          amount: rewardGold,
        });
      }
    }

    resolvedState = {
      ...resolvedState,
      players: resolvedState.players.map((player) =>
        player.id === originalPlayer.id && player.champion
          ? {
              ...player,
              currentGold: player.currentGold + rewardGold,
              champion: {
                ...player.champion,
                questProgress,
                questCompleted,
              },
            }
          : player,
      ),
      events: [...resolvedState.events, ...questEvents],
    };
  }

  return resolvedState;
}