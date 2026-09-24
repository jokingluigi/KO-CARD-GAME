import type { ChampionDefinition } from "@workspace/game-engine";

export type IntroInteraction = {
  championOneId: string;
  championTwoId: string;
  lineOne: string | null;
  lineTwo: string | null;
  firstSpeaker: string;
  status: string;
};

export type ResolvedIntro = {
  lineOne: string | null;
  lineTwo: string | null;
  firstSpeaker: "ONE" | "TWO" | null;
};

export type SeatMappedIntro = {
  playerOneLine: string | null;
  playerTwoLine: string | null;
  firstSpeaker: "PLAYER_ONE" | "PLAYER_TWO" | null;
};

export type IntroStatus = "DRAFT" | "PUBLISHED" | "DISABLED";
export function normalizeIntroStatus(value: unknown): IntroStatus | null {
  return value === "DRAFT" || value === "PUBLISHED" || value === "DISABLED" ? value : null;
}

export function canonicalChampionPair(firstId: string, secondId: string): [string, string] | null {
  if (!firstId || !secondId || firstId === secondId) return null;
  return firstId < secondId ? [firstId, secondId] : [secondId, firstId];
}

export function mapIntroToSeats(
  playerOneChampionId: string,
  playerTwoChampionId: string,
  intro: ResolvedIntro,
): SeatMappedIntro {
  const pair = canonicalChampionPair(playerOneChampionId, playerTwoChampionId);
  if (!pair) return { playerOneLine: null, playerTwoLine: null, firstSpeaker: null };

  const canonicalOneIsPlayerOne = playerOneChampionId === pair[0];
  return {
    playerOneLine: canonicalOneIsPlayerOne ? intro.lineOne : intro.lineTwo,
    playerTwoLine: canonicalOneIsPlayerOne ? intro.lineTwo : intro.lineOne,
    firstSpeaker: intro.firstSpeaker === null
      ? null
      : (intro.firstSpeaker === "ONE") === canonicalOneIsPlayerOne
        ? "PLAYER_ONE"
        : "PLAYER_TWO",
  };
}

export function resolveChampionIntro(
  first: ChampionDefinition,
  second: ChampionDefinition,
  interactions: readonly IntroInteraction[],
): ResolvedIntro {
  const pair = canonicalChampionPair(first.id, second.id);
  if (!pair) return { lineOne: null, lineTwo: null, firstSpeaker: null };
  const [oneId, twoId] = pair;
  const one = first.id === oneId ? first : second;
  const two = first.id === twoId ? first : second;
  const relation = interactions.find((item) =>
    item.status === "PUBLISHED" && item.championOneId === one.id && item.championTwoId === two.id);
  if (relation) {
    return {
      lineOne: relation.lineOne?.trim() || null,
      lineTwo: relation.lineTwo?.trim() || null,
      firstSpeaker: relation.firstSpeaker === "TWO" ? "TWO" : "ONE",
    };
  }
  return {
    lineOne: one.id === first.id ? first.introLineOne?.trim() || null : second.introLineOne?.trim() || null,
    lineTwo: one.id === first.id ? second.introLineOne?.trim() || null : first.introLineOne?.trim() || null,
    firstSpeaker: first.introLineOne?.trim() ? (first.id === one.id ? "ONE" : "TWO")
      : second.introLineOne?.trim() ? (second.id === one.id ? "ONE" : "TWO")
        : null,
  };
}