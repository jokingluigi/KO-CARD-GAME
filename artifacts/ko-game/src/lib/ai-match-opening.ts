import type { MatchIntroPlayer } from "../components/online-match-intro";
import type { ChampionDefinition } from "../game/champions/types";

export const MATCH_OPENING_DURATION_MS = 4500;

type IntroChampion = Pick<ChampionDefinition, "name" | "imageUrl" | "introLineOne">;

export type AiMatchOpening = {
  gameId: string;
  startedAt: number;
  gameplayStartsAt: number;
  self: MatchIntroPlayer;
  opponent: MatchIntroPlayer;
  firstSpeaker: "self" | "opponent" | null;
};

export function createAiMatchOpening(
  gameId: string,
  playerName: string,
  opponentName: string,
  playerChampion: IntroChampion,
  opponentChampion: IntroChampion,
  startedAt: number,
): AiMatchOpening {
  const selfLine = playerChampion.introLineOne?.trim() || null;
  const opponentLine = opponentChampion.introLineOne?.trim() || null;
  return {
    gameId,
    startedAt,
    gameplayStartsAt: startedAt + MATCH_OPENING_DURATION_MS,
    self: {
      displayName: playerName,
      championName: playerChampion.name,
      portraitUrl: playerChampion.imageUrl ?? null,
      dialogueLine: selfLine,
    },
    opponent: {
      displayName: opponentName,
      championName: opponentChampion.name,
      portraitUrl: opponentChampion.imageUrl ?? null,
      dialogueLine: opponentLine,
    },
    firstSpeaker: selfLine ? "self" : opponentLine ? "opponent" : null,
  };
}

export function isAiMatchOpeningActive(
  opening: AiMatchOpening | null,
  gameId: string,
  now: number,
): boolean {
  return opening?.gameId === gameId && now < opening.gameplayStartsAt;
}