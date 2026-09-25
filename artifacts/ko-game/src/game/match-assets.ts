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

/** Preload portraits used in the match UI. Card images load when their cards appear. */
export function preloadMatchAssets(
  _definitions: readonly CardDefinition[],
  champions: readonly ChampionDefinition[],
): void {
  for (const champion of champions) {
    preload(champion.imageUrl);
  }
}
