import type { MatchIntroPlayer } from "../components/online-match-intro";
import type { ChampionDefinition } from "../game/champions/types";

export type MatchIntroDialogue = {playerOneLine:string|null;playerTwoLine:string|null;firstSpeaker:"PLAYER_ONE"|"PLAYER_TWO"|null};

export const MATCH_OPENING_DURATION_MS = 4500;

type IntroChampion = Pick<ChampionDefinition, "name" | "imageUrl" | "introLineOne"> & {originalPortraitUrl?:string|null};

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
  dialogue?: MatchIntroDialogue,
): AiMatchOpening {
  const selfLine = dialogue ? dialogue.playerOneLine : playerChampion.introLineOne?.trim() || null;
  const opponentLine = dialogue ? dialogue.playerTwoLine : opponentChampion.introLineOne?.trim() || null;
  return {
    gameId,
    startedAt,
    gameplayStartsAt: startedAt + MATCH_OPENING_DURATION_MS,
    self: {
      displayName: playerName,
      championName: playerChampion.name,
      portraitUrl: playerChampion.imageUrl ?? null,
      originalPortraitUrl:playerChampion.originalPortraitUrl,
      dialogueLine: selfLine,
    },
    opponent: {
      displayName: opponentName,
      championName: opponentChampion.name,
      portraitUrl: opponentChampion.imageUrl ?? null,
      dialogueLine: opponentLine,
    },
    firstSpeaker: dialogue ? (dialogue.firstSpeaker === "PLAYER_ONE" ? "self" : dialogue.firstSpeaker === "PLAYER_TWO" ? "opponent" : null) : selfLine ? "self" : opponentLine ? "opponent" : null,
  };
}

export function isAiMatchOpeningActive(
  opening: AiMatchOpening | null,
  gameId: string,
  now: number,
): boolean {
  return opening?.gameId === gameId && now < opening.gameplayStartsAt;
}