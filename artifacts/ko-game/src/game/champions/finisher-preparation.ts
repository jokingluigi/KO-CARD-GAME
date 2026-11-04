import type { ChampionQuest } from "./types";
/** Preparation still resolves the original reward until authored finishers are approved. */
export function preparationCompletionReward(
  quest: ChampionQuest,
): ChampionQuest["reward"] {
  return quest.reward;
}
