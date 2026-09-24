export type CollectionCard = {
  id: string;
  name: string;
  rarity: string;
  cardType: string;
  text: string;
  tags?: string[];
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
  owned: boolean;
  obtainedAt: string | null;
};
export type Collection = {
  cards: CollectionCard[];
  craftableCards: CollectionCard[];
  champions: CollectionChampion[];
  prismBalance: number;
  championPrismBalance: number;
  championPrismSetting: ChampionPrismSetting;
  prismSettings: PrismSetting[];
  isTestAccount: boolean;
};
export type ChampionPrismSetting = {
  craftCost: number | null;
  duplicateReward: number | null;
  configured: boolean;
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
const base = `${(import.meta.env?.BASE_URL ?? "").replace(/\/$/, "")}/api`;
export class CollectionRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "CollectionRequestError";
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: "include", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new CollectionRequestError(body.message ?? "요청을 처리하지 못했습니다.", response.status);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
export const fetchCollection = () => request<Collection>("/collection");
export const craftCard = (cardDefinitionId: string) => request<{
  prismBalance: number;
  quantity: number;
  card: CollectionCard;
}>(`/prism/craft/${encodeURIComponent(cardDefinitionId)}`, { method: "POST" });
export const craftChampion = (championDefinitionId: string) => request<{
  championPrismBalance: number;
  owned: true;
  champion: CollectionChampion;
}>(`/prism/champion/craft/${encodeURIComponent(championDefinitionId)}`, { method: "POST" });
export const disenchantCard = (cardDefinitionId: string, quantity = 1) => request<{
  prismBalance: number;
  quantity: number;
  dismantledQuantity: number;
  reward: number;
  card: CollectionCard;
}>(`/prism/disenchant/${encodeURIComponent(cardDefinitionId)}`, {
  method: "POST",
  body: JSON.stringify({ quantity }),
});
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
  championPrismReward?: number;
};
export const openPack = (id: string, idempotencyKey: string) => request<{ rewards: PackReward[] }>(`/packs/${encodeURIComponent(id)}/open`, {
  method: "POST",
  headers: { "Idempotency-Key": idempotencyKey },
});
export type BulkPackOpening = { rewards: PackReward[] };
export type BulkPackOpenResult = { quantity: number; openings: BulkPackOpening[] };
export type BulkOpenIntention = { packId: string; quantity: number; key: string };
export type AggregatedPackReward = { key: string; reward: PackReward; quantity: number };
export type BulkOpenIntentionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const MAX_BULK_PACK_OPEN_QUANTITY = 100;
export const BULK_OPEN_STORAGE_KEY = "ko-game:unresolved-pack-open:v1";

export function getBulkOpenStorageKey(userId: string): string {
  return `${BULK_OPEN_STORAGE_KEY}:${encodeURIComponent(userId)}`;
}

export function readBulkOpenIntention(storage: BulkOpenIntentionStorage, userId: string): BulkOpenIntention | null {
  try {
    const serialized = storage.getItem(getBulkOpenStorageKey(userId));
    if (!serialized) return null;
    const intention = JSON.parse(serialized) as Partial<BulkOpenIntention>;
    if (
      typeof intention.packId !== "string"
      || !intention.packId
      || typeof intention.quantity !== "number"
      || !isValidBulkOpenQuantity(intention.quantity)
      || typeof intention.key !== "string"
      || !intention.key
    ) return null;
    return { packId: intention.packId, quantity: intention.quantity, key: intention.key };
  } catch {
    return null;
  }
}

export function saveBulkOpenIntention(storage: BulkOpenIntentionStorage, userId: string, intention: BulkOpenIntention): boolean {
  try {
    storage.setItem(getBulkOpenStorageKey(userId), JSON.stringify(intention));
    return true;
  } catch {
    return false;
  }
}

export function clearBulkOpenIntention(storage: BulkOpenIntentionStorage, userId: string): boolean {
  try {
    storage.removeItem(getBulkOpenStorageKey(userId));
    return true;
  } catch {
    return false;
  }
}

export function isDefinitivePackOpenRejection(error: unknown): boolean {
  return error instanceof CollectionRequestError
    && [400, 401, 403, 404, 422].includes(error.status);
}

export function getBulkOpenQuantities(available: number): number[] {
  if (!Number.isInteger(available) || available < 1) return [];
  return [1, 5, 10].filter((quantity) => quantity <= available);
}

export function isValidBulkOpenQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_BULK_PACK_OPEN_QUANTITY;
}

export function getBulkOpenIntention(
  previous: BulkOpenIntention | null,
  packId: string,
  quantity: number,
  createKey: () => string,
): BulkOpenIntention {
  if (previous) {
    if (previous.packId === packId && previous.quantity === quantity) return previous;
    throw new Error("이전 팩 개봉 결과를 먼저 복구해야 새 개봉을 시작할 수 있습니다.");
  }
  return { packId, quantity, key: createKey() };
}

export function aggregatePackRewards(rewards: PackReward[]): AggregatedPackReward[] {
  const aggregated = new Map<string, AggregatedPackReward>();
  for (const [index, reward] of rewards.entries()) {
    const definitionId = reward.rewardType === "SKIN"
      ? reward.skinDefinitionId ?? reward.skin?.id ?? `${reward.rewardType}-${index}`
      : reward.rewardType === "CHAMPION_UNLOCK"
        ? reward.championDefinitionId ?? reward.champion?.id ?? `${reward.rewardType}-${index}`
        : reward.cardDefinitionId ?? reward.card?.id ?? `${reward.rewardType}-${index}`;
    const key = `${reward.rewardType}:${definitionId}`;
    const current = aggregated.get(key);
    if (current) current.quantity += 1;
    else aggregated.set(key, { key, reward, quantity: 1 });
  }
  return [...aggregated.values()];
}

export async function openPacksBulk(id: string, quantity: number, idempotencyKey: string): Promise<BulkPackOpenResult> {
  if (!isValidBulkOpenQuantity(quantity)) throw new Error(`개봉 수량은 1~${MAX_BULK_PACK_OPEN_QUANTITY} 사이의 정수여야 합니다.`);
  return request<BulkPackOpenResult>(`/packs/${encodeURIComponent(id)}/open-bulk`, {
    method: "POST",
    body: JSON.stringify({ quantity }),
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

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