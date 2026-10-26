import { loadPortrait } from './portrait-loading';
import type { CardDefinition } from "./cards/types";
import type { ChampionDefinition } from "./champions/types";

/** Preload portraits used in the match UI. Card images load when their cards appear. */
export function preloadMatchAssets(
  _definitions: readonly CardDefinition[],
  champions: readonly ChampionDefinition[],
): void {
  for (const champion of champions) {
    if(champion.imageUrl) void loadPortrait(champion.imageUrl);
  }
}

/** Bound the visual wait without holding a match indefinitely on a broken download. */
export async function prepareIntroPortraits(urls:readonly (string|null|undefined)[],timeoutMs=8000):Promise<void> {
 await Promise.all([...new Set(urls.filter((url):url is string=>Boolean(url)))].map(url=>loadPortrait(url,timeoutMs)));
}
