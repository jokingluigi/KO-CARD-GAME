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

/** Bound the visual wait without holding a match indefinitely on a broken download. */
export async function prepareIntroPortraits(urls:readonly (string|null|undefined)[],timeoutMs=8000):Promise<void> {
 if(typeof Image==='undefined')return;
 await Promise.all([...new Set(urls.filter((url):url is string=>Boolean(url)))].map(url=>new Promise<void>(resolve=>{
  const image=new Image();let done=false;
  const finish=()=>{if(done)return;done=true;clearTimeout(timer);image.onload=null;image.onerror=null;resolve();};
  const timer=setTimeout(finish,timeoutMs);image.onload=finish;image.onerror=finish;image.src=url;
  if(image.complete&&image.naturalWidth)finish();
 })));
}
