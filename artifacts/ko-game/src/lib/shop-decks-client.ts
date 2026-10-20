import type { CardDetailRecord } from "@/components/card-detail-dialog";
export type ShopDeckCard = CardDetailRecord & {
  isToken: boolean;
  isChampionToken: boolean;
  status: string;
};
export type ShopDeckChampion = {
  id: string;
  name: string;
  imageUrl: string | null;
  status?: string;
};
export type ShopDeckProduct = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  cardDefinitionIds: string[];
  price: number;
  recommendedChampionId: string | null;
  includeChampion: boolean;
  allowUnpublished: boolean;
  enabled: boolean;
  displayOrder: number;
  cards?: ShopDeckCard[];
  recommendedChampion?: ShopDeckChampion | null;
  purchase?: { deckId: string; createdAt: string } | null;
  unavailable?: string | null;
};
export type ShopDeckCatalog = {
  items: ShopDeckProduct[];
  cards: ShopDeckCard[];
  champions: ShopDeckChampion[];
};
export async function shopDeckRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(
    `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api${path}`,
    {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: init?.signal ?? AbortSignal.timeout(15000),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "완성 덱 요청에 실패했습니다.");
  return data;
}
export function deckCounts(ids: readonly string[]) {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
