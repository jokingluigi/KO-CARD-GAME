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
  quantity: number;
  status: string;
};
export type CollectionChampion = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  maxHealth: number;
  status: string;
};
export type Collection = { cards: CollectionCard[]; champions: CollectionChampion[] };
export type Pack = {
  id: string; name: string; description: string; cardsPerPack: number;
  normalRate: number; legendaryRate: number; championRate: number;
  imageUrl: string | null;
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
export const fetchPacks = () => request<{ packs: Pack[] }>("/packs");
export const openPack = (id: string) => request<{ rewards: Array<Record<string, unknown>> }>(`/packs/${encodeURIComponent(id)}/open`, { method: "POST" });