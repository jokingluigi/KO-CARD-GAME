import {
  championSkinArtwork,
  cosmeticAssetDisplay,
  skinKey,
  type CosmeticLoadout,
} from "./index";
import {
  parseBattleSprite,
  selectSpriteFrame,
  type BattleSprite,
  type SpriteEvent,
} from "./battle-sprite";
/** Default appearance is a logical skin, not a new inventory grant/catalog row. */
export function championSpriteSkin(input: {
  championId: string;
  loadout?: CosmeticLoadout;
  base: unknown;
  normal?: string | null;
  awakenedPortrait?: string | null;
  awakened: boolean;
}) {
  const equipped =
    input.loadout?.skins?.[skinKey("CHAMPION_SKIN", input.championId)];
  const item =
    equipped?.type === "CHAMPION_SKIN" && equipped.targetId === input.championId
      ? equipped
      : undefined;
  const config = parseBattleSprite(
    item ? item.imageAssets.__battle : input.base,
  );
  const regular = item ? championSkinArtwork(item.imageAssets) : input.normal;
  const awake = item ? item.imageAssets.awakened : input.awakenedPortrait;
  // KEEP preserves this skin's normal look. No manifest means its existing art is preferred.
  const useAwake =
    input.awakened && (!config || config.awakening === "REPLACE");
  const illustrations = [
    ...(useAwake && awake ? [awake] : []),
    ...(regular ? [regular] : []),
    ...(!item && input.awakened && input.awakenedPortrait
      ? [input.awakenedPortrait]
      : []),
    ...(!item && input.normal ? [input.normal] : []),
  ];
  const display = (url: string) =>
    item && (url === regular || url === awake)
      ? cosmeticAssetDisplay(
          item.imageAssets,
          url === awake && useAwake
            ? "awakened"
            : item.imageAssets.art
              ? "art"
              : item.imageAssets.portrait
                ? "portrait"
                : "intro",
        )
      : undefined;
  return {
    motionDefaults: parseBattleSprite(input.base)?.motion,
    id: item?.id ?? `default:${input.championId}`,
    config,
    illustrations: [...new Set(illustrations)],
    display,
  };
}
export function championSpriteCandidates(
  skin: ReturnType<typeof championSpriteSkin>,
  state: {
    awakened: boolean;
    low: boolean;
    outcome?: "VICTORY" | "DEFEAT";
    reaction: SpriteEvent;
    selfDamage?: boolean;
    emote?: string;
  },
) {
  const candidates: Array<{
    url: string;
    frame?: import("./battle-sprite").SpriteFrame;
  }> = [];
  if (skin.config) {
    const frame = selectSpriteFrame(skin.config, state);
    if (frame) candidates.push({ url: frame.url, frame });
    const set =
      state.awakened && skin.config.awakening === "REPLACE"
        ? skin.config.awakened!
        : skin.config;
    if (
      set.frames.default &&
      !candidates.some((c) => c.url === set.frames.default.url)
    )
      candidates.push({
        url: set.frames.default.url,
        frame: set.frames.default,
      });
  }
  for (const url of skin.illustrations)
    if (!candidates.some((c) => c.url === url)) candidates.push({ url });
  return candidates;
}
