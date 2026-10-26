import { championVoiceLine } from "../game/champions/types";
import type { GameState } from "../game/types/game-state";
export type KoChampionLine = {
  playerId: string;
  speaker: string;
  text: string;
  outcome: "VICTORY" | "DEFEAT";
};
export function koChampionLines(state: GameState): KoChampionLine[] {
  if (
    state.status !== "FINISHED" ||
    !state.winnerId ||
    !state.loserId ||
    state.winnerId === state.loserId
  )
    return [];
  const winner = state.players.find((player) => player.id === state.winnerId);
  const loser = state.players.find((player) => player.id === state.loserId);
  if (!winner || !loser || loser.health > 0) return [];
  return (
    [
      { player: winner, opponent: loser, outcome: "VICTORY" },
      { player: loser, opponent: winner, outcome: "DEFEAT" },
    ] as const
  ).flatMap(({ player, opponent, outcome }) => {
    const text = championVoiceLine(
      player.champion?.presentationLines,
      !!player.champion?.questCompleted,
      outcome,
      opponent.champion?.id,
    );
    return text
      ? [
          {
            playerId: player.id,
            speaker: player.champion?.name ?? "챔피언",
            text,
            outcome,
          },
        ]
      : [];
  });
}
