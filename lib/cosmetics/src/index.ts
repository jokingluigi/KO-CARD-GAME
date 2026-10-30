/** Presentation-only data. Never feed these assets into the combat engine. */
export const COSMETIC_TYPES = [
  "CHAMPION_SKIN",
  "CARD_SKIN",
  "CARD_BACK",
  "IMAGE_EMOTE",
] as const;
export type CosmeticType = (typeof COSMETIC_TYPES)[number];
export type CosmeticAssets = Partial<
  Record<
    "art" | "portrait" | "intro" | "awakened" | "__display" | "__battle" | `token:${string}`,
    string
  >
>;
export type CosmeticItem = {
  id: string;
  type: CosmeticType;
  name: string;
  description: string;
  targetId: string | null;
  imageAssets: CosmeticAssets;
  isActive: boolean;
  sortOrder: number;
  legacySkinId?: string;
  publicationStatus?: "DRAFT" | "PUBLISHED" | "DISABLED";
};
export type CosmeticLoadout = {
  version: 1;
  skins: Record<string, CosmeticItem>;
  cardBack: CosmeticItem | null;
  emotes: Array<CosmeticItem | null>;
};
export type MatchCosmetics = Record<string, CosmeticLoadout>;
export type ImageEmoteEvent = {
  type: "IMAGE_EMOTE";
  matchId: string;
  playerId: string;
  requestId: string;
  itemId: string;
  imageUrl: string;
  name: string;
  expiresAt: number;
};
export const emptyCosmetics = (): CosmeticLoadout => ({
  version: 1,
  skins: {},
  cardBack: null,
  emotes: [null, null, null, null],
});
export function skinKey(type: CosmeticType, targetId: string | null) {
  return type === "CARD_BACK"
    ? "back"
    : `${type === "CHAMPION_SKIN" ? "champion" : "card"}:${targetId}`;
}
/** One champion image is shared by collection, battle HUD and VS intro.
 * Legacy slot-only records remain usable without a database rewrite.
 */
export function championSkinArtwork(assets: CosmeticAssets | null | undefined) {
  return assets?.art || assets?.portrait || assets?.intro;
}
export function cosmeticImage(
  loadout: CosmeticLoadout | undefined,
  type: "CHAMPION_SKIN" | "CARD_SKIN",
  id: string,
  context: keyof CosmeticAssets,
  original: string | null | undefined,
) {
  const item = loadout?.skins?.[skinKey(type, id)];
  // Token artwork is included in the equipped champion skin entitlement. Never changes card data.
  if (type === "CARD_SKIN" && context === "art") {
    for (const [slot, skin] of Object.entries(loadout?.skins ?? {})) {
      if (
        skin?.type === "CHAMPION_SKIN" &&
        skin.targetId &&
        slot === skinKey("CHAMPION_SKIN", skin.targetId)
      ) {
        const token = skin.imageAssets?.[`token:${id}`];
        if (token && validImageUrl(token)) return token;
      }
    }
  }
  if (item?.type !== type || item.targetId !== id) return original;
  if (
    type === "CHAMPION_SKIN" &&
    ["art", "portrait", "intro"].includes(context)
  )
    return championSkinArtwork(item.imageAssets) || original;
  // Awakening and token art are distinct; never substitute the regular portrait here.
  return item.imageAssets?.[context] || original;
}
export function validImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  if (
    /^\/api\/storage\/objects\/uploads\/cosmetics\/[a-zA-Z0-9._-]+$/.test(value)
  )
    return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Stored inside the existing JSON asset map; URLs remain unchanged and cacheable. */
export type CosmeticDisplaySettings = {
  imageDisplayMode: "CONTAIN" | "COVER" | "CUSTOM";
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
};
export function parseCosmeticDisplay(
  value: unknown,
): Record<string, CosmeticDisplaySettings> | null {
  if (value === undefined) return {};
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const data: unknown = JSON.parse(value);
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Object.keys(data).length > 8
    )
      return null;
    const result: Record<string, CosmeticDisplaySettings> = {};
    for (const [slot, raw] of Object.entries(data)) {
      if (
        !["art", "portrait", "intro", "awakened"].includes(slot) &&
        !/^token:[a-zA-Z0-9_-]{1,256}$/.test(slot)
      )
        return null;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const s = raw as CosmeticDisplaySettings;
      if (
        !["CONTAIN", "COVER", "CUSTOM"].includes(s.imageDisplayMode) ||
        !Number.isFinite(s.imageScale) ||
        s.imageScale < 0.5 ||
        s.imageScale > 2 ||
        !Number.isFinite(s.imagePositionX) ||
        s.imagePositionX < 0 ||
        s.imagePositionX > 100 ||
        !Number.isFinite(s.imagePositionY) ||
        s.imagePositionY < 0 ||
        s.imagePositionY > 100
      )
        return null;
      result[slot] = {
        imageDisplayMode: s.imageDisplayMode,
        imageScale: s.imageScale,
        imagePositionX: s.imagePositionX,
        imagePositionY: s.imagePositionY,
      };
    }
    return result;
  } catch {
    return null;
  }
}
export function cosmeticAssetDisplay(
  assets: CosmeticAssets | undefined,
  context: string,
) {
  return parseCosmeticDisplay(assets?.__display)?.[context];
}
export function cosmeticImageSettings(
  loadout: CosmeticLoadout | undefined,
  type: "CHAMPION_SKIN" | "CARD_SKIN",
  id: string,
  context: keyof CosmeticAssets,
) {
  if (type === "CARD_SKIN" && context === "art") {
    for (const [slot, skin] of Object.entries(loadout?.skins ?? {}))
      if (
        skin.type === "CHAMPION_SKIN" &&
        skin.targetId &&
        slot === skinKey("CHAMPION_SKIN", skin.targetId) &&
        validImageUrl(skin.imageAssets[`token:${id}`])
      )
        return cosmeticAssetDisplay(skin.imageAssets, `token:${id}`);
  }
  const item = loadout?.skins?.[skinKey(type, id)];
  if (item?.type !== type || item.targetId !== id) return undefined;
  const slot =
    type === "CHAMPION_SKIN" && ["art", "portrait", "intro"].includes(context)
      ? item.imageAssets.art
        ? "art"
        : item.imageAssets.portrait
          ? "portrait"
          : "intro"
      : context;
  return item.imageAssets[slot]
    ? cosmeticAssetDisplay(item.imageAssets, slot)
    : undefined;
}
export * from './battle-sprite';
export * from './champion-sprite-skin';

export * from './pack-probabilities';
