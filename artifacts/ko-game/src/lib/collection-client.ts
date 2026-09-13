export type CollectionCard = {
  id: string;
  name: string;
  rarity: string;
  cardType: string;
  text: string;
  attack: number;
  health: number;
  cost: number;
  imageUrl: string | null;
  imageDisplayMode: "COVER" | "CONTAIN" | "CUSTOM";
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
  quantity: number;
  status: string;
};
export type PrismRarity = "NORMAL" | "LEGENDARY";
export type PrismSetting = {
  rarity: PrismRarity;
  craftCost: number | null;
  disenchantReward: number | null;
  configured: boolean;
};
export type CollectionChampion = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  maxHealth: number;
  abilityName: string;
  abilityCost: number;
  abilityText: string;
  hasQuest: boolean;
  questName: string | null;
  questText: string | null;
  questProgressRequired: number | null;
  questRewardText: string | null;
  upgradedAbilityName: string | null;
  upgradedAbilityCost: number | null;
  upgradedAbilityText: string | null;
  status: string;
};
export type Collection = {
  cards: CollectionCard[];
  craftableCards: CollectionCard[];
  champions: CollectionChampion[];
  prismBalance: number;
  prismSettings: PrismSetting[];
};
export type Pack = {
  id: string; name: string; description: string; cardsPerPack: number;
  normalRate: number; legendaryRate: number; championRate: number;
  imageUrl: string | null; quantity: number;
};
const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: "include", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
export const fetchCollection = () => request<Collection>("/collection");
export const craftCard = (cardDefinitionId: string) => request<{
  prismBalance: number;
  quantity: number;
  card: CollectionCard;
}>(`/prism/craft/${encodeURIComponent(cardDefinitionId)}`, { method: "POST" });
export const disenchantCard = (cardDefinitionId: string) => request<{
  prismBalance: number;
  quantity: number;
  card: CollectionCard;
}>(`/prism/disenchant/${encodeURIComponent(cardDefinitionId)}`, { method: "POST" });
export const fetchPacks = () => request<{ packs: Pack[] }>("/packs");
export type PackReward = {
  rewardType: "NORMAL_CARD" | "LEGENDARY_CARD" | "CHAMPION_UNLOCK";
  cardDefinitionId?: string;
  championDefinitionId?: string;
  card?: CollectionCard;
  champion?: CollectionChampion;
  alreadyOwned?: boolean;
};
export const openPack = (id: string) => request<{ rewards: PackReward[] }>(`/packs/${encodeURIComponent(id)}/open`, { method: "POST" });

export type ShopListing = {
  id: string;
  packDefinitionId: string;
  price: number;
  isActive: number;
  displayOrder: number;
  pack: Pack;
  quantity: number;
};
export type ShopData = { currency: number; listings: ShopListing[] };
export const fetchShop = () => request<ShopData>("/shop");
export const purchaseShopListing = (listingId: string, quantity = 1) => request<{
  currency: number;
  quantity: number;
  pack: Pack;
}>(`/shop/${encodeURIComponent(listingId)}/purchase`, {
  method: "POST",
  body: JSON.stringify({ quantity }),
});