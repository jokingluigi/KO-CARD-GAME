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
  entranceAudioUrl: string | null;
  entranceAudioVolume: number;
  entranceAudioEnabled: boolean;
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
  imageDisplayMode: "COVER" | "CONTAIN" | "CUSTOM";
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
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
  questCompleteAudioUrl: string | null;
  questCompleteAudioVolume: number;
  questCompleteAudioEnabled: boolean;
  status: string;
};
export type Collection = {
  cards: CollectionCard[];
  craftableCards: CollectionCard[];
  champions: CollectionChampion[];
  prismBalance: number;
  prismSettings: PrismSetting[];
  isTestAccount: boolean;
};
export type Pack = {
  id: string; name: string; description: string; cardsPerPack: number;
  normalRate: number; legendaryRate: number; championRate: number; skinChance: number;
  imageUrl: string | null; quantity: number;
};
export type PackDetailCard = Pick<CollectionCard, "id" | "name" | "cardType" | "cost" | "attack" | "health" | "text" | "rarity" | "imageUrl" | "imageDisplayMode" | "imageScale" | "imagePositionX" | "imagePositionY"> & {
  individualProbability: number;
};
export type PackDetailChampion = Pick<CollectionChampion, "id" | "name" | "description" | "imageUrl" | "imageDisplayMode" | "imageScale" | "imagePositionX" | "imagePositionY" | "maxHealth" | "abilityName" | "abilityCost" | "abilityText"> & {
  individualProbability: number;
};
export type PackDetailSkin = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  imageDisplayMode: "COVER" | "CONTAIN" | "CUSTOM";
  imageScale: number;
  imagePositionX: number;
  imagePositionY: number;
  card: PackDetailCard;
  individualProbability: number;
};
export type PackDetails = {
  valid: boolean;
  invalidReasons: string[];
  normalCards: PackDetailCard[];
  legendaryCards: PackDetailCard[];
  champions: PackDetailChampion[];
  skins: PackDetailSkin[];
};
export const fetchPackDetails = (id: string) => request<{ pack: Pack; details: PackDetails }>(
  `/packs/${encodeURIComponent(id)}/details`,
);
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
  rewardType: "NORMAL_CARD" | "LEGENDARY_CARD" | "CHAMPION_UNLOCK" | "SKIN";
  cardDefinitionId?: string;
  championDefinitionId?: string;
  card?: CollectionCard;
  champion?: CollectionChampion;
  skinDefinitionId?: string;
  skin?: {
    id: string;
    cardDefinitionId: string;
    name: string;
    description: string;
    imageUrl: string | null;
    status: string;
  };
  alreadyOwned?: boolean;
};
export const openPack = (id: string) => request<{ rewards: PackReward[] }>(`/packs/${encodeURIComponent(id)}/open`, { method: "POST" });

export type ShopListing = {
  id: string;
  name: string;
  description: string;
  imageAssetId: string | null;
  imageUrl: string | null;
  packDefinitionId: string;
  price: number;
  packQuantity: number;
  ownedQuantity: number;
  isActive: number;
  displayOrder: number;
  pack: Pack;
};
export type ShopData = { currencyBalance: number; currencyDisplayName: string; listings: ShopListing[]; isTestAccount: boolean };
export const fetchShop = () => request<ShopData>("/shop");
export const purchaseShopListing = (listingId: string, quantity = 1) => request<{
  currencyBalance: number;
  packQuantity: number;
  ownedQuantity: number;
  pack: Pack;
}>(`/shop/${encodeURIComponent(listingId)}/purchase`, {
  method: "POST",
  body: JSON.stringify({}),
});