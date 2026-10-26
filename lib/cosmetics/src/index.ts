/** Presentation-only data. Never feed these assets into the combat engine. */
export const COSMETIC_TYPES = [
  "CHAMPION_SKIN",
  "CARD_SKIN",
  "CARD_BACK",
  "IMAGE_EMOTE",
] as const;
export type CosmeticType = (typeof COSMETIC_TYPES)[number];
export type CosmeticAssets = Partial<
  Record<"art" | "portrait" | "intro" | "awakened" | `token:${string}`, string>
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
  // Each optional champion display slot falls back independently, never to an unrelated slot.
  return item?.type === type && item.targetId === id
    ? item.imageAssets?.[context] || original
    : original;
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
