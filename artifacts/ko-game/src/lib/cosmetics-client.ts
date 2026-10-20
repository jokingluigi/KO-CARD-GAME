import {
  emptyCosmetics,
  type CosmeticItem,
  type CosmeticLoadout,
} from "@workspace/cosmetics";
export type CosmeticCardPreview = {
  id: string;
  name: string;
  cost: number;
  attack: number;
  health: number;
  text: string;
  imageUrl: string | null;
  rarity: "NORMAL" | "EPIC" | "LEGENDARY" | "CHAMPION" | "TOKEN";
};
export type CosmeticChampionPreview = {
  id: string;
  name: string;
  imageUrl: string | null;
};
export type CosmeticInventory = {
  owned: Array<{ item: CosmeticItem; acquiredAt: string }>;
  loadout: CosmeticLoadout;
  cards?: CosmeticCardPreview[];
  champions?: CosmeticChampionPreview[];
};
export async function cosmeticsRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api${path}`,
    {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: init?.signal ?? AbortSignal.timeout(8000),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.message ?? "꾸미기 정보를 불러오지 못했습니다.");
  return body;
}
export const fetchCosmetics = () =>
  cosmeticsRequest<CosmeticInventory>("/cosmetics");
export async function optionalCosmetics() {
  try {
    return (await fetchCosmetics()).loadout;
  } catch {
    return emptyCosmetics();
  }
}
export async function equipCosmetic(slot: string, cosmeticId: string | null) {
  return (
    await cosmeticsRequest<{ loadout: CosmeticLoadout }>(
      "/cosmetics/equipment",
      { method: "PUT", body: JSON.stringify({ slot, cosmeticId }) },
    )
  ).loadout;
}
