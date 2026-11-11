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
  finisherId?: string;
}) {
  const equipped =
    input.loadout?.skins?.[skinKey("CHAMPION_SKIN", input.championId)];
  const item =
    equipped?.type === "CHAMPION_SKIN" && equipped.targetId === input.championId
      ? equipped
      : undefined;
  const root = parseBattleSprite(item ? item.imageAssets.__battle : input.base);
  const choice = input.finisherId
    ? root?.finishers?.[input.finisherId]
    : undefined;
  const config = choice?.sprite?.frames.default
    ? {
        ...root!,
        awakening: "REPLACE" as const,
        awakened: choice.sprite.awakened?.frames.default
          ? choice.sprite.awakened
          : choice.sprite,
      }
    : root;
  const regular = item ? championSkinArtwork(item.imageAssets) : input.normal;
  const awake =
    choice?.portrait?.url ??
    (item ? item.imageAssets.awakened : input.awakenedPortrait);
  // KEEP preserves this skin's normal look. No manifest means its existing art is preferred.
  const useAwake =
    input.awakened &&
    (Boolean(choice?.portrait) || !config || config.awakening === "REPLACE");
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
    portraitFrame: choice?.portrait,
    motionDefaults: parseBattleSprite(input.base)?.motion,
    id:
      (item?.id ?? `default:${input.championId}`) +
      (input.finisherId ? `:finisher:${input.finisherId}` : ""),
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
    const defaultFrame = selectSpriteFrame(skin.config, {
      awakened: state.awakened,
      low: false,
      reaction: "IDLE",
    });
    if (defaultFrame && !candidates.some((c) => c.url === defaultFrame.url))
      candidates.push({
        url: defaultFrame.url,
        frame: defaultFrame,
      });
  }
  for (const url of skin.illustrations)
    if (!candidates.some((c) => c.url === url))
      candidates.push({
        url,
        ...(url === skin.portraitFrame?.url
          ? { frame: skin.portraitFrame }
          : {}),
      });
  return candidates;
}
