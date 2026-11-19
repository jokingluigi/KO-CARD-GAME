import { useEffect } from "react";
import {
  parseBattleSprite,
  skinKey,
  type MatchCosmetics,
} from "@workspace/cosmetics";
import type { GameState } from "../game/types/game-state";
import type { GameMediaCatalog } from "../game/media";
import { audioManager } from "./audio-manager";

/** Only visible/imminent assets; online opponents' hidden hands are never inspected. */
export function matchMusicUrls(
  state: GameState | null | undefined,
  media: GameMediaCatalog,
  cosmetics?: MatchCosmetics,
): string[] {
  if (!state) return [];
  if (state.status === "FINISHED") return [...new Set(Object.values(media.resultMusic ?? {}).flatMap(track => track?.assetUrl ? [track.assetUrl] : []))];
  const urls: (string | null | undefined)[] = [
    media.bgms.find((m) => m.id === state.bgmId)?.assetUrl,
  ];
  for (const player of state.players) {
    const champion = player.champion;
    if (champion?.questCompleteAudioEnabled)
      urls.push(champion.questCompleteAudioUrl);
    const skin =
      champion &&
      cosmetics?.[player.id]?.skins?.[skinKey("CHAMPION_SKIN", champion.id)];
    for (const sprite of [
      parseBattleSprite(skin?.imageAssets.__battle),
      parseBattleSprite(champion?.presentationLines?.BATTLE_SPRITE),
    ]) {
      for (const finisher of Object.values(sprite?.finishers ?? {}))
        urls.push(finisher.music?.assetUrl);
    }
    for (const card of [
      ...(Array.isArray(player.hand) ? player.hand : []),
      ...player.board,
    ]) {
      if (card?.entranceAudioEnabled) urls.push(card.entranceAudioUrl);
    }
  }
  urls.push(
    ...Object.values(media.resultMusic ?? {}).map((track) => track?.assetUrl),
  );
  return [...new Set(urls.filter((url): url is string => !!url))];
}

export function useMatchMusicPreload(
  state: GameState | null | undefined,
  media: GameMediaCatalog,
  cosmetics?: MatchCosmetics,
) {
  const urls = matchMusicUrls(state, media, cosmetics);
  const key = JSON.stringify(urls);
  useEffect(() => {
    audioManager.preloadMusic(JSON.parse(key), true);
  }, [key]);
}
