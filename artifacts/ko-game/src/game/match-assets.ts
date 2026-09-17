import type { CardDefinition } from "./cards/types";
import type { ChampionDefinition } from "./champions/types";

const requested = new Set<string>();

function preload(url: string | null | undefined): void {
  if (!url || requested.has(url) || typeof Image === "undefined") return;
  requested.add(url);
  const image = new Image();
  image.decoding = "async";
  image.loading = "eager";
  image.src = url;
}

/** Preloads only assets present in the current match snapshot. */
export function preloadMatchAssets(
  definitions: readonly CardDefinition[],
  champions: readonly ChampionDefinition[],
): void {
  for (const definition of definitions) {
    preload(definition.imageUrl);
  }
  for (const champion of champions) {
    preload(champion.imageUrl);
    if (champion.questCompletedPortraitEnabled) {
      preload(champion.questCompletedPortraitUrl);
    }
  }
}